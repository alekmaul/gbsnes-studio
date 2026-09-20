/*
 * compileSnesData.js - the SNES data compiler (v2 M7, porting the v1.1.4
 * version forward onto GB Studio 2.0.0-beta5's compiler internals).
 *
 * Turns a denormalized project into appData/src/snes/src/assets.{c,h} in the
 * exact shape the SNES engine consumes (see appData/src/snes/tools/
 * gen-dummy-gfx.js, which this replaces for real projects):
 *
 *   scenes[]        index-based scene blobs (now carrying the v2 M5a
 *                   scene_type byte - see below)
 *   event_ptrs[]    compiled script bytecode (BANK_PTR = far pointer, D4)
 *   string_ptrs[]   NUL-terminated dialogue strings
 *   bg_*_ptrs[]     backgrounds via snesgfx.js: 4bpp tiles + BGR555 palette
 *
 * Script bytecode reuses the shared compiler (compileEntityEvents / scriptBuilder
 * / scriptCommands.js) - opcode numbers are identical to Game Boy and guarded by
 * test/data/compiler/snesScriptCmds.test.js. scriptBuilder.js's own SNES target-
 * awareness (2-byte input masks, overlay row scaling, camera clamp) had to be
 * restored first - see that file's own history; without it this compiler would
 * silently emit GB-shaped bytecode the SNES engine can't read correctly. The
 * only placeholders left to resolve here are the __REPLACE:STRING_* triples,
 * which on SNES become a plain 16-bit index into string_ptrs[] (no banked
 * pointer).
 *
 * v2 M5a scene genre dispatch: the scene blob header gained a scene_type byte
 * (position 6, after height, before the [24] sprite-slot table) - read here
 * from the denormalized scene's own `type` field (a string "0".."4", GB
 * Studio 2.0's real scene.type numbering - see states.h in the engine for
 * the same values). No genre-specific compile-time behaviour is needed here
 * beyond emitting this one byte; the engine's own Start_/Update_ dispatch
 * (states.c) does the rest.
 *
 * v2 M6 multi-palette-per-scene: the engine (SceneUploadBgPalette, scene.c)
 * can accept up to 6 concatenated 32-byte BG palette regions per background,
 * but this compiler only ever emits ONE region per background, matching
 * snesgfx.js's single-palette-per-image extraction straight from the PNG's
 * own real colours. There is no per-scene "palette painting" data left to
 * feed a multi-region upload with (the GB-heritage custom-palette editor
 * feature - and the scene.paletteIds/background.paletteId fields it wrote -
 * was removed entirely as pointless on a target that already gets its real
 * colours straight from each PNG); the engine's multi-region support simply
 * goes unused unless some future authoring scheme (e.g. multiple indexed-PNG
 * regions per background) is built to drive it.
 *
 * v2: `actor.spriteType` (a real, explicit per-actor field in GB Studio 2.0 -
 * "static"/"actor"/"actor_animated"/"animated", independent of movementType)
 * replaces the old v1.1.4 inference from `moveDec(movementType) === 1`, using
 * the same shared `spriteTypeDec()` helper (./helpers) Game Boy itself now
 * uses - an actor can move around and still have a decorative auto-cycling
 * sprite, which the old movementType-derived heuristic couldn't express.
 *
 * v4: Engine Fields ARE now wired to real per-project values -
 * appData/src/snes/engine.json is the schema (topdown_grid, the Platformer
 * physics constants, Shmup's shooter_scroll_speed), and compileEngineFields()
 * below emits src/engine_fields.c: one real `<cType> <key> = <value>;` per
 * schema entry, value from the project's own engineFieldValues (Settings
 * page) or the schema's defaultValue. GB Studio 3.x's real engine writes a
 * chosen value into these globals at boot via a GBVM assembly routine
 * (compileBootstrap.ts); this engine has no such VM injection point, so the
 * value is baked straight into the generated initializer instead - same
 * end result (a real, still-mutable global), simpler mechanism here.
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
import { dirDec, moveDec, animSpeedDec, spriteTypeDec, collisionGroupDec } from "./helpers";
import { assetFilename } from "../helpers/gbstudio";
import { projectTemplatesRoot, TILE_PROP_PRIORITY, engineRoot } from "../../consts";
import snesTarget from "./targets/snes";
import migrateProject from "../project/migrateProject";

const EVENT_END = "EVENT_END";

// The BG3 UI graphics (ascii font, nine-slice frame, menu cursor) plus the
// emote bubbles are project assets, same as on Game Boy (compileData.js reads
// assets/ui/emotes.png via ensureProjectAsset there too). Backfill any that
// are missing from the stock sample so an older project still builds, and
// return the assets/ui dir.
const UI_FILES = ["ascii.png", "frame.png", "cursor.png", "emotes.png"];
const ensureSnesUiAssets = async (projectRoot, warnings) => {
  const uiDir = Path.join(projectRoot, "assets", "ui");
  for (const name of UI_FILES) {
    const dest = Path.join(uiDir, name);
    if (!fs.existsSync(dest)) {
      // eslint-disable-next-line no-await-in-loop
      await fs.copy(
        Path.join(projectTemplatesRoot, "gbhtml", "assets", "ui", name),
        dest
      );
      warnings(`assets/ui/${name} was missing, copied the default in`);
    }
  }
  return uiDir;
};

const clampByte = (n) => Math.max(0, Math.min(255, n | 0));

// __REPLACE:STRING_BANK/HI/LO:<n>  ->  0 / hi(n) / lo(n)   (n = string index)
const resolvePlaceholders = (bytes, where, warnings) =>
  bytes.map((b) => {
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
const asmDb = (bytes) => {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 32) {
    lines.push(`.db ${bytes.slice(i, i + 32).map((b) => b & 0xff).join(",")}`);
  }
  return lines.join("\n");
};

// GB Studio 2.0's real scene.type: a string "0".."4" (0 Top Down, 1
// Platformer, 2 Adventure, 3 Shoot Em Up, 4 Point and Click - states.h in
// the SNES engine). Empty/missing -> 0, matching the editor's own default.
const sceneTypeDec = (type) => {
  const n = parseInt(type, 10);
  return Number.isNaN(n) ? 0 : clampByte(n);
};

// Engine Fields (v4). appData/src/snes/engine.json is the schema
// (key/group/type/min/max/defaultValue) the Settings page already reads to
// build its editor UI (useGroupedEngineFields.ts/EngineFieldsEditor.tsx) -
// this is the compiler-side half, turning the project's own chosen values
// (or each field's defaultValue, for one it never touched) into a real C
// global definition per field, in engine_fields.h's own extern order so a
// diff stays readable. cType -> this engine's own u8/s8/u16/s16 typedefs
// (gbs_types.h) - "define" (GB Studio 3.x's own #define-and-recompile
// cType, used there for input-button remapping) has no matching field on
// this engine and never appears in this schema.
const ENGINE_FIELD_C_TYPES = {
  UBYTE: "u8",
  BYTE: "s8",
  UWORD: "u16",
  WORD: "s16",
};
let engineFieldsSchema = null;
const getEngineFieldsSchema = () => {
  if (!engineFieldsSchema) {
    const schemaPath = Path.join(engineRoot, "snes", "engine.json");
    engineFieldsSchema = (fs.readJsonSync(schemaPath).fields || []);
  }
  return engineFieldsSchema;
};

const compileEngineFields = (rawEngineFieldValues) => {
  const valueById = {};
  (rawEngineFieldValues || []).forEach((v) => {
    valueById[v.id] = v.value;
  });
  const lines = getEngineFieldsSchema().map((field) => {
    const cType = ENGINE_FIELD_C_TYPES[field.cType] || "u8";
    const raw = valueById[field.key];
    const numeric = Number(raw);
    const value = raw !== undefined && Number.isFinite(numeric)
      ? numeric
      : field.defaultValue;
    return `${cType} ${field.key} = ${value};`;
  });
  return `/* Generated by src/lib/compiler/compileSnesData.js from
 * appData/src/snes/engine.json. Do not edit - change engine.json's
 * defaultValue, or the project's own Settings > Engine Fields, instead. */
