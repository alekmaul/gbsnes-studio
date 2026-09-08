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

// bytes -> wla-65816 `.db` lines, 32 bytes per line
const asmDb = bytes => {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 32) {
    lines.push(`.db ${bytes.slice(i, i + 32).map(b => b & 0xff).join(",")}`);
  }
  return lines.join("\n");
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
  // One OBJ sheet **per scene** (uploaded by SceneInit), up to SPRITE_SLOTS
  // 16x16 sprites. slot k -> OBJ grid tiles 2k, 2k+1, 2k+16, 2k+17. The player
  // sheet is always slot 0; a scene's own actor sheets take 1..7. A scene that
  // needs more than 8 distinct sheets falls the extras back to slot 0.
  const SPRITE_SLOTS = 8;
  const spriteSheets = projectData.spriteSheets || [];
  const spriteById = id => spriteSheets.find(s => s.id === id);
  const isSprite = id => id && !!spriteById(id);

  // sceneSpriteIds[i][k] = the sprite sheet id loaded into scene i's slot k
  const sceneSpriteIds = scenes.map((sc, i) => {
    const ids = [];
    const add = id => {
      if (isSprite(id) && ids.indexOf(id) === -1 && ids.length < SPRITE_SLOTS) {
        ids.push(id);
      }
    };
    add(settings.playerSpriteSheetId);
    (sc.actors || []).forEach(a => add(a.spriteSheetId));
    const distinct = new Set(
      [settings.playerSpriteSheetId]
        .concat((sc.actors || []).map(a => a.spriteSheetId))
        .filter(isSprite)
    );
    if (distinct.size > SPRITE_SLOTS) {
      warnings(
        `Scene '${sc.name || i}' uses ${distinct.size} sprite sheets; only ` +
          `${SPRITE_SLOTS} fit - the rest fall back to slot 0 (the player).`
      );
    }
    return ids;
  });
  const slotForActor = (sceneIndex, id) => {
    const k = sceneSpriteIds[sceneIndex].indexOf(id);
    return k >= 0 ? k : 0;
  };

  // ---- dialogue avatars (M5d): TEXT events with an avatarId ------------
  // Also per-scene: a scene's blob carries only the avatars its own scripts
  // use, at AVATAR region slots 0..k. scriptBuilder's getSpriteIndex resolves
  // avatarId -> that index, so compile() is passed the scene's own avatar list.
  const AVATAR_SLOTS = 8;
  const sceneAvatarIds = scenes.map(sc => {
    const ids = [];
    const scan = evs => {
      (evs || []).forEach(ev => {
        if (ev.args && ev.args.avatarId && isSprite(ev.args.avatarId) &&
            ids.indexOf(ev.args.avatarId) === -1 && ids.length < AVATAR_SLOTS) {
          ids.push(ev.args.avatarId);
        }
        if (ev.children) {
          Object.keys(ev.children).forEach(k => scan(ev.children[k]));
        }
      });
    };
    scan(sc.script);
    (sc.actors || []).forEach(a => {
      scan(a.script);
      scan(a.startScript);
    });
    (sc.triggers || []).forEach(t => scan(t.script));
    return ids;
  });
  const sceneAvatars = sceneAvatarIds.map(ids => ids.map(id => ({ id })));
  const maxAvatars = Math.max(0, ...sceneAvatarIds.map(a => a.length));

  // BG3 UI graphics (font + nine-slice frame + menu cursor) come from the
  // project's own assets/ui/*.png, same as the Game Boy target. Missing files
  // are backfilled from the stock sample by ensureSnesUiAssets().
  const uiAssetDir = await ensureSnesUiAssets(projectRoot, warnings);
  const fixed = await snesFixedAssets({ uiAssetDir });

  // Convert every sprite sheet that's referenced anywhere, once.
  const spriteConv = {};
  const allSpriteIds = new Set(
    [].concat(...sceneSpriteIds, ...sceneAvatarIds)
  );
  for (const id of allSpriteIds) {
    // eslint-disable-next-line no-await-in-loop
    const conv = await snesgfx.imageToSpriteData(
      assetFilename(projectRoot, "sprites", spriteById(id))
    );
    conv.warnings.forEach(warnings);
    spriteConv[id] = conv;
  }

  // SNES has 8 OBJ palettes (16 colours each, CGRAM 128..255). Palettes 1 and 2
  // are reserved for the emote bubbles and dialogue-avatar portraits, so an
  // actor sprite slot draws its palette from this pool; a scene with more than
  // 6 distinct sprite sheets reuses palette 0 for the overflow.
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

  // Frame 0 (4 tiles) always goes in slot k's pose-A region. The rest depend on
  // the sprite type:
  //   3-frame SPRITE_ACTOR         -> [down, up, side]: frame 1 = up, 2 = side
  //   everything else (2-6 frames) -> frame f into the f-th of
  //     [down-A, down-B, up-A, up-B, side-A, side-B] - the exact regions the
  //     engine's SPRITE_ACTOR_ANIMATED walk cycle and its SPRITE_STATIC
  //     auto-cycle both read by frame number.
  const ANIM_FRAME_SLOT0 = [
    null,
    fixed.ACTOR_DOWN_B_SLOT0,
    fixed.ACTOR_UP_SLOT0,
    fixed.ACTOR_UP_B_SLOT0,
    fixed.ACTOR_SIDE_SLOT0,
    fixed.ACTOR_SIDE_B_SLOT0
  ];

  // Build one scene's OBJ sheet (8 KB) + palette image (256 B) + per-slot
  // type/frames/palette arrays, starting from the fixed emote/placeholder sheet.
  const buildSceneSprites = sceneIndex => {
    const sheet = fixed.spriteTiles.slice(); // emotes (32-63) + placeholder (0)
    const palBytes = new Array(NUM_OBJ_PALS * OBJ_PAL_SIZE).fill(0);
    const writePal = (objPal, bytes) => {
      const base = objPal * OBJ_PAL_SIZE;
      padPal(bytes).forEach((b, i) => {
        palBytes[base + i] = b;
      });
    };
    const placeTiles = (slot, tiles) => {
      const dst = [2 * slot, 2 * slot + 1, 16 + 2 * slot, 17 + 2 * slot];
      tiles.forEach((tile, ti) => {
        for (let b = 0; b < 32; b++) sheet[dst[ti] * 32 + b] = tile[b];
      });
    };
    const placeFrames = (k, tiles, spriteType) => {
      const nFrames = Math.min(tiles.length >> 2, 6);
      if (spriteType === 1) {
        placeTiles(fixed.ACTOR_UP_SLOT0 + k, tiles.slice(4, 8));
        placeTiles(fixed.ACTOR_SIDE_SLOT0 + k, tiles.slice(8, 12));
        return;
      }
      for (let f = 1; f < nFrames; f++) {
        placeTiles(ANIM_FRAME_SLOT0[f] + k, tiles.slice(f * 4, f * 4 + 4));
      }
    };

    writePal(0, fixed.spritePaletteBytes); // placeholder (empty slot 0)
    writePal(1, fixed.emotePaletteBytes); // OBJ palette 1 = emotes
    writePal(2, fixed.spritePaletteBytes); // OBJ palette 2 = avatar 0 (below)

    const types = new Array(SPRITE_SLOTS).fill(0);
    const frames = new Array(SPRITE_SLOTS).fill(1);
    const pals = [];
    for (let k = 0; k < SPRITE_SLOTS; k++) pals.push(objPalForSlot(k));

    sceneSpriteIds[sceneIndex].forEach((id, k) => {
      const conv = spriteConv[id];
      placeTiles(k, conv.tiles.slice(0, 4));
      placeFrames(k, conv.tiles, conv.spriteType);
      types[k] = conv.spriteType;
      frames[k] = conv.frameCount;
      writePal(objPalForSlot(k), conv.paletteBytes);
    });
    sceneAvatarIds[sceneIndex].forEach((id, k) => {
      const conv = spriteConv[id];
      placeTiles(fixed.AVATAR_SLOT0 + k, conv.tiles.slice(0, 4));
      if (k === 0) writePal(2, conv.paletteBytes);
    });

    return { sheet, palBytes, types, frames, pals };
  };

  const sceneSprites = scenes.map((_, i) => buildSceneSprites(i));

  // player is always slot 0; its sheet is the same in every scene, so its type
  // is scene-independent (the frame count still comes from the loaded blob).
  const playerSpriteSlot = 0;
  const playerConv = isSprite(settings.playerSpriteSheetId)
    ? spriteConv[settings.playerSpriteSheetId]
    : null;
  const playerSpriteType = playerConv ? playerConv.spriteType : 0;

  // Match GB's spriteTypeDec: a sheet on a static-movement actor is never a
  // walk-cycle - it's a manual/auto frame cycle, so SPRITE_STATIC regardless of
  // frame count (frames_len is derived from the sheet's frame count, engine-side).
  const spriteTypeForActor = (sceneIndex, id, movementType) => {
    if (moveDec(movementType) === 1) return 0;
    const conv = spriteConv[id];
    return conv ? conv.spriteType : 0;
  };

  // PLAYER_SET_SPRITE: scriptBuilder encodes the target as an index into the
  // project's full spriteSheets[]. At runtime only the sheets loaded in the
  // *current scene* are in VRAM, so this is per-scene: project sprite index ->
  // the scene's OBJ slot, or 0xFF if that sheet isn't loaded there (the engine
  // no-ops on 0xFF).
  const sceneSlotForIndex = scenes.map((_, sceneIndex) =>
    spriteSheets.map(s => {
      const k = sceneSpriteIds[sceneIndex].indexOf(s.id);
      return k >= 0 ? k : 0xff;
    })
  );

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
      avatars: sceneAvatars[sceneIndex] || [],
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
        slotForActor(sceneIndex, actor.spriteSheetId),
        actorScriptIdx[i],
        spriteTypeForActor(sceneIndex, actor.spriteSheetId, actor.movementType),
        animSpeedDec(actor.animSpeed),
        actor.animate ? 1 : 0
      );
    });

    // per-scene OBJ-slot tables, read by SceneInit straight after w/h
    const spr = sceneSprites[sceneIndex];
    const sprSlotBytes = [].concat(spr.types, spr.frames, spr.pals);

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
      sprSlotBytes, // [24] sprite_type[8], sprite_frames[8], sprite_pal[8]
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
  const nSpriteSheets = Math.max(1, spriteSheets.length);

  // De-dupe identical per-scene OBJ sheets / palettes / slot maps (e.g. a Logo
  // and a Title scene with no actors produce the same bytes). scene_spr_*
  // pointer tables then reference the shared arrays.
  const interned = () => {
    const seen = new Map();
    const arrays = [];
    const intern = item => {
      const key = item.join(",");
      if (!seen.has(key)) {
        seen.set(key, arrays.length);
        arrays.push(item);
      }
      return seen.get(key);
    };
    return { intern, arrays };
  };
  const sprTiles = interned();
  const sprPals = interned();
  const sprSlots = interned();
  const sceneSprTileIdx = sceneSprites.map(spr => sprTiles.intern(spr.sheet));
  const sceneSprPalIdx = sceneSprites.map(spr => sprPals.intern(spr.palBytes));
  const sceneSprSlotIdx = sceneSlotForIndex.map(m =>
    sprSlots.intern(m.length ? m : [0xff])
  );
  const SPR_TILES_SIZE = sceneSprites[0].sheet.length;
  const SPR_PAL_SIZE = sceneSprites[0].palBytes.length;

  const h = `#ifndef ASSETS_H
#define ASSETS_H

/* Generated by src/lib/compiler/compileSnesData.js. Do not edit. */
#include "gbs_types.h"

/* one OBJ tile sheet + 8-palette CGRAM image + PLAYER_SET_SPRITE slot map per
 * scene (deduped); SceneInit uploads scene_index's and fills the mutable
 * sprite_*_for_slot[] from the scene blob's [24] slot table. The tile / palette
 * blobs (and the backgrounds + UI font below) are defined in src/data/*.as -
 * one superfree section each - not in assets.c. */
${sprTiles.arrays
  .map((_, i) => `extern const unsigned char scene_spr_${i}[${SPR_TILES_SIZE}];`)
  .join("\n")}
${sprPals.arrays
  .map((_, i) => `extern const unsigned char scene_spr_pal_${i}[${SPR_PAL_SIZE}];`)
  .join("\n")}
extern const unsigned char *const scene_spr_ptrs[${scenes.length}];
extern const unsigned char *const scene_spr_pal_ptrs[${scenes.length}];
extern const unsigned char *const scene_sprite_slot_ptrs[${scenes.length}];
extern const unsigned char ui_font[${fixed.uiFont.length}];
extern const unsigned char ui_pal[${fixed.uiPaletteBytes.length}];

${bgTables
  .map(
    b =>
      `extern const unsigned char ${b.name}_tiles[${b.tiles.length}];\n` +
      `extern const unsigned char ${b.name}_pal[${b.pal.length}];\n` +
      `extern const unsigned char ${b.name}_map[${b.map.length}];`
  )
  .join("\n")}
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
#define SPR_TILES_SIZE ${SPR_TILES_SIZE}
#define SPR_PAL_SIZE   ${SPR_PAL_SIZE}
#define UI_FONT_SIZE  ${fixed.uiFont.length}
#define UI_PAL_SIZE   ${fixed.uiPaletteBytes.length}
#define NUM_UI_GLYPHS ${fixed.NUM_UI_GLYPHS}
#define UI_FILL_TILE  ${fixed.UI_FILL_TILE}
#define UI_FRAME_TILE0 ${fixed.UI_FRAME_TILE0}
#define UI_CURSOR_TILE ${fixed.UI_CURSOR_TILE}
#define EMOTE_TILE0 ${fixed.EMOTE_TILE0}
#define NUM_EMOTES ${fixed.NUM_EMOTES}
#define AVATAR_TILE0 ${fixed.AVATAR_TILE0}
#define NUM_AVATARS ${maxAvatars}
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

  const scriptArrays = scriptBytes
    .map((bytes, i) => cArray(`script_${i}`, bytes))
    .join("\n");

  const sceneArrays = sceneBlobs
    .map((blob, i) => cArray(`scene_${i}`, blob))
    .join("\n");

  const stringArrays = emittedStrings
    .map((s, i) => cArray(`string_${i}`, strBytes(s)))
    .join("\n");

  // ---- graphic assets -> per-asset 65816 source ---------------------------
  // Every background, the UI font, each OBJ tile sheet and each OBJ palette
  // gets its own `<name>_data.as` holding one `superfree` section, so wlalink
  // spreads them across ROM banks. A single 816-tcc `.rodata` section (what all
  // of assets.c compiles into) is atomic and can't exceed a 32 KB LoROM bank -
  // that cap is the whole reason the bulky graphic data lives here instead.
  // `src/data/data.asm` (found by the build; the `.as` files are not) pulls
  // them all in with `.include`.
  const asmHeader = ";* Generated by src/lib/compiler/compileSnesData.js. Do not edit.";
  const asmAsset = (assetName, parts) => {
    const body = parts
      .filter(p => p.bytes && p.bytes.length)
      .map(p => `${p.label}:\n${asmDb(p.bytes)}`)
      .join("\n");
    return `${asmHeader}\n.section "rodata_${assetName}" superfree\n${body}\n.ends\n`;
  };

  const assetsData = {};
  bgTables.forEach(b => {
    assetsData[`${b.name}_data.as`] = asmAsset(b.name, [
      { label: `${b.name}_tiles`, bytes: b.tiles },
      { label: `${b.name}_pal`, bytes: b.pal },
      { label: `${b.name}_map`, bytes: b.map }
    ]);
  });
  assetsData["uifont_data.as"] = asmAsset("uifont", [
    { label: "ui_font", bytes: fixed.uiFont },
    { label: "ui_pal", bytes: fixed.uiPaletteBytes }
  ]);
  sprTiles.arrays.forEach((a, i) => {
    assetsData[`scene_spr_${i}_data.as`] = asmAsset(`scene_spr_${i}`, [
      { label: `scene_spr_${i}`, bytes: a }
    ]);
  });
  sprPals.arrays.forEach((a, i) => {
    assetsData[`scene_spr_pal_${i}_data.as`] = asmAsset(`scene_spr_pal_${i}`, [
      { label: `scene_spr_pal_${i}`, bytes: a }
    ]);
  });
  const includeLines = Object.keys(assetsData)
    .map(f => `.include "src/data/${f}"`)
    .join("\n");
  assetsData["data.asm"] = `${asmHeader}\n.include "hdr.asm"\n\n${includeLines}\n`;

  // Slot maps (project sprite index -> loaded OBJ slot, PLAYER_SET_SPRITE) are
  // tiny lookup tables, not bulk gfx - they stay C-side with the pointer tables.
  const sprSlotArrays = sprSlots.arrays
    .map((a, i) => cArray(`scene_spr_slot_${i}`, a))
    .join("\n");

  const c = `/* Generated by src/lib/compiler/compileSnesData.js. Do not edit. */
#include "assets.h"

${sprSlotArrays}
const unsigned char *const scene_spr_ptrs[${scenes.length}] = {
${sceneSprTileIdx.map(i => `    scene_spr_${i}`).join(",\n")}
};
const unsigned char *const scene_spr_pal_ptrs[${scenes.length}] = {
${sceneSprPalIdx.map(i => `    scene_spr_pal_${i}`).join(",\n")}
};
const unsigned char *const scene_sprite_slot_ptrs[${scenes.length}] = {
${sceneSprSlotIdx.map(i => `    scene_spr_slot_${i}`).join(",\n")}
};
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
    // { "<name>_data.as": "...", ..., "data.asm": "..." } - written under src/data/
    assetsData,
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
