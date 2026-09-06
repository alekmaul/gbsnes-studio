/*
 * compileSnesData.js - the SNES data compiler (M7 phase 1).
 *
 * Turns a denormalized project into appData/src/snes/src/assets.{c,h} in the
 * exact shape the SNES engine consumes (see appData/src/snes/tools/
 * gen-dummy-gfx.js, which this replaces for real projects):
 *
 *   scenes[]        index-based scene blobs
 *   event_ptrs[]    compiled script bytecode (BANK_PTR = far pointer, D4)
 *   string_ptrs[]   NUL-terminated dialogue strings
 *   bg_*_ptrs[]     backgrounds via snesgfx.js (M6): 4bpp tiles + BGR555 palette
 *
 * Script bytecode reuses the shared compiler (compileEntityEvents / scriptBuilder
 * / scriptCommands.js) - opcode numbers are identical to Game Boy and guarded by
 * test/data/compiler/snesScriptCmds.test.js. The only placeholders left to
 * resolve here are the __REPLACE:STRING_* triples, which on SNES become a plain
 * 16-bit index into string_ptrs[] (no banked pointer).
 *
 * Actor sprite sheets: a 1-frame sheet is SPRITE_STATIC; a 3-frame sheet
 * (down/up/side) is SPRITE_ACTOR (direction-only facing); a 6-frame sheet is
 * SPRITE_ACTOR_ANIMATED (walk cycle). Each used sprite slot gets its own
 * 16-colour OBJ palette (spr_pal is the whole OBJ CGRAM image; sprite_pal_for_slot[]
 * says which of the 8 OBJ palettes a slot draws from).
 *
 * Not handled yet: SC_64x64 scenes wider than 32 tiles.
 */
import fs from "fs-extra";
import Path from "path";
import snesgfx from "./snesgfx";
import compileEntityEvents from "./compileEntityEvents";
import { snesFixedAssets } from "./snesFixedAssets";
import { dirDec, moveDec, animSpeedDec } from "./helpers";
import { assetFilename } from "../helpers/gbstudio";
import { projectTemplatesRoot } from "../../consts";
import snesTarget from "./targets/snes";
import migrateProject from "../project/migrateProject";

const EVENT_END = "EVENT_END";

// The BG3 UI graphics (ascii font, nine-slice frame, menu cursor) are project
// assets, same as on Game Boy. Backfill any that are missing from the stock
// sample so an older project still builds, and return the assets/ui dir.
const UI_FILES = ["ascii.png", "frame.png", "cursor.png"];
const ensureSnesUiAssets = async (projectRoot, warnings) => {
  const uiDir = Path.join(projectRoot, "assets", "ui");
  for (const name of UI_FILES) {
    const dest = Path.join(uiDir, name);
    if (!fs.existsSync(dest)) {
      await fs.copy(
        Path.join(projectTemplatesRoot, "gbhtml", "assets", "ui", name),
        dest
      );
      warnings(`assets/ui/${name} was missing, copied the default in`);
    }
  }
  return uiDir;
};

const clampByte = n => Math.max(0, Math.min(255, n | 0));

// __REPLACE:STRING_BANK/HI/LO:<n>  ->  0 / hi(n) / lo(n)   (n = string index)
const resolvePlaceholders = (bytes, where, warnings) =>
  bytes.map(b => {
    if (typeof b === "number") return b & 0xff;
    const m = /^__REPLACE:STRING_(BANK|HI|LO):(\d+)$/.exec(b);
    if (m) {
      const n = Number(m[2]);
      if (m[1] === "BANK") return 0;
      if (m[1] === "HI") return (n >> 8) & 0xff;
      return n & 0xff;
    }
    warnings(`Unresolved placeholder "${b}" in ${where} - emitting 0`);
    return 0;
  });

const cArray = (name, bytes, type = "unsigned char") => {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    lines.push(`    ${bytes.slice(i, i + 16).join(", ")}`);
  }
  return `const ${type} ${name}[${bytes.length}] = {\n${lines.join(",\n")}\n};\n`;
};