#include "gbs_types.h"

${lines.join("\n")}
`;
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
  const engineFieldsC = compileEngineFields(projectData.engineFieldValues);

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
  const spriteById = (id) => spriteSheets.find((s) => s.id === id);
  const isSprite = (id) => id && !!spriteById(id);

  // A scene's own playerSpriteSheetId overrides the project-wide default
  // when set - lets a scene give the player a different costume, matching
  // GB Studio 3.x's per-scene field. Below that, settings.defaultPlayerSprites
  // (v4, "Default Player Sprites" in Settings) picks a default *per scene
  // type* instead of one single project-wide sheet - also matches GB Studio
  // 3.2.1 exactly (defaultPlayerSprites[scene.type] in its own compileData.js),
  // keyed by this fork's own numeric-string scene type ("0".."4",
  // SceneTypeSelect.tsx) rather than B's string enum. settings.playerSpriteSheetId
  // (the old single default) stays as the final fallback for a scene type with
  // no configured default - additive, not a migration: an unset
  // defaultPlayerSprites falls straight through to the old behaviour. Player is
  // still always OBJ slot 0 in every scene (a fork-wide simplification kept
  // as-is - only *which sheet* loads into that slot varies per scene now).
  const playerSpriteIdForScene = (sc) => {
    if (isSprite(sc.playerSpriteSheetId)) {
      return sc.playerSpriteSheetId;
    }
    const defaultForType =
      settings.defaultPlayerSprites && settings.defaultPlayerSprites[sc.type];
    if (isSprite(defaultForType)) {
      return defaultForType;
    }
    return settings.playerSpriteSheetId;
  };

  // Projectiles (v4): a scene's own LAUNCH_PROJECTILE/WEAPON_ATTACK events can
  // reference any project sprite sheet, same as an avatarId - it has to be
  // loaded into this scene's own OBJ pool for launchProjectile()'s scene-
  // relative slot lookup (below) to find it, same reasoning as sceneAvatarIds
  // just above this in the file. Recurses into nested branches the same way.
  const scanProjectileSpriteIds = (evs, ids) => {
    (evs || []).forEach((ev) => {
      if (
        ev.command &&
        (ev.command === "EVENT_LAUNCH_PROJECTILE" || ev.command === "EVENT_WEAPON_ATTACK") &&
        ev.args &&
        isSprite(ev.args.spriteSheetId) &&
        ids.indexOf(ev.args.spriteSheetId) === -1
      ) {
        ids.push(ev.args.spriteSheetId);
      }
      if (ev.children) {
        Object.keys(ev.children).forEach((k) => scanProjectileSpriteIds(ev.children[k], ids));
      }
    });
  };
  const sceneProjectileSpriteIds = scenes.map((sc) => {
    const ids = [];
    scanProjectileSpriteIds(sc.script, ids);
    (sc.actors || []).forEach((a) => {
      scanProjectileSpriteIds(a.script, ids);
      scanProjectileSpriteIds(a.startScript, ids);
      scanProjectileSpriteIds(a.hit1Script, ids);
      scanProjectileSpriteIds(a.hit2Script, ids);
      scanProjectileSpriteIds(a.hit3Script, ids);
    });
    (sc.triggers || []).forEach((t) => scanProjectileSpriteIds(t.script, ids));
    return ids;
  });

  // sceneSpriteIds[i][k] = the sprite sheet id loaded into scene i's slot k
  const sceneSpriteIds = scenes.map((sc, i) => {
    const ids = [];
    const add = (id) => {
      if (isSprite(id) && ids.indexOf(id) === -1 && ids.length < SPRITE_SLOTS) {
        ids.push(id);
      }
    };
    add(playerSpriteIdForScene(sc));
    (sc.actors || []).forEach((a) => add(a.spriteSheetId));
    sceneProjectileSpriteIds[i].forEach(add);
    const distinct = new Set(
      [playerSpriteIdForScene(sc)]
        .concat((sc.actors || []).map((a) => a.spriteSheetId))
        .concat(sceneProjectileSpriteIds[i])
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
  const sceneAvatarIds = scenes.map((sc) => {
    const ids = [];
    const scan = (evs) => {
      (evs || []).forEach((ev) => {
        if (
          ev.args &&
          ev.args.avatarId &&
          isSprite(ev.args.avatarId) &&
          ids.indexOf(ev.args.avatarId) === -1 &&
          ids.length < AVATAR_SLOTS
        ) {
          ids.push(ev.args.avatarId);
        }
        if (ev.children) {
          Object.keys(ev.children).forEach((k) => scan(ev.children[k]));
        }
      });
    };
    scan(sc.script);
    (sc.actors || []).forEach((a) => {
      scan(a.script);
      scan(a.startScript);
    });
    (sc.triggers || []).forEach((t) => scan(t.script));
    return ids;
  });
  const sceneAvatars = sceneAvatarIds.map((ids) => ids.map((id) => ({ id })));
  const maxAvatars = Math.max(0, ...sceneAvatarIds.map((a) => a.length));

  // BG3 UI graphics (font + nine-slice frame + menu cursor) come from the
  // project's own assets/ui/*.png, same as the Game Boy target. Missing
  // files are backfilled from the stock sample by ensureSnesUiAssets().
  const uiAssetDir = await ensureSnesUiAssets(projectRoot, warnings);
  // M5 (v4): Emote is a real entity (assets/emotes/*.png) - a project with
  // none yet falls back to the legacy assets/ui/emotes.png grid inside
  // snesFixedAssets() itself. Order matters: this is the same order
  // actorEmote() (scriptBuilder.js) resolves an emoteId against.
  const emotes = projectData.emotes || [];
  if (emotes.length > 8) {
    warnings(
      `Project has ${emotes.length} emotes, but only the first 8 fit the fixed OBJ region - the rest will be blank.`
    );
  }
  const emoteFilenames = emotes.map((emote) =>
    assetFilename(projectRoot, "emotes", emote)
  );
  // M5 (v4): Font is a real entity (assets/fonts/*.png) too, but only one
  // font is ever compiled in - the project's first Font entity, falling
  // back to the legacy assets/ui/ascii.png when it has none yet. No
  // in-game font switching (see EVENTS.md).
  const fonts = projectData.fonts || [];
  const fontFilename = fonts[0]
    ? assetFilename(projectRoot, "fonts", fonts[0])
    : undefined;
  const fixed = await snesFixedAssets({ uiAssetDir, emoteFilenames, fontFilename });

  // Convert every sprite sheet that's referenced anywhere, once.
  const spriteConv = {};
  // v2: Array.from(new Set(...)), iterated with a plain for loop - not
  // `for (const id of newSetHere)`. This codebase's babel target silently
  // fails to iterate a bare Set in a for-of loop at all (the loop body
  // never runs, no error - found the hard way: spriteConv ended up empty
  // with no exception anywhere). Matches the same class of issue as the
  // Map-iterator spread bug in snesFixedAssets.js - exotic iterables (Set/
  // Map, not plain arrays) aren't safe to consume directly here; convert to
  // a real array first.
  const allSpriteIds = Array.from(new Set([].concat(...sceneSpriteIds, ...sceneAvatarIds)));
  for (let i = 0; i < allSpriteIds.length; i++) {
    const id = allSpriteIds[i];
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
  const MAX_OBJ_COLOURS = OBJ_PAL_SIZE / 2; // 16
  const NUM_OBJ_PALS = 8;
  const ACTOR_OBJ_PAL_POOL = [0, 3, 4, 5, 6, 7];
  const objPalForSlot = (k) =>
    k < ACTOR_OBJ_PAL_POOL.length ? ACTOR_OBJ_PAL_POOL[k] : 0;
  const padPal = (bytes) => {
    const out = bytes.slice(0, OBJ_PAL_SIZE);
    while (out.length < OBJ_PAL_SIZE) out.push(0);
    return out;
  };
  const palBytesFor = (colours) => {
    const words = snesgfx.paletteToBGR555(colours, MAX_OBJ_COLOURS);
    words[0] = 0; // colour 0 is hardware-transparent for every OBJ sprite
    return snesgfx.paletteBytes(words);
  };

  // A scene with more than ACTOR_OBJ_PAL_POOL.length (6) distinct sprite
  // sheets forces two unrelated actors onto the same OBJ palette register.
  // Writing the 2nd sprite's palette bytes over the 1st's would just clobber
  // it outright (last write wins, same CGRAM bytes) - both sprites' OAM
  // entries point at that one register, so the 1st sprite ends up drawn with
  // the 2nd's colours instead of its own. Merge instead: reuse a colour the
  // newcomer already shares with the claimant, otherwise append it to a free
  // slot; only once the *combined* colour count of every sprite sharing that
  // register exceeds 16 does an extra colour snap to the nearest
  // already-placed one, with a warning. Colour index 0 is skipped on both
  // sides - hardware-transparent for any OBJ sprite regardless of what's
  // stored there, never worth spending a real slot on.
  const mergeSpriteIntoPalette = (claimedColours, conv, label, sceneName) => {
    const remap = [0];
    for (let i = 1; i < conv.colors.length; i++) {
      const c = conv.colors[i];
      let found = -1;
      for (let j = 1; j < claimedColours.length; j++) {
        const p = claimedColours[j];
        if (p[0] === c[0] && p[1] === c[1] && p[2] === c[2]) {
          found = j;
          break;
        }
      }
      if (found !== -1) {
        remap.push(found);
      } else if (claimedColours.length < MAX_OBJ_COLOURS) {
        claimedColours.push(c);
        remap.push(claimedColours.length - 1);
      } else {
        let best = 1;
        let bestDist = Infinity;
        for (let j = 1; j < claimedColours.length; j++) {
          const p = claimedColours[j];
          const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = j;
          }
        }
        remap.push(best);
        warnings(
          `Scene '${sceneName}': sprite sheet '${label}' shares an OBJ ` +
            `palette with another sheet in this scene and their combined ` +
            `colours are over the 16-colour limit - extra colours snap to ` +
            `the nearest one already placed. Reduce the number of distinct ` +
            `sprite sheets in this scene, or the colours in this sheet.`
        );
      }
    }
    return conv.tiles.map((tileBytes) => {
      const rows = snesgfx
        .indicesFromTile(tileBytes)
        .map((row) => row.map((idx) => remap[idx]));
      return snesgfx.tileFromIndices(rows);
    });
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
    fixed.ACTOR_SIDE_B_SLOT0,
  ];

  // Build one scene's OBJ sheet (8 KB) + palette image (256 B) + per-slot
  // type/frames/palette arrays, starting from the fixed emote/placeholder sheet.
  const buildSceneSprites = (sceneIndex) => {
    const sceneName = scenes[sceneIndex].name || `#${sceneIndex}`;
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

    const objPalColours = {}; // objPal -> this scene's claimed colour list
    sceneSpriteIds[sceneIndex].forEach((id, k) => {
      const conv = spriteConv[id];
      const objPal = objPalForSlot(k);
      let tiles = conv.tiles;
      if (objPalColours[objPal]) {
        const label = spriteById(id).filename || spriteById(id).name || id;
        tiles = mergeSpriteIntoPalette(objPalColours[objPal], conv, label, sceneName);
      } else {
        objPalColours[objPal] = conv.colors.slice(); // scene-local copy - conv
        // is shared/cached across every scene that uses this sprite sheet
      }
      placeTiles(k, tiles.slice(0, 4));
      placeFrames(k, tiles, conv.spriteType);
      types[k] = conv.spriteType;
      frames[k] = conv.frameCount;
      writePal(objPal, palBytesFor(objPalColours[objPal]));
    });
    sceneAvatarIds[sceneIndex].forEach((id, k) => {
      const conv = spriteConv[id];
      placeTiles(fixed.AVATAR_SLOT0 + k, conv.tiles.slice(0, 4));
      if (k === 0) writePal(2, conv.paletteBytes);
    });

    return { sheet, palBytes, types, frames, pals };
  };

  const sceneSprites = scenes.map((_, i) => buildSceneSprites(i));

  // Player is always OBJ slot 0 - a fork-wide simplification kept as-is -
  // but which sheet is loaded there is per-scene now (playerSpriteIdForScene
  // above), so its type/frame count can no longer be a single compile-time
  // constant: scene.c reads them straight out of the per-scene
  // sprite_type_for_slot[0]/sprite_frames_for_slot[0] arrays SceneInit
  // already DMAs fresh every scene load, same as every other actor slot.
  const playerSpriteSlot = 0;

  // v2: actor.spriteType is now a real, explicit field (GB Studio 2.0 -
  // "static"/"actor"/"actor_animated"/"animated"), independent of
  // movementType - an actor can move around and still carry a decorative
  // auto-cycling sprite. Uses the same shared spriteTypeDec() helper Game
  // Boy's own compileData.js calls, rather than the v1.1.4 heuristic this
  // replaces (which only had movementType to infer from).
  const spriteTypeForActor = (id, actorSpriteType) => {
    const conv = spriteConv[id];
    return spriteTypeDec(actorSpriteType, conv ? conv.frameCount : 1);
  };

  // PLAYER_SET_SPRITE: scriptBuilder encodes the target as an index into the
  // project's full spriteSheets[]. At runtime only the sheets loaded in the
  // *current scene* are in VRAM, so this is per-scene: project sprite index ->
  // the scene's OBJ slot, or 0xFF if that sheet isn't loaded there (the engine
  // no-ops on 0xFF).
  const sceneSlotForIndex = scenes.map((_, sceneIndex) =>
    spriteSheets.map((s) => {
      const k = sceneSpriteIds[sceneIndex].indexOf(s.id);
      return k >= 0 ? k : 0xff;
    })
  );

  // ---- scripts + scene blobs ------------------------------------------
  // Raw (unresolved) bytecode per event_ptrs[] slot; placeholders are resolved
  // in one pass at the end so a sub-script pushed mid-compile keeps its slot.
  const rawScripts = [];
  const pushRaw = (bytes) => {
    rawScripts.push(bytes);
    return rawScripts.length - 1;
  };

  // `banked` shim for scriptBuilder: SET_INPUT_SCRIPT / SET_TIMER_SCRIPT compile
  // a sub-script and expect a {bank, offset} back. On SNES a sub-script is just
  // another event_ptrs[] entry, so bank = 0 and offset = its index.
  const banked = { push: (bytes) => ({ bank: 0, offset: pushRaw(bytes) }) };

  // compileEntityEvents appends the terminating 0 and resolves label jumps; the
  // placeholders left are __REPLACE:STRING_* (dialogue) - resolved at the end.
  const compile = (script, entity, entityType, entityIndex, sceneIndex, scene, out = []) => {
    compileEntityEvents((script || []).filter((e) => e.command !== EVENT_END), {
      scene,
      sceneIndex,
      scenes,
      sprites: projectData.spriteSheets || [],
      avatars: sceneAvatars[sceneIndex] || [],
      // Projectiles (v4): launchProjectile()/weaponAttack() (scriptBuilder.js)
      // resolve a sprite to this scene's own OBJ slot (0-7) with this, same
      // per-scene pool sceneSpriteIds[i] already seeds actors/the player from
      // (above) - not the project-wide sprite index PLAYER_SET_SPRITE uses.
      spriteSlots: sceneSpriteIds[sceneIndex] || [],
      backgrounds,
      music: projectData.music || [],
      emotes,
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
    });
    return out;
  };

  const pushScript = (bytes) => pushRaw(bytes);

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
    const sceneScriptIdx = pushScript(sceneOut);

    // Projectiles (v4, follow-up): fired when a projectile whose own
    // collisionGroup is "1"/"2"/"3" hits the *player* - a scene-level script
    // (not per-actor), matching SceneEditor.tsx's already-existing "On
    // Player Hit" tab / B's own script_p_hit1/2/3. There's no "player" slot
    // here (unlike Actor.hit1/2/3Script's sibling "hitPlayer"->"script"
    // mapping) - a player-owned projectile hitting the player makes no
    // sense to author against, so collisionGroup "player" just doesn't fire
    // anything on this path, same as B.
    const playerHit1ScriptIdx = pushScript(
      compile(scene.playerHit1Script, scene, "scene", sceneIndex, sceneIndex, scene)
    );
    const playerHit2ScriptIdx = pushScript(
      compile(scene.playerHit2Script, scene, "scene", sceneIndex, sceneIndex, scene)
    );
    const playerHit3ScriptIdx = pushScript(
      compile(scene.playerHit3Script, scene, "scene", sceneIndex, sceneIndex, scene)
    );

    const actorScriptIdx = (scene.actors || []).map((actor, i) =>
      pushScript(compile(actor.script, actor, "actor", i, sceneIndex, scene))
    );
    const triggerScriptIdx = (scene.triggers || []).map((trigger, i) =>
      pushScript(compile(trigger.script, trigger, "trigger", i, sceneIndex, scene))
    );
    // Projectiles (v4): fired when a projectile whose own collisionGroup is
    // "1"/"2"/"3" hits this actor - a projectile belonging to "player" fires
    // the actor's regular script instead (matches B's ActorEditor.tsx
    // hitTabs: the "Player" hit tab maps to the plain "script" key, only
    // hit1/2/3 get their own dedicated script). Always compiled (even when
    // empty, same as actor.script) so every actor has a valid event_ptrs[]
    // slot to run - a hit with no authored script just completes instantly.
    const hit1ScriptIdx = (scene.actors || []).map((actor, i) =>
      pushScript(compile(actor.hit1Script, actor, "actor", i, sceneIndex, scene))
    );
    const hit2ScriptIdx = (scene.actors || []).map((actor, i) =>
      pushScript(compile(actor.hit2Script, actor, "actor", i, sceneIndex, scene))
    );
    const hit3ScriptIdx = (scene.actors || []).map((actor, i) =>
      pushScript(compile(actor.hit3Script, actor, "actor", i, sceneIndex, scene))
    );
    // On Update subsystem (v4): Actor.updateScript, the "On Update" tab
    // ActorEditor.tsx already had wired up (schema field pre-existing,
    // carried over from GB - only the SNES compiler/engine side was
    // missing). Always compiled, same as every other actor script slot -
    // update_script.c's ActorStartUpdate() checks for a real (non-empty)
    // compiled script at launch time, not here.
    const updateScriptIdx = (scene.actors || []).map((actor, i) =>
      pushScript(compile(actor.updateScript, actor, "actor", i, sceneIndex, scene))
    );

    // Collision bitmap the C engine reads: 1 bit per tile, packed LSB-first,
    // ceil(w*h/8) bytes - col_solid() in scene.c does
    // `scene_col[idx>>3] >> (idx&7) & 1`.
    //
    // v2 bug (M13, user-found: player could only ever walk right - can_step()
    // treated most of the map as solid): this comment used to say
    // "scene.collisions (already bit-packed)" and just truncated the raw
    // array to colLen bytes - true on `main` (GB Studio 1.2.2: scene.collisions
    // really is a plain solid/clear bitmap), but GB Studio 2.0.0-beta5
    // (this branch's base) changed the format to one BYTE per tile, holding
    // COLLISION_TOP/BOTTOM/LEFT/RIGHT direction flags (consts.js) - GB's own
    // compileData.js reflects this (`collisionsLength = w*h`, no /8). Ported
    // forward blindly at M7 without noticing the format had changed, so every
    // SNES scene's collision data was a meaningless truncated prefix of the
    // real per-tile bytes, not a real bitmap - never caught because nothing
    // before now actually drove the player with real interactive input
    // against a real authored scene's collisions (see MIGRATION_V2_AUDIT.md
    // M13's investigation). This target has no directional-collision concept
    // (col_solid is a single solid/clear bit), so any nonzero flag byte -
    // a wall on any side - counts as a fully solid tile.
    const colLen = Math.ceil((w * h) / 8);
    const collisions = new Array(colLen).fill(0);
    const rawCollisions = scene.collisions || [];
    for (let i = 0; i < w * h; i++) {
      if (rawCollisions[i]) {
        collisions[i >> 3] |= 1 << (i & 7);
      }
    }

    const actorEntries = [];
    (scene.actors || []).forEach((actor, i) => {
      actorEntries.push(
        clampByte(actor.x),
        clampByte(actor.y),
        dirDec(actor.direction),
        moveDec(actor.movementType),
        slotForActor(sceneIndex, actor.spriteSheetId),
        actorScriptIdx[i],
        spriteTypeForActor(actor.spriteSheetId, actor.spriteType),
        animSpeedDec(actor.animSpeed),
        actor.animate ? 1 : 0,
        // Projectiles (v4): [collision_group, hit1Idx, hit2Idx, hit3Idx] - see
        // hit1ScriptIdx/2/3 above. collisionGroupDec("") === 0 (COLLISION_GROUP_NONE)
        // for an actor that never opted in, matching B's own default.
        collisionGroupDec(actor.collisionGroup),
        hit1ScriptIdx[i],
        hit2ScriptIdx[i],
        hit3ScriptIdx[i],
        // On Update subsystem (v4): see updateScriptIdx above.
        updateScriptIdx[i]
      );
    });

    // per-scene OBJ-slot tables, read by SceneInit straight after w/h
    const spr = sceneSprites[sceneIndex];
    const sprSlotBytes = [].concat(spr.types, spr.frames, spr.pals);

    // M6 (v4): banded X-axis parallax scrolling, driven by the SNES's own
    // HDMA (setParallaxScrolling/HDMATable16, appData/src/snes/src/parallax.c)
    // instead of a second BG layer - matches GB Studio 3.x's real model (N
    // stacked bands on the SAME background, not two independent layers).
    // Fixed-size table (MAX_PARALLAX_LAYERS * 2 bytes), matching the [24]
    // sprite-slot table's own "always present, zero-filled when unused"
    // convention. lines=0 in the first entry means "no parallax" to the
    // engine (skip HDMA, plain bgSetScroll as before).
    const MAX_PARALLAX_LAYERS = 3;
    const parallaxLayers = (scene.parallax || []).filter((l) => l.height > 0);
    if (parallaxLayers.length > MAX_PARALLAX_LAYERS) {
      warnings(
        `Scene has ${parallaxLayers.length} parallax layers, but only the first ${MAX_PARALLAX_LAYERS} fit - the rest will be ignored.`
      );
    }
    const usedLayers = parallaxLayers.slice(0, MAX_PARALLAX_LAYERS);
    const screenLines = snesTarget.screenTileHeight * 8;
    let linesUsed = 0;
    const parallaxBytes = [];
    usedLayers.forEach((layer, i) => {
      const isLast = i === usedLayers.length - 1;
      const lines = isLast
        ? Math.max(1, screenLines - linesUsed)
        : Math.min(layer.height * 8, screenLines - linesUsed);
      linesUsed += lines;
      // shift is a signed byte (INT8-equivalent): positive = slower than
      // camera (>> shift), negative = faster (<< -shift), 0 = matches the
      // camera exactly - see parallax.c.
      parallaxBytes.push(lines & 0xff, layer.speed & 0xff);
    });
    while (parallaxBytes.length < MAX_PARALLAX_LAYERS * 2) {
      parallaxBytes.push(0, 0);
    }

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
      sceneTypeDec(scene.type), // v2 M5a: genre dispatch byte
      sprSlotBytes, // [24] sprite_type[8], sprite_frames[8], sprite_pal[8]
      parallaxBytes, // [6] M6 (v4): up to 3 {lines, shift} parallax bands
      // [3] Projectiles (v4, follow-up): On Player Hit script indices,
      // collision group 1/2/3 - see playerHit1/2/3ScriptIdx above.
      playerHit1ScriptIdx,
      playerHit2ScriptIdx,
      playerHit3ScriptIdx,
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
        const e = ty < conv.tileH && tx < conv.tileW ? conv.tilemap[ty * conv.tileW + tx] : 0;
        map.push(e & 0xff, (e >> 8) & 0xff);
      }
    }
    return {
      name: `bg${i}`,
      tiles: conv.tileBytes,
      map,
      pal: conv.paletteBytes,
      w: conv.tileW,
      h: conv.tileH,
    };
  });

  // ---- per-scene priority-tile tilemap overrides (M7, v4) -------------
  // Most scenes need none - the shared bgTables[i].map above (32x32x2,
  // padded) is used unmodified, matching every scene that references the
  // same background today. A scene that paints any TILE_PROP_PRIORITY
  // collision-grid tiles (BrushToolbar.js) gets its own copy of that
  // background's tilemap with BG_TIL_PRIO (snesgfx.js's tile<<13 priority
  // bit) OR'd in at the painted positions. This can't be a shared per-
  // background flag: two scenes can share one background and paint
  // different priority patterns, so priority has to live at the same
  // per-scene granularity collision itself already does.
  const BG_TIL_PRIO_HI = 0x20; // (1<<13) >> 8 - the high byte of a tilemap word
  const scenePriorityMaps = scenes.map((scene, sceneIndex) => {
    const bgIndex = bgIndexById[scene.backgroundId] || 0;
    const bg = bgTables[bgIndex];
    const collisions = scene.collisions || [];
    let hasPriority = false;
    for (let i = 0; i < bg.w * bg.h; i++) {
      if (collisions[i] & TILE_PROP_PRIORITY) {
        hasPriority = true;
        break;
      }
    }
    if (!hasPriority) return null;
    const map = bg.map.slice();
    for (let ty = 0; ty < bg.h; ty++) {
      for (let tx = 0; tx < bg.w; tx++) {
        if (collisions[ty * bg.w + tx] & TILE_PROP_PRIORITY) {
          map[(ty * 32 + tx) * 2 + 1] |= BG_TIL_PRIO_HI;
        }
      }
    }
    return { name: `scene_bgmap_${sceneIndex}`, map };
  });

  // ---- start position ------------------------------------------------
  const startSceneIndex = Math.max(0, scenes.findIndex((s) => s.id === settings.startSceneId));
  const startX = clampByte(settings.startX !== undefined ? settings.startX : 0);
  const startY = clampByte(settings.startY !== undefined ? settings.startY : 0);
  const startDir = dirDec(settings.startDirection || "down");

  // ---- strings -----------------------------------------------------
  const strBytes = (s) => {
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
    const intern = (item) => {
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
  const sceneSprTileIdx = sceneSprites.map((spr) => sprTiles.intern(spr.sheet));
  const sceneSprPalIdx = sceneSprites.map((spr) => sprPals.intern(spr.palBytes));
  const sceneSprSlotIdx = sceneSlotForIndex.map((m) => sprSlots.intern(m.length ? m : [0xff]));
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
${sprTiles.arrays.map((_, i) => `extern const unsigned char scene_spr_${i}[${SPR_TILES_SIZE}];`).join("\n")}
${sprPals.arrays.map((_, i) => `extern const unsigned char scene_spr_pal_${i}[${SPR_PAL_SIZE}];`).join("\n")}
extern const unsigned char *const scene_spr_ptrs[${scenes.length}];
extern const unsigned char *const scene_spr_pal_ptrs[${scenes.length}];
extern const unsigned char *const scene_sprite_slot_ptrs[${scenes.length}];
extern const unsigned char ui_font[${fixed.uiFont.length}];
extern const unsigned char ui_pal[${fixed.uiPaletteBytes.length}];

${bgTables
  .map(
    (b) =>
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

/* M7 (v4): per-scene priority-tile tilemap override - 0 (most scenes) means
 * "use bg_maps_ptrs[bg_index] unmodified", a real pointer means this scene
 * painted TILE_PROP_PRIORITY tiles and has its own tilemap copy with the
 * SNES BG_TIL_PRIO bit set at those positions. See SceneInit (scene.c). */
${scenePriorityMaps
  .filter((e) => e)
  .map((e) => `extern const unsigned char ${e.name}[${e.map.length}];`)
  .join("\n")}
extern const unsigned char *const scene_bg_map_ptrs[${scenes.length}];

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
#define PLAYER_ANIM_SPEED 3
#define NUM_MUSIC_TRACKS ${(projectData.music || []).length}

#endif
`;

  const scriptArrays = scriptBytes.map((bytes, i) => cArray(`script_${i}`, bytes)).join("\n");

  const sceneArrays = sceneBlobs.map((blob, i) => cArray(`scene_${i}`, blob)).join("\n");

  const stringArrays = emittedStrings.map((s, i) => cArray(`string_${i}`, strBytes(s))).join("\n");

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
      .filter((p) => p.bytes && p.bytes.length)
      .map((p) => `${p.label}:\n${asmDb(p.bytes)}`)
      .join("\n");
    return `${asmHeader}\n.section "rodata_${assetName}" superfree\n${body}\n.ends\n`;
  };

  const assetsData = {};
  bgTables.forEach((b) => {
    assetsData[`${b.name}_data.as`] = asmAsset(b.name, [
      { label: `${b.name}_tiles`, bytes: b.tiles },
      { label: `${b.name}_pal`, bytes: b.pal },
      { label: `${b.name}_map`, bytes: b.map },
    ]);
  });
  assetsData["uifont_data.as"] = asmAsset("uifont", [
    { label: "ui_font", bytes: fixed.uiFont },
    { label: "ui_pal", bytes: fixed.uiPaletteBytes },
  ]);
  sprTiles.arrays.forEach((a, i) => {
    assetsData[`scene_spr_${i}_data.as`] = asmAsset(`scene_spr_${i}`, [
      { label: `scene_spr_${i}`, bytes: a },
    ]);
  });
  sprPals.arrays.forEach((a, i) => {
    assetsData[`scene_spr_pal_${i}_data.as`] = asmAsset(`scene_spr_pal_${i}`, [
      { label: `scene_spr_pal_${i}`, bytes: a },
    ]);
  });
  scenePriorityMaps.forEach((entry) => {
    if (!entry) return;
    assetsData[`${entry.name}_data.as`] = asmAsset(entry.name, [
      { label: entry.name, bytes: entry.map },
    ]);
  });
  const includeLines = Object.keys(assetsData)
    .map((f) => `.include "src/data/${f}"`)
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
${sceneSprTileIdx.map((i) => `    scene_spr_${i}`).join(",\n")}
};
const unsigned char *const scene_spr_pal_ptrs[${scenes.length}] = {
${sceneSprPalIdx.map((i) => `    scene_spr_pal_${i}`).join(",\n")}
};
const unsigned char *const scene_sprite_slot_ptrs[${scenes.length}] = {
${sceneSprSlotIdx.map((i) => `    scene_spr_slot_${i}`).join(",\n")}
};
const unsigned char *const bg_tiles_ptrs[${nBg}] = { ${bgTables.map((b) => `${b.name}_tiles`).join(", ")} };
const unsigned char *const bg_maps_ptrs[${nBg}] = { ${bgTables.map((b) => `${b.name}_map`).join(", ")} };
const unsigned char *const bg_pals_ptrs[${nBg}] = { ${bgTables.map((b) => `${b.name}_pal`).join(", ")} };
const unsigned short bg_tiles_len[${nBg}] = { ${bgTables.map((b) => b.tiles.length).join(", ")} };
const unsigned short bg_maps_len[${nBg}] = { ${bgTables.map((b) => b.map.length).join(", ")} };
const unsigned short bg_pals_len[${nBg}] = { ${bgTables.map((b) => b.pal.length).join(", ")} };
const unsigned char bg_map_w[${nBg}] = { ${bgTables.map((b) => b.w).join(", ")} };
const unsigned char bg_map_h[${nBg}] = { ${bgTables.map((b) => b.h).join(", ")} };
const unsigned char *const scene_bg_map_ptrs[${scenes.length}] = {
${scenePriorityMaps.map((e) => (e ? `    ${e.name}` : "    0")).join(",\n")}
};

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
    engineFieldsC,
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
      scriptBytes,
    },
  };
};

export default compileSnesData;
export { resolvePlaceholders };