const compileSnesData = async (
  rawProjectData,
  { projectRoot = "/tmp", warnings = () => {} } = {}
) => {
  // Idempotent: no-op when the project is already at LATEST_PROJECT_VERSION.
  // Turns legacy EVENT_MATH_* / collision / actor-frame shapes into current ones.
  const projectData = migrateProject(rawProjectData);
  const scenes = projectData.scenes || [];
  const backgrounds = projectData.backgrounds || [];
  const settings = projectData.settings || {};

  if (scenes.length === 0) {
    throw new Error("Project has no scenes");
  }

  const strings = [];
  const variables = [];

  // ---- backgrounds (M6 converter) --------------------------------------
  const bgIndexById = {};
  const bgConverted = [];
  for (let i = 0; i < backgrounds.length; i++) {
    const bg = backgrounds[i];
    bgIndexById[bg.id] = i;
    // eslint-disable-next-line no-await-in-loop
    const conv = await snesgfx.imageToBGData(
      assetFilename(projectRoot, "backgrounds", bg),
      { maxTiles: snesTarget.maxTilesetTiles }
    );
    conv.warnings.forEach(warnings);
    if (conv.tileW > 32 || conv.tileH > 32) {
      warnings(
        `Background '${bg.filename}' is ${conv.tileW}x${conv.tileH} tiles; ` +
          `SNES scenes wider/taller than 32 tiles are not supported yet.`
      );
    }
    bgConverted.push(conv);
  }
  if (bgConverted.length === 0) {
    throw new Error("Project has no backgrounds");
  }

  // ---- actor sprites (M7) --------------------------------------------
  // One shared OBJ sheet, up to SPRITE_SLOTS 16x16 sprites (first frame only).
  // slot k -> OBJ grid tiles 2k, 2k+1, 2k+16, 2k+17 (16-wide grid, 2 rows).
  const SPRITE_SLOTS = 8;
  const spriteSheets = projectData.spriteSheets || [];
  const spriteById = id => spriteSheets.find(s => s.id === id);
  const usedSpriteIds = [];
  const addSprite = id => {
    if (id && spriteById(id) && usedSpriteIds.indexOf(id) === -1) {
      usedSpriteIds.push(id);
    }
  };
  addSprite(settings.playerSpriteSheetId);
  scenes.forEach(sc =>
    (sc.actors || []).forEach(a => addSprite(a.spriteSheetId))
  );
  if (usedSpriteIds.length > SPRITE_SLOTS) {
    warnings(
      `Scene uses ${usedSpriteIds.length} sprite sheets; only the first ` +
        `${SPRITE_SLOTS} are loaded, the rest fall back to slot 0.`
    );
  }
  const spriteSlotById = {};
  usedSpriteIds.slice(0, SPRITE_SLOTS).forEach((id, k) => {
    spriteSlotById[id] = k;
  });
  const slotForActor = id =>
    spriteSlotById[id] !== undefined ? spriteSlotById[id] : 0;

  // ---- dialogue avatars (M5d): TEXT events with an avatarId ------------
  const AVATAR_SLOTS = 8;
  const usedAvatarIds = [];
  const scanAvatars = evs => {
    (evs || []).forEach(ev => {
      if (ev.args && ev.args.avatarId && usedAvatarIds.indexOf(ev.args.avatarId) === -1) {
        usedAvatarIds.push(ev.args.avatarId);
      }
      if (ev.children) {
        Object.keys(ev.children).forEach(k => scanAvatars(ev.children[k]));
      }
    });
  };
  scenes.forEach(sc => {
    scanAvatars(sc.script);
    (sc.actors || []).forEach(a => {
      scanAvatars(a.script);
      scanAvatars(a.startScript);
    });
    (sc.triggers || []).forEach(t => scanAvatars(t.script));
  });
  if (usedAvatarIds.length > AVATAR_SLOTS) {
    warnings(`Project uses ${usedAvatarIds.length} avatars; only ${AVATAR_SLOTS} load.`);
  }
  // scriptBuilder's getSpriteIndex resolves avatarId against this list by
  // position, so keep it stable and pass the same array to every compile().
  const avatars = usedAvatarIds
    .slice(0, AVATAR_SLOTS)
    .map(id => ({ id }));

  // BG3 UI graphics (font + nine-slice frame + menu cursor) come from the
  // project's own assets/ui/*.png, same as the Game Boy target. Missing files
  // are backfilled from the stock sample by ensureSnesUiAssets().
  const uiAssetDir = await ensureSnesUiAssets(projectRoot, warnings);
  const fixed = await snesFixedAssets({ uiAssetDir });
  // 256-tile OBJ sheet: actor pose-A/B direction regions (slot 0 seeded with
  // the placeholder player), plus the 8 emotes (M5c) and up to 8 dialogue
  // avatars (M5d). See snesFixedAssets.js for the full region map.
  const sprSheet = fixed.spriteTiles.slice();

  // Per-sprite OBJ palettes. The SNES has 8 OBJ palettes (16 colours each,
  // CGRAM 128..255). Palettes 1 and 2 are reserved for the emote bubbles and
  // dialogue-avatar portraits, so an actor sprite slot draws its palette from
  // this pool; a project with more than 6 distinct sprite sheets reuses
  // palette 0 for the overflow. `spr_pal` is emitted as the whole OBJ CGRAM
  // image (8 * 32 bytes); the engine uploads it wholesale with oamInitGfxSet,
  // then its own dmaCopyCGram calls overwrite palettes 1/2 with emote/avatar.
  const OBJ_PAL_SIZE = 32;
  const NUM_OBJ_PALS = 8;
  const ACTOR_OBJ_PAL_POOL = [0, 3, 4, 5, 6, 7];
  const objPalForSlot = k =>
    k < ACTOR_OBJ_PAL_POOL.length ? ACTOR_OBJ_PAL_POOL[k] : 0;
  const padPal = bytes => {
    const out = bytes.slice(0, OBJ_PAL_SIZE);
    while (out.length < OBJ_PAL_SIZE) out.push(0);
    return out;
  };
  const sprPalBytes = new Array(NUM_OBJ_PALS * OBJ_PAL_SIZE).fill(0);
  const writePal = (objPal, bytes) => {
    const base = objPal * OBJ_PAL_SIZE;
    padPal(bytes).forEach((b, i) => {
      sprPalBytes[base + i] = b;
    });
  };
  // seed palette 0 with the built-in placeholder colours (slot 0 with no real
  // sprite sheet, e.g. a project that never sets a player sprite)
  writePal(0, fixed.spritePaletteBytes);
  let avatarPalBytes = fixed.spritePaletteBytes;
  const placeTiles = (slot, tiles) => {
    const dst = [2 * slot, 2 * slot + 1, 16 + 2 * slot, 17 + 2 * slot];
    tiles.forEach((tile, ti) => {
      for (let b = 0; b < 32; b++) sprSheet[dst[ti] * 32 + b] = tile[b];
    });
  };
  // A 3-frame sheet's tiles: [down, up, side] (4 tiles each) -> the pose-A
  // regions. A 6-frame sheet's tiles: [down-a, down-b, up-a, up-b, side-a,
  // side-b] -> pose-A + pose-B regions. See snesFixedAssets.js for why these
  // are separate 8-slot regions rather than a wider slot-0..7 range.
  const placeDirectionFrames = (k, tiles) => {
    if (tiles.length >= 24) {
      // 6-frame SPRITE_ACTOR_ANIMATED
      placeTiles(fixed.ACTOR_DOWN_B_SLOT0 + k, tiles.slice(4, 8));
      placeTiles(fixed.ACTOR_UP_SLOT0 + k, tiles.slice(8, 12));
      placeTiles(fixed.ACTOR_UP_B_SLOT0 + k, tiles.slice(12, 16));
      placeTiles(fixed.ACTOR_SIDE_SLOT0 + k, tiles.slice(16, 20));
      placeTiles(fixed.ACTOR_SIDE_B_SLOT0 + k, tiles.slice(20, 24));
    } else if (tiles.length >= 12) {
      // 3-frame SPRITE_ACTOR
      placeTiles(fixed.ACTOR_UP_SLOT0 + k, tiles.slice(4, 8));
      placeTiles(fixed.ACTOR_SIDE_SLOT0 + k, tiles.slice(8, 12));
    }
  };
  const spriteTypeBySlot = {};
  const spriteFramesBySlot = {};
  for (let k = 0; k < usedSpriteIds.length && k < SPRITE_SLOTS; k++) {
    const sheet = spriteById(usedSpriteIds[k]);
    // eslint-disable-next-line no-await-in-loop
    const conv = await snesgfx.imageToSpriteData(
      assetFilename(projectRoot, "sprites", sheet)
    );
    conv.warnings.forEach(warnings);
    placeTiles(k, conv.tiles.slice(0, 4));
    placeDirectionFrames(k, conv.tiles);
    spriteTypeBySlot[k] = conv.spriteType;
    spriteFramesBySlot[k] = conv.frameCount;
    writePal(objPalForSlot(k), conv.paletteBytes);
  }
  for (let k = 0; k < avatars.length; k++) {
    const sheet = spriteById(avatars[k].id);
    if (sheet) {
      // eslint-disable-next-line no-await-in-loop
      const conv = await snesgfx.imageToSpriteData(
        assetFilename(projectRoot, "sprites", sheet)
      );
      conv.warnings.forEach(warnings);
      placeTiles(fixed.AVATAR_SLOT0 + k, conv.tiles.slice(0, 4));
      if (k === 0) avatarPalBytes = conv.paletteBytes; // OBJ palette 2 = avatar 0
    }
  }
  const playerSpriteSlot = spriteSlotById[settings.playerSpriteSheetId] || 0;
  // Match GB's spriteTypeDec: a sheet on a static-movement actor is never a
  // walk-cycle - it's a manual/auto frame cycle, so SPRITE_STATIC regardless
  // of frame count (frames_len is then derived from the sheet's frame count in
  // the engine's SceneInit, via sprite_frames_for_slot[]).
  const spriteTypeForActor = (id, movementType) =>
    moveDec(movementType) === 1 ? 0 : spriteTypeBySlot[slotForActor(id)] || 0;
  // the player is always MOVE_PLAYER_INPUT (never static), so its type is
  // purely frame-count based
  const playerSpriteType = spriteTypeBySlot[playerSpriteSlot] || 0;

  // PLAYER_SET_SPRITE: the compiler encodes the target as an index into the
  // project's full spriteSheets[] (scriptBuilder.js's getSpriteIndex, same
  // array passed as `sprites` to compileEntityEvents below) - but at runtime
  // only the <=SPRITE_SLOTS sheets actually used by an actor/the player are
  // physically in VRAM (no runtime tile streaming here, unlike GB). So this
  // table maps every project sprite index to its pre-loaded OBJ slot, or 0xFF
  // if that sheet was never loaded - Script_PlayerSetSprite_b (SNES engine)
  // no-ops on 0xFF rather than switching to a sheet that isn't in VRAM.
  const spriteSlotForIndex = spriteSheets.map(s => {
    const slot = spriteSlotById[s.id];
    return slot !== undefined ? slot : 0xff;
  });
  const spriteTypeForSlot = [];
  const spriteFramesForSlot = [];
  const spritePalForSlot = [];
  for (let k = 0; k < SPRITE_SLOTS; k++) {
    spriteTypeForSlot.push(spriteTypeBySlot[k] || 0);
    spriteFramesForSlot.push(spriteFramesBySlot[k] || 1);
    spritePalForSlot.push(objPalForSlot(k));
  }

  // ---- scripts + scene blobs ------------------------------------------
  // Raw (unresolved) bytecode per event_ptrs[] slot; placeholders are resolved
  // in one pass at the end so a sub-script pushed mid-compile keeps its slot.
  const rawScripts = [];
  const pushRaw = bytes => {
    rawScripts.push(bytes);
    return rawScripts.length - 1;
  };

  // `banked` shim for scriptBuilder: SET_INPUT_SCRIPT / SET_TIMER_SCRIPT compile
  // a sub-script and expect a {bank, offset} back. On SNES a sub-script is just
  // another event_ptrs[] entry, so bank = 0 and offset = its index.
  const banked = { push: bytes => ({ bank: 0, offset: pushRaw(bytes) }) };

  // compileEntityEvents appends the terminating 0 and resolves label jumps; the
  // placeholders left are __REPLACE:STRING_* (dialogue) - resolved at the end.
  const compile = (script, entity, entityType, entityIndex, sceneIndex, scene, out = []) => {
    compileEntityEvents((script || []).filter(e => e.command !== EVENT_END), {
      scene,
      sceneIndex,
      scenes,
      sprites: projectData.spriteSheets || [],
      avatars,
      backgrounds,
      music: projectData.music || [],
      strings,
      variables,
      labels: {},
      subScripts: {},
      entity,
      entityType,
      entityIndex,
      banked,
      output: out,
      warnings,
      target: "snes"
    });
    return out;
  };

  const pushScript = bytes => pushRaw(bytes);

  const sceneBlobs = scenes.map((scene, sceneIndex) => {
    const bgIndex = bgIndexById[scene.backgroundId] || 0;
    const conv = bgConverted[bgIndex];
    const w = conv.tileW;
    const h = conv.tileH;

    // scene start script: actor start-scripts (END stripped) then scene.script
    const sceneOut = [];
    (scene.actors || []).forEach((actor, actorIndex) => {
      const before = sceneOut.length;
      compile(actor.startScript, actor, "actor", actorIndex, sceneIndex, scene, sceneOut);
      if (sceneOut.length > before && sceneOut[sceneOut.length - 1] === 0) {
        sceneOut.pop(); // strip this start-script's terminating END
      }
    });
    compile(scene.script, scene, "scene", sceneIndex, sceneIndex, scene, sceneOut);
    const sceneScriptIdx = pushScript(sceneOut, `scene ${sceneIndex} start`);

    const actorScriptIdx = (scene.actors || []).map((actor, i) =>
      pushScript(compile(actor.script, actor, "actor", i, sceneIndex, scene), `scene ${sceneIndex} actor ${i}`)
    );
    const triggerScriptIdx = (scene.triggers || []).map((trigger, i) =>
      pushScript(compile(trigger.script, trigger, "trigger", i, sceneIndex, scene), `scene ${sceneIndex} trigger ${i}`)
    );

    // collision bitmap: ceil(w*h/8) bytes, from scene.collisions (already bit-packed)
    const colLen = Math.ceil((w * h) / 8);
    const collisions = []
      .concat(scene.collisions || [], new Array(colLen).fill(0))
      .slice(0, colLen)
      .map(b => b & 0xff);

    const actorEntries = [];
    (scene.actors || []).forEach((actor, i) => {
      actorEntries.push(
        clampByte(actor.x),
        clampByte(actor.y),
        dirDec(actor.direction),
        moveDec(actor.movementType),
        slotForActor(actor.spriteSheetId),
        actorScriptIdx[i],
        spriteTypeForActor(actor.spriteSheetId, actor.movementType),
        animSpeedDec(actor.animSpeed),
        actor.animate ? 1 : 0
      );
    });

    const triggerEntries = [];
    (scene.triggers || []).forEach((trigger, i) => {
      triggerEntries.push(
        clampByte(trigger.x),
        clampByte(trigger.y),
        clampByte(trigger.width || 1),
        clampByte(trigger.height || 1),
        trigger.trigger === "action" ? 1 : 0,
        triggerScriptIdx[i]
      );
    });

    return [].concat(
      bgIndex,
      (scene.actors || []).length,
      (scene.triggers || []).length,
      sceneScriptIdx,
      w,
      h,
      actorEntries,
      triggerEntries,
      collisions
    );
  });

  // ---- resolve dialogue-string placeholders across every script ------
  const scriptBytes = rawScripts.map((b, i) =>
    resolvePlaceholders(b, `event_ptrs[${i}]`, warnings)
  );

  // ---- backgrounds -> padded tables ----------------------------------
  const bgTables = bgConverted.map((conv, i) => {
    const map = [];
    for (let ty = 0; ty < 32; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        const e =
          ty < conv.tileH && tx < conv.tileW
            ? conv.tilemap[ty * conv.tileW + tx]
            : 0;
        map.push(e & 0xff, (e >> 8) & 0xff);
      }
    }
    return {
      name: `bg${i}`,
      tiles: conv.tileBytes,
      map,
      pal: conv.paletteBytes,
      w: conv.tileW,
      h: conv.tileH
    };
  });

  // ---- start position ------------------------------------------------
  const startSceneIndex = Math.max(
    0,
    scenes.findIndex(s => s.id === settings.startSceneId)
  );
  const startX = clampByte(settings.startX !== undefined ? settings.startX : 0);
  const startY = clampByte(settings.startY !== undefined ? settings.startY : 0);
  const startDir = dirDec(settings.startDirection || "down");

  // ---- strings -----------------------------------------------------
  const strBytes = s => {
    const out = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    out.push(0);
    return out;
  };

  // ---- emit -------------------------------------------------------
  const nBg = bgTables.length;
  const nStr = Math.max(1, strings.length);
  const emittedStrings = strings.length ? strings : [""];
  const nSpriteSheets = Math.max(1, spriteSlotForIndex.length);
  const emittedSpriteSlotForIndex = spriteSlotForIndex.length
    ? spriteSlotForIndex
    : [0xff];

  const h = `#ifndef ASSETS_H
#define ASSETS_H

/* Generated by src/lib/compiler/compileSnesData.js. Do not edit. */
#include "gbs_types.h"

extern const unsigned char spr_tiles[${sprSheet.length}];
extern const unsigned char spr_pal[${sprPalBytes.length}];
extern const unsigned char emote_pal[${fixed.emotePaletteBytes.length}];
extern const unsigned char avatar_pal[${avatarPalBytes.length}];
extern const unsigned char ui_font[${fixed.uiFont.length}];
extern const unsigned char ui_pal[${fixed.uiPaletteBytes.length}];
extern const unsigned char sprite_slot_for_index[${nSpriteSheets}];
extern const unsigned char sprite_type_for_slot[${SPRITE_SLOTS}];
extern const unsigned char sprite_frames_for_slot[${SPRITE_SLOTS}];
extern const unsigned char sprite_pal_for_slot[${SPRITE_SLOTS}];

extern const unsigned char *const bg_tiles_ptrs[${nBg}];
extern const unsigned char *const bg_maps_ptrs[${nBg}];
extern const unsigned char *const bg_pals_ptrs[${nBg}];
extern const unsigned short bg_tiles_len[${nBg}];
extern const unsigned short bg_maps_len[${nBg}];
extern const unsigned short bg_pals_len[${nBg}];
extern const unsigned char bg_map_w[${nBg}];
extern const unsigned char bg_map_h[${nBg}];

extern const BANK_PTR event_ptrs[${scriptBytes.length}];
extern const BANK_PTR string_ptrs[${nStr}];
extern const unsigned char *const scenes[${scenes.length}];

#define NUM_SCENES ${scenes.length}
#define NUM_BGS ${nBg}
#define NUM_SPRITE_SHEETS ${nSpriteSheets}
#define SPRITE_SLOTS ${SPRITE_SLOTS}
#define SPR_TILES_SIZE ${sprSheet.length}
#define SPR_PAL_SIZE   ${sprPalBytes.length}
#define UI_FONT_SIZE  ${fixed.uiFont.length}
#define UI_PAL_SIZE   ${fixed.uiPaletteBytes.length}
#define NUM_UI_GLYPHS ${fixed.NUM_UI_GLYPHS}
#define UI_FILL_TILE  ${fixed.UI_FILL_TILE}
#define UI_FRAME_TILE0 ${fixed.UI_FRAME_TILE0}
#define UI_CURSOR_TILE ${fixed.UI_CURSOR_TILE}
#define EMOTE_PAL_SIZE ${fixed.emotePaletteBytes.length}
#define EMOTE_TILE0 ${fixed.EMOTE_TILE0}
#define NUM_EMOTES ${fixed.NUM_EMOTES}
#define AVATAR_PAL_SIZE ${avatarPalBytes.length}
#define AVATAR_TILE0 ${fixed.AVATAR_TILE0}
#define NUM_AVATARS ${avatars.length}
#define ACTOR_UP_TILE0 ${fixed.ACTOR_UP_TILE0}
#define ACTOR_SIDE_TILE0 ${fixed.ACTOR_SIDE_TILE0}
#define ACTOR_DOWN_B_TILE0 ${fixed.ACTOR_DOWN_B_TILE0}
#define ACTOR_UP_B_TILE0 ${fixed.ACTOR_UP_B_TILE0}
#define ACTOR_SIDE_B_TILE0 ${fixed.ACTOR_SIDE_B_TILE0}
#define NUM_STRINGS   ${nStr}
#define START_SCENE ${startSceneIndex}
#define START_X ${startX}
#define START_Y ${startY}
#define START_DIR ${startDir}
#define PLAYER_SPRITE_SLOT ${playerSpriteSlot}
#define PLAYER_SPRITE_TYPE ${playerSpriteType}
#define PLAYER_SPRITE_PAL ${objPalForSlot(playerSpriteSlot)}
#define PLAYER_ANIM_SPEED 3
#define NUM_MUSIC_TRACKS ${(projectData.music || []).length}

#endif
`;

  const bgArrays = bgTables
    .map(
      b =>
        cArray(`${b.name}_tiles`, b.tiles) +
        cArray(`${b.name}_map`, b.map) +
        cArray(`${b.name}_pal`, b.pal)
    )
    .join("\n");

  const scriptArrays = scriptBytes
    .map((bytes, i) => cArray(`script_${i}`, bytes))
    .join("\n");

  const sceneArrays = sceneBlobs
    .map((blob, i) => cArray(`scene_${i}`, blob))
    .join("\n");

  const stringArrays = emittedStrings
    .map((s, i) => cArray(`string_${i}`, strBytes(s)))
    .join("\n");

  const c = `/* Generated by src/lib/compiler/compileSnesData.js. Do not edit. */
#include "assets.h"

${cArray("spr_tiles", sprSheet)}
${cArray("spr_pal", sprPalBytes)}
${cArray("emote_pal", fixed.emotePaletteBytes)}
${cArray("avatar_pal", avatarPalBytes)}
${cArray("ui_font", fixed.uiFont)}
${cArray("ui_pal", fixed.uiPaletteBytes)}
${cArray("sprite_slot_for_index", emittedSpriteSlotForIndex)}
${cArray("sprite_type_for_slot", spriteTypeForSlot)}
${cArray("sprite_frames_for_slot", spriteFramesForSlot)}
${cArray("sprite_pal_for_slot", spritePalForSlot)}
${bgArrays}
const unsigned char *const bg_tiles_ptrs[${nBg}] = { ${bgTables
    .map(b => `${b.name}_tiles`)
    .join(", ")} };
const unsigned char *const bg_maps_ptrs[${nBg}] = { ${bgTables
    .map(b => `${b.name}_map`)
    .join(", ")} };
const unsigned char *const bg_pals_ptrs[${nBg}] = { ${bgTables
    .map(b => `${b.name}_pal`)
    .join(", ")} };
const unsigned short bg_tiles_len[${nBg}] = { ${bgTables
    .map(b => b.tiles.length)
    .join(", ")} };
const unsigned short bg_maps_len[${nBg}] = { ${bgTables
    .map(b => b.map.length)
    .join(", ")} };
const unsigned short bg_pals_len[${nBg}] = { ${bgTables
    .map(b => b.pal.length)
    .join(", ")} };
const unsigned char bg_map_w[${nBg}] = { ${bgTables.map(b => b.w).join(", ")} };
const unsigned char bg_map_h[${nBg}] = { ${bgTables.map(b => b.h).join(", ")} };

${scriptArrays}
const BANK_PTR event_ptrs[${scriptBytes.length}] = {
${scriptBytes.map((_, i) => `    { script_${i} }`).join(",\n")}
};

${stringArrays}
const BANK_PTR string_ptrs[${nStr}] = {
${emittedStrings.map((_, i) => `    { string_${i} }`).join(",\n")}
};

${sceneArrays}
const unsigned char *const scenes[${scenes.length}] = {
${sceneBlobs.map((_, i) => `    scene_${i}`).join(",\n")}
};
`;

  return {
    assetsH: h,
    assetsC: c,
    stats: {
      scenes: scenes.length,
      backgrounds: nBg,
      scripts: scriptBytes.length,
      strings: strings.length,
      variables: variables.length,
      startSceneIndex,
      sceneBlobs,
      scriptBytes
    }
  };
};

export default compileSnesData;
export { resolvePlaceholders };
