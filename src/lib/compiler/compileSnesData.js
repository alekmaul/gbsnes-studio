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
 * (position 6, after height, before the [32] sprite-slot table) - read here
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
 */
import fs from "fs-extra";
import Path from "path";
import snesgfx from "./snesgfx";
import { createScenePacker } from "./packSceneSprites";
import { buildMapEngineBackground, METATILE_PROP_WORDS } from "./snesMapEngine";
import compileEntityEvents from "./compileEntityEvents";
import { snesFixedAssets } from "./snesFixedAssets";
import { dirDec, moveDec, animSpeedDec, spriteTypeDec, collisionGroupDec } from "./helpers";
import { getMusicIndex } from "../events/helpers";
import { assetFilename } from "../helpers/gbstudio";
import { projectTemplatesRoot, TILE_PROP_PRIORITY, COLLISION_ALL, TILE_PROP_LADDER, engineRoot } from "../../consts";
import snesTarget from "./targets/snes";
import migrateProject from "../project/migrateProject";
import { precompileEngineFields } from "../helpers/engineFields";

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
        // user-found (2026-09-27): "gbhtml" hasn't existed since the GB
        // target was removed (v3) - this fallback silently pointed at a
        // nonexistent template the whole time, only never hit because
        // every real/test project already had its own assets/ui/*.
        Path.join(projectTemplatesRoot, "sneshtml", "assets", "ui", name),
        dest
      );
      warnings(`assets/ui/${name} was missing, copied the default in`);
    }
  }
  return uiDir;
};

const clampByte = (n) => Math.max(0, Math.min(255, n | 0));

// M9.4 (SPRITE_EDITOR_PROGRESS.md): a signed byte (s8, -128..127), two's
// -complement encoded for scene.c's own (s8)e[0]-style cast to read back -
// used for a free-form metasprite tile's dx/dy, which can be negative
// (a tile placed left of / above the actor's own anchor).
const toS8Byte = (n) => {
  const clamped = Math.max(-128, Math.min(127, Math.round(n)));
  return clamped & 0xff;
};

// A per-scene/actor/trigger script reference (event_ptrs[] index) is a
// project-wide index shared across every scene's scripts, cumulatively
// pushed as compilation proceeds scene by scene - so it routinely exceeds
// 255 well before the end of a multi-scene project (v4 fix, user-found:
// "the triggers are not working when I press A" in a real 8-scene sample -
// traced to a later scene's trigger/actor script indices already being in
// the 300s). Storing it as a single byte silently wrapped it mod 256
// (cArray's own `& 0xff`), pointing every such reference at a random wrong
// script once the project-wide count passed 256 - not just triggers: the
// same index space feeds scene/player-hit/actor/hit/update script slots
// too, so every one of them needed the same 2-byte (little-endian) width.
const u16b = (n) => [n & 0xff, (n >> 8) & 0xff];

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
// this is the compiler-side half, packing the project's own chosen values
// (or each field's defaultValue, for one it never touched) into the raw
// byte-array layout engine_fields.h's macros and the runtime ENGINE_FIELD_*
// opcodes both address by the same byte offset (see compileEngineFields()
// below). "define" (GB Studio 3.x's own #define-and-recompile cType, used
// there for input-button remapping) has no matching field on this engine
// and never appears in this schema.
let engineFieldsSchema = null;
const getEngineFieldsSchema = () => {
  if (!engineFieldsSchema) {
    const schemaPath = Path.join(engineRoot, "snes", "engine.json");
    engineFieldsSchema = (fs.readJsonSync(schemaPath).fields || []);
  }
  return engineFieldsSchema;
};

// Values are packed into one little-endian byte array (engine_fields_raw[],
// see engine_fields.h) rather than emitted as separate C globals - a runtime
// ENGINE_FIELD_UPDATE/STORE opcode (scriptBuilder.js's engineFieldSetToValue/
// engineFieldSetToVariable/engineFieldStoreInVariable) addresses a field by
// the same byte offset precompileEngineFields() (src/lib/helpers/
// engineFields.ts) computes on the compiler side, so the two sides need one
// shared, byte-addressable layout - a named global per field (the old
// compile-time-only scheme) had no runtime address a script opcode could
// target. 65816 is little-endian, matching a plain `s16`/`u16` store, so no
// endian conversion is needed on the C side beyond this byte order.
const engineFieldByteSize = (cType) => (cType === "UWORD" || cType === "WORD" ? 2 : 1);

const compileEngineFields = (rawEngineFieldValues) => {
  const valueById = {};
  (rawEngineFieldValues || []).forEach((v) => {
    valueById[v.id] = v.value;
  });
  const bytes = [];
  const comments = [];
  getEngineFieldsSchema().forEach((field) => {
    const offset = bytes.length;
    const raw = valueById[field.key];
    const numeric = Number(raw);
    const value = raw !== undefined && Number.isFinite(numeric)
      ? numeric
      : field.defaultValue;
    const size = engineFieldByteSize(field.cType);
    const fieldBytes = [];
    for (let i = 0; i < size; i++) {
      fieldBytes.push((value >> (8 * i)) & 0xff);
    }
    bytes.push(...fieldBytes);
    comments.push(`    ${fieldBytes.join(", ")}, /* ${field.key} @${offset} = ${value} */`);
  });
  return `/* Generated by src/lib/compiler/compileSnesData.js from
 * appData/src/snes/engine.json. Do not edit - change engine.json's
 * defaultValue, or the project's own Settings > Engine Fields, instead. */
#include "gbs_types.h"
#include "engine_fields.h"

u8 engine_fields_raw[ENGINE_FIELDS_SIZE] = {
${comments.join("\n")}
};
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
    // v4 fix (user-found: this fired even for a background well within the
    // real cap): was hardcoded to the old pre-SC_64x64 32-tile limit,
    // duplicating (and disagreeing with) the editor-side check that already
    // uses the engine's real capacity (targets/snes.js's maxBackgroundWidth/
    // Height, in pixels - divide by 8 for tiles, same SC_64x64 ceiling
    // scene.c's SceneInit actually enforces). Derived from the target
    // descriptor rather than a second hardcoded number, so the two checks
    // can't drift apart again.
    const maxBgTileW = snesTarget.maxBackgroundWidth / 8;
    const maxBgTileH = snesTarget.maxBackgroundHeight / 8;
    if (conv.tileW > maxBgTileW || conv.tileH > maxBgTileH) {
      warnings(
        `Background '${bg.filename}' is ${conv.tileW}x${conv.tileH} tiles; ` +
          `SNES scenes wider/taller than ${maxBgTileW}x${maxBgTileH} tiles are not supported.`
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
  // M9.4: mirrors gbs_types.h's own #define MAX_PROJECTILES 4 - needed here
  // only for the OAM hardware-budget warning below (buildSceneSprites),
  // which has to account for the whole projectile pool's own worst-case
  // OAM cost alongside actors/emote/avatar.
  const MAX_PROJECTILES = 4;
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

  // Projectiles (v4) + v4 follow-up (Set Sprite Sheet runtime swap, user-found):
  // a scene's own LAUNCH_PROJECTILE/WEAPON_ATTACK events, AND ACTOR_SET_SPRITE/
  // PLAYER_SET_SPRITE events, can reference any project sprite sheet, same as
  // an avatarId - it has to be loaded into this scene's own OBJ pool for the
  // runtime slot lookup (below, and Script_ActorSetSprite_b/
  // Script_PlayerSetSprite_b in script_cmds.c) to find it, same reasoning as
  // sceneAvatarIds just above this in the file. Originally only scanned
  // LAUNCH_PROJECTILE/WEAPON_ATTACK - a sheet referenced *only* via a sprite-
  // swap event silently never got a slot (0xFF, the opcode's own no-op guard),
  // even though the author genuinely referenced it. Recurses into nested
  // branches the same way.
  // ACTOR_SET_STATE/PLAYER_SET_STATE (named animation states, v4) compile
  // through the exact same actorSetSprite/playerSetSprite helpers as
  // ACTOR_SET_SPRITE/PLAYER_SET_SPRITE (see eventActorSetState.js), but their
  // JSON only carries stateId - the real target sheet is one level removed,
  // resolved via the *referenced* sheet's own states[] (Phase 2). Mirrors
  // eventActorSetState.js's own resolution exactly so the scanner and the
  // compiler never disagree on which sheet an event actually swaps to.
  const resolveStateTargetSpriteSheetId = (args) => {
    const sheet = spriteById(args.spriteSheetId);
    const state = sheet && sheet.states && sheet.states.find((s) => s.id === args.stateId);
    return state ? state.spriteSheetId : args.spriteSheetId;
  };
  const scanRuntimeSpriteIds = (evs, ids) => {
    (evs || []).forEach((ev) => {
      if (ev.command && ev.args) {
        let targetId;
        if (
          ev.command === "EVENT_LAUNCH_PROJECTILE" ||
          ev.command === "EVENT_WEAPON_ATTACK" ||
          ev.command === "EVENT_ACTOR_SET_SPRITE" ||
          ev.command === "EVENT_PLAYER_SET_SPRITE"
        ) {
          targetId = ev.args.spriteSheetId;
        } else if (
          ev.command === "EVENT_ACTOR_SET_STATE" ||
          ev.command === "EVENT_PLAYER_SET_STATE"
        ) {
          targetId = resolveStateTargetSpriteSheetId(ev.args);
        }
        if (isSprite(targetId) && ids.indexOf(targetId) === -1) {
          ids.push(targetId);
        }
      }
      if (ev.children) {
        Object.keys(ev.children).forEach((k) => scanRuntimeSpriteIds(ev.children[k], ids));
      }
    });
  };
  const sceneRuntimeSpriteIds = scenes.map((sc) => {
    const ids = [];
    scanRuntimeSpriteIds(sc.script, ids);
    (sc.actors || []).forEach((a) => {
      scanRuntimeSpriteIds(a.script, ids);
      scanRuntimeSpriteIds(a.startScript, ids);
      scanRuntimeSpriteIds(a.updateScript, ids);
      scanRuntimeSpriteIds(a.hit1Script, ids);
      scanRuntimeSpriteIds(a.hit2Script, ids);
      scanRuntimeSpriteIds(a.hit3Script, ids);
    });
    (sc.triggers || []).forEach((t) => scanRuntimeSpriteIds(t.script, ids));
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
    sceneRuntimeSpriteIds[i].forEach(add);
    const distinct = new Set(
      [playerSpriteIdForScene(sc)]
        .concat((sc.actors || []).map((a) => a.spriteSheetId))
        .concat(sceneRuntimeSpriteIds[i])
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
    const sheet = spriteById(id);
    // M9.4 (SPRITE_EDITOR_PROGRESS.md): a Free-form (Metasprite) sheet's
    // authored tile placements (sheet.metasprites/metaspriteTiles) go
    // through a different conversion - imageToFreeformMetaspriteData, not
    // imageToSpriteData's pixel-geometry frame-count inference, since a
    // free-form sheet's frame content isn't "N 16x16 columns in a row"
    // anymore. buildSceneSprites (below) branches on sheet.metaspriteMode
    // to know which shape of conv object it's looking at.
    // eslint-disable-next-line no-await-in-loop
    const conv = sheet.metaspriteMode
      ? await snesgfx.imageToFreeformMetaspriteData(
          assetFilename(projectRoot, "sprites", sheet),
          { frames: sheet.metasprites, tiles: sheet.metaspriteTiles }
        )
      : await snesgfx.imageToSpriteData(
          assetFilename(projectRoot, "sprites", sheet),
          { animationTypeOverride: sheet.animationType }
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

  // M8.3 (SPRITE_EDITOR_PROGRESS.md): every actor sheet's "extra" poses
  // (anything beyond its own primary/frame-0 pose, which still always lives
  // at this sheet's own slot k - see placeTiles(k, ...) below, unchanged)
  // are packed into one of 5 parallel per-slot arrays, matched 1:1 to the
  // engine's own extra_pose_down_b/up_a/up_b/side_a/side_b globals
  // (scene.c). Each stored byte is a HALF-tile-base (real VRAM tile index =
  // value*2) - every createScenePacker() placement is already 2-aligned, so
  // this fits the full 0-511 tile range in one byte (0 = unused: this pose
  // was never placed for this slot, matching frames_len/sprite_type always
  // gating whether the engine ever actually reads it).
  const EXTRA_POSE_KEYS = ["downB", "upA", "upB", "sideA", "sideB"];

  // M9.4 (SPRITE_EDITOR_PROGRESS.md): metaspriteMode is orthogonal to
  // animationType - a Free-form sheet can still be "fixed"/"multi"/
  // "multi_movement" (entitiesTypes.ts), it only changes what one frame's
  // *content* is, not how many frames there are or what they mean. So
  // sprite_type_for_slot needs no new value for a metasprite-mode slot -
  // same 3 real engine sprite types as the legacy path, just driven
  // directly from the authored animationType instead of inferred from a
  // sheet's own pixel width the way detectActorFrameCountAndType does for
  // a plain sheet (snesgfx.js).
  const animationTypeToSpriteType = (animationType) => {
    if (animationType === "multi") return 1; // SPRITE_ACTOR
    if (animationType === "multi_movement") return 2; // SPRITE_ACTOR_ANIMATED
    return 0; // "fixed", or unset - SPRITE_STATIC
  };

  // M9.4: encodes one metasprite-mode slot's per-frame tile-placement data -
  // see scene.h's own metasprite_frame_base comment for the full wire
  // format. frameBlocks[frameIndex] is an array of already-VRAM-placed
  // {dx, dy, halfTileBase, flags} entries (packer.alloc() already ran by
  // the time this is called). Returns just the slot's own payload bytes
  // (the frameOffset table + entry blocks) - the caller prefixes a u16
  // slotByteLen when assembling the final per-slot bytes.
  const encodeMetaspriteSlot = (frameBlocks) => {
    const frameBytes = frameBlocks.map((entries) =>
      [].concat(
        entries.length,
        ...entries.map((e) => [e.dx, e.dy, e.halfTileBase & 0xff, e.flags & 0xff])
      )
    );
    let offset = frameBlocks.length * 2; // bytes, right after the frameOffset table itself
    const frameOffsets = [];
    frameBytes.forEach((bytes) => {
      frameOffsets.push(...u16b(offset));
      offset += bytes.length;
    });
    return [].concat(frameOffsets, ...frameBytes);
  };

  // Build one scene's OBJ sheet (16 KB, 512 tiles - 2 full OBJ "name tables",
  // see CLAUDE.md's "Fixed VRAM layout" entry) + palette image (256 B) +
  // per-slot type/frames/palette/extra-pose arrays. Tiles 0-95 (placeholder +
  // emotes + avatars) keep their exact fixed addresses, unchanged since M5c/
  // M7 - see snesFixedAssets.js's own header comment. Tiles 96-511 are
  // packed on demand by createScenePacker() instead of 5 fixed 32-tile
  // regions always reserved regardless of real per-scene demand (the
  // pre-M8.3 scheme) - see packSceneSprites.js.
  const SHEET_TOTAL_TILES = 512;
  const SHEET_RESERVED_TILES = 96; // pair0 (primary poses) + pair1 (emotes) + pair2 (avatars)
  const buildSceneSprites = (sceneIndex) => {
    const sceneName = scenes[sceneIndex].name || `#${sceneIndex}`;
    const packer = createScenePacker({
      totalTiles: SHEET_TOTAL_TILES,
      reservedTiles: SHEET_RESERVED_TILES
    });
    const sheet = packer.sheet; // all-zero, SHEET_TOTAL_TILES*32 bytes long
    // Copy in the fixed 0-95 prefix (placeholder + emotes; avatars are
    // written below, into this same reserved range) - createScenePacker()
    // never allocates there (reservedTiles), so this can't collide with it.
    for (let i = 0; i < SHEET_RESERVED_TILES * 32; i++) {
      sheet[i] = fixed.spriteTiles[i] || 0;
    }
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

    writePal(0, fixed.spritePaletteBytes); // placeholder (empty slot 0)
    writePal(1, fixed.emotePaletteBytes); // OBJ palette 1 = emotes
    writePal(2, fixed.spritePaletteBytes); // OBJ palette 2 = avatar 0 (below)

    const types = new Array(SPRITE_SLOTS).fill(0);
    const frames = new Array(SPRITE_SLOTS).fill(1);
    const pals = [];
    for (let k = 0; k < SPRITE_SLOTS; k++) pals.push(objPalForSlot(k));
    // A legacy (non-metaspriteMode) actor is still exactly 1 real OAM
    // hardware sprite per frame - M8.3 only changes WHERE that one sprite's
    // tile data lives in VRAM (dynamic per-scene packing instead of a fixed
    // compile-time offset), not how many OAM entries it costs.
    // M9.4: a metaspriteMode slot's real cost (set below, in the per-slot
    // loop) is its own worst-case simultaneous-tile count across its
    // frames - actor_oam_base[]'s prefix sum (scene.c, M7 groundwork) reads
    // this array generically either way, no change needed there.
    const oamIds = new Array(SPRITE_SLOTS).fill(1);
    const extraPose = {};
    EXTRA_POSE_KEYS.forEach((key) => {
      extraPose[key] = new Array(SPRITE_SLOTS).fill(0);
    });
    const placeExtraPose = (key, k, tiles) => {
      const base = packer.alloc(tiles, `${sceneName} slot ${k} (${key})`);
      if (base === null) return; // over budget - packer already warned once
      extraPose[key][k] = base >> 1; // half-tile-base, fits a u8
    };
    // M9.4: null = not metasprite-mode/empty for this slot (-> [0,0] in the
    // final blob); a real slot's own encodeMetaspriteSlot() payload bytes
    // otherwise, set in the per-slot loop below.
    const metaspriteSlotBytes = new Array(SPRITE_SLOTS).fill(null);

    const objPalColours = {}; // objPal -> this scene's claimed colour list
    sceneSpriteIds[sceneIndex].forEach((id, k) => {
      const sheet = spriteById(id);
      const conv = spriteConv[id];
      const objPal = objPalForSlot(k);
      if (sheet.metaspriteMode) {
        // M9.4 (SPRITE_EDITOR_PROGRESS.md): a Free-form (Metasprite) sheet -
        // every placed tile (every frame, including frame 0) goes through
        // packer.alloc() uniformly, unlike the legacy branch below where
        // frame 0 always lives at a fixed placeTiles(k, ...) address. See
        // encodeMetaspriteSlot's own comment for the wire format.
        let tilesPool = conv.tiles;
        if (objPalColours[objPal]) {
          const label = sheet.filename || sheet.name || id;
          tilesPool = mergeSpriteIntoPalette(objPalColours[objPal], conv, label, sceneName);
        } else {
          objPalColours[objPal] = conv.colors.slice();
        }
        writePal(objPal, palBytesFor(objPalColours[objPal]));

        // dx/dy are precomputed here (not left as raw editor-space
        // coordinates) so scene.c's render loop can add them straight onto
        // a->x/a->y with no extra per-slot geometry lookup. The legacy
        // anchor (actor_render_tile's own -8/-16) is a 16x16 sprite
        // *horizontally centered*, *bottom-anchored* on the actor's own
        // position - generalized here to "centered on canvasWidth, anchored
        // to the bottom of canvasHeight" so a 16x16 canvas with one tile at
        // editor-space (0,0) reproduces the exact legacy -8/-16 byte-for-byte.
        const canvasWidth = sheet.canvasWidth || 16;
        const canvasHeight = sheet.canvasHeight || 16;
        let maxEntriesPerFrame = 0;
        const frameBlocks = (conv.metaspriteFrames || []).map((frameTiles) => {
          const entries = frameTiles
            .map((t) => {
              const quadBytes = t.quad.map((idx) => tilesPool[idx]);
              const base = packer.alloc(
                quadBytes,
                `${sceneName} slot ${k} (metasprite)`
              );
              if (base === null) return null; // over budget - packer already warned once
              return {
                dx: toS8Byte(t.dx - canvasWidth / 2),
                dy: toS8Byte(t.dy - canvasHeight),
                halfTileBase: base >> 1,
                flags: (t.flipX ? 1 : 0) | (t.flipY ? 2 : 0) | (t.priority ? 4 : 0)
              };
            })
            .filter(Boolean);
          maxEntriesPerFrame = Math.max(maxEntriesPerFrame, entries.length);
          return entries;
        });

        types[k] = animationTypeToSpriteType(sheet.animationType);
        frames[k] = Math.min(Math.max(1, frameBlocks.length), 255);
        oamIds[k] = Math.max(1, maxEntriesPerFrame);
        metaspriteSlotBytes[k] = encodeMetaspriteSlot(frameBlocks);
        return;
      }

      let tiles = conv.tiles;
      if (objPalColours[objPal]) {
        const label = sheet.filename || sheet.name || id;
        tiles = mergeSpriteIntoPalette(objPalColours[objPal], conv, label, sceneName);
      } else {
        objPalColours[objPal] = conv.colors.slice(); // scene-local copy - conv
        // is shared/cached across every scene that uses this sprite sheet
      }
      placeTiles(k, tiles.slice(0, 4)); // primary/frame-0 pose: unchanged, fixed slot k
      const nFrames = Math.min(tiles.length >> 2, 6);
      if (conv.spriteType === 1) {
        // 3-frame SPRITE_ACTOR: [down, up, side] - frame 1 = up, frame 2 = side.
        placeExtraPose("upA", k, tiles.slice(4, 8));
        placeExtraPose("sideA", k, tiles.slice(8, 12));
      } else {
        // everything else (2-6 frames): frame f into the f-th of
        // [down-A(already placed above), down-B, up-A, up-B, side-A, side-B] -
        // the exact poses the engine's SPRITE_ACTOR_ANIMATED walk cycle and
        // its SPRITE_STATIC auto-cycle both read by frame number.
        for (let f = 1; f < nFrames; f++) {
          placeExtraPose(EXTRA_POSE_KEYS[f - 1], k, tiles.slice(f * 4, f * 4 + 4));
        }
      }
      types[k] = conv.spriteType;
      frames[k] = conv.frameCount;
      writePal(objPal, palBytesFor(objPalColours[objPal]));
    });
    sceneAvatarIds[sceneIndex].forEach((id, k) => {
      const conv = spriteConv[id];
      placeTiles(fixed.AVATAR_SLOT0 + k, conv.tiles.slice(0, 4));
      if (k === 0) writePal(2, conv.paletteBytes);
    });

    packer.warnings.forEach((w) => warnings(`Scene '${sceneName}': ${w}`));

    // M9.4 step 7 (SPRITE_EDITOR_PROGRESS.md): a real OAM hardware-budget
    // warning - the SNES has exactly 128 real sprite slots total, and
    // until now every actor/emote/projectile/avatar cost exactly 1, so
    // this ceiling was never reachable by anything this compiler could
    // control. A metaspriteMode actor can now cost more than 1 (oamIds[k]
    // above), so a scene leaning hard on big composed sprites really can
    // exceed it. Warn, don't hard-cap - matches this codebase's universal
    // convention for every other hardware budget (VRAM tiles just above,
    // 16-colour palettes, OBJ palette sharing, >8 sprite sheets/scene).
    // Summed per actor INSTANCE (scene.actors), not per distinct sheet -
    // two actors sharing one metasprite sheet each cost that sheet's own
    // oamIds[k] separately, matching actor_oam_base[]'s own real prefix
    // sum in scene.c. A sheet that doesn't fit in this scene's 8 slots (the
    // warning above) falls back to slot 0, same as the engine's own
    // fallback - costed as oamIds[0] here too, for consistency.
    const sceneForWarning = scenes[sceneIndex];
    const slotForSpriteId = (id) => sceneSpriteIds[sceneIndex].indexOf(id);
    const oamCostForId = (id) => {
      const slot = slotForSpriteId(id);
      return oamIds[slot >= 0 ? slot : 0];
    };
    let totalOamIds = oamCostForId(playerSpriteIdForScene(sceneForWarning));
    (sceneForWarning.actors || []).forEach((a) => {
      totalOamIds += oamCostForId(a.spriteSheetId);
    });
    totalOamIds += 1; // emote bubble
    totalOamIds += MAX_PROJECTILES; // the whole projectile pool
    totalOamIds += 1; // dialogue avatar
    if (totalOamIds > 128) {
      warnings(
        `Scene '${sceneName}' needs ${totalOamIds} hardware sprite slots worst-case ` +
          `(actors + emote + projectiles + avatar), over the real 128 the SNES has - ` +
          `some sprites will fail to render. Use fewer simultaneous actors, or fewer ` +
          `tiles per metasprite frame.`
      );
    }

    const extraPoseBytes = [].concat(...EXTRA_POSE_KEYS.map((key) => extraPose[key]));
    // M9.4 (SPRITE_EDITOR_PROGRESS.md): per-slot free-form metasprite frame
    // data - [slotByteLen(u16 LE), ...payload] per slot, slotByteLen=0 (no
    // payload bytes) for a slot that isn't metasprite-mode or has no tiles
    // placed yet. See scene.h's metasprite_frame_base comment and
    // encodeMetaspriteSlot above for the exact format; scene.c's SceneInit
    // parses this section right after extraPoseBytes.
    const metaspriteBytes = [].concat(
      ...metaspriteSlotBytes.map((payload) =>
        payload ? [].concat(u16b(payload.length), payload) : [0, 0]
      )
    );
    return { sheet, palBytes, types, frames, pals, oamIds, extraPoseBytes, metaspriteBytes };
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
  //
  // M9.4 bug found via Mesen verification: this is a SEPARATE place from
  // buildSceneSprites' own `types[k]` (sprite_type_for_slot) that computes
  // essentially the same thing - the compiled ACTOR ENTRY's own byte 7
  // (actors[i].sprite_type at runtime), which SceneRenderActors/
  // actor_metasprite_pose/frames_len_for all dispatch on directly, not the
  // slot table (the slot table only backs the PLAYER's sprite_type, which
  // has no actor-entry byte of its own). A metaspriteMode sheet's conv
  // object (imageToFreeformMetaspriteData) has no `frameCount` field at
  // all, so spriteTypeDec(_, undefined) silently fell through to 0
  // (SPRITE_STATIC) regardless of the sheet's real animationType - stayed
  // hidden for a "fixed" sheet (0 is also the right answer there) and only
  // surfaced once a "multi" sheet's actor read pose index 0 (down) no
  // matter which way it was actually facing. Must agree with `types[k]`
  // exactly - both ultimately come from the same sheet.animationType. */
  const spriteTypeForActor = (id, actorSpriteType) => {
    const sheet = spriteById(id);
    if (sheet && sheet.metaspriteMode) {
      return animationTypeToSpriteType(sheet.animationType);
    }
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
  const compile = (script, entity, entityType, entityIndex, sceneIndex, scene, out = [], loop = false) => {
    compileEntityEvents((script || []).filter((e) => e.command !== EVENT_END), {
      scene,
      sceneIndex,
      scenes,
      loop,
      sprites: projectData.spriteSheets || [],
      avatars: sceneAvatars[sceneIndex] || [],
      // Projectiles (v4): launchProjectile()/weaponAttack() (scriptBuilder.js)
      // resolve a sprite to this scene's own OBJ slot (0-7) with this, same
      // per-scene pool sceneSpriteIds[i] already seeds actors/the player from
      // (above) - not the project-wide sprite index PLAYER_SET_SPRITE uses.
      spriteSlots: sceneSpriteIds[sceneIndex] || [],
      backgrounds,
      music: projectData.music || [],
      soundEffects: projectData.soundEffects || [],
      emotes,
      strings,
      variables,
      // Engine Field runtime writes (ENGINE_FIELD_UPDATE/STORE, scriptBuilder.js
      // engineFieldSetToValue/engineFieldSetToVariable/engineFieldStoreInVariable):
      // the same offset precompileEngineFields() computes here is baked into
      // engine_fields.h's macro accessors by hand - see that header's own comment.
      engineFields: precompileEngineFields(getEngineFieldsSchema()),
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

  // MUSIC_PLAY preload (v4, "Space Battle" fix): PVSnesLib's spcLoad/spcPlay
  // (inside MusicPlay(), prebuilt binary, no source to read or fix directly)
  // takes dramatically longer to complete the more CPU load is running
  // concurrently - confirmed by measuring a real Shoot Em Up scene's
  // foreground script_ptr: 59 frames to resolve MUSIC_PLAY alone, 900+ and
  // still unresolved with the scene's real 15 On-Update enemy contexts and
  // input-script registration also active. Fix: if a scene's own top-level
  // script unconditionally reaches a MUSIC_PLAY as (one of) its first
  // action(s), hoist it out entirely and let SceneInit call MusicPlay()
  // directly, synchronously, before the screen unblanks and before any
  // On-Update context is ever stepped - nothing competing for CPU yet. Only
  // ever hoists from the SCENE's own script (never an actor's), and only
  // when every event skipped over on the way to it is provably safe to pass
  // over - default-deny for anything not explicitly recognized, never guess.
  //
  // This is a true ALLOWLIST, not inferred from the C-side opcode table (an
  // earlier pass tried that and found it unreliable - the compiled SNES
  // opcode names don't line up 1:1 with authored event ids, e.g. the C
  // opcode literally named ACTOR_PUSH is "Actor: Push" (a physics shove),
  // nothing to do with the sub-script call stack the name suggested).
  // Instead every src/lib/events/event*.js file was read directly: this is
  // every event confirmed to have no nested/conditional body AND a plain,
  // unconditionally-linear compile() - excluding (checked individually,
  // real risk found): EVENT_ACTOR_INVOKE (sub-script call), EVENT_STOP
  // (calls scriptEnd() - nothing after it in this path ever runs),
  // EVENT_GOTO_LABEL (unconditional jump), EVENT_SWITCH_SCENE (scene
  // changes), EVENT_SCENE_POP_STATE (also calls scriptEnd()),
  // EVENT_SCENE_PUSH_STATE/EVENT_SCENE_RESET_STATE/EVENT_SCENE_POP_ALL_STATE
  // (state-stack semantics, conservatively excluded alongside their own
  // push/pop pairing). Every branching/looping/choice event (IF_*, CHOICE,
  // MENU, LOOP*, SWITCH, GROUP) is excluded too - not because each was
  // individually risky, but because compileEntityEvents.js (confirmed by
  // reading it directly) generically merges every event's own `.children`
  // into its args before compiling (`{...args, ...children}`), so ANY event
  // with nested content shows up as a real `.children` property on the raw
  // stored object regardless of whether its own compile() mentions
  // "children" by name - these are caught by the generic `.children` check
  // below instead of needing to be named here one by one.
  const MUSIC_PLAY_HOIST_SAFE_LEAF_COMMANDS = new Set([
    "EVENT_ACTOR_ACTIVATE",
    "EVENT_ACTOR_COLLISIONS_DISABLE",
    "EVENT_ACTOR_COLLISIONS_ENABLE",
    "EVENT_ACTOR_DEACTIVATE",
    "EVENT_ACTOR_EMOTE",
    "EVENT_ACTOR_GET_DIRECTION",
    "EVENT_ACTOR_GET_POSITION",
    "EVENT_ACTOR_HIDE",
    "EVENT_ACTOR_MOVE_RELATIVE",
    "EVENT_ACTOR_MOVE_TO",
    "EVENT_ACTOR_MOVE_TO_VALUE",
    "EVENT_ACTOR_PUSH",
    "EVENT_ACTOR_SET_ANIMATE",
    "EVENT_ACTOR_SET_ANIMATION_SPEED",
    "EVENT_ACTOR_SET_DIRECTION",
    "EVENT_ACTOR_SET_DIRECTION_TO_VALUE",
    "EVENT_ACTOR_SET_FRAME",
    "EVENT_ACTOR_SET_FRAME_TO_VALUE",
    "EVENT_ACTOR_SET_MOVEMENT_SPEED",
    "EVENT_ACTOR_SET_POSITION",
    "EVENT_ACTOR_SET_POSITION_RELATIVE",
    "EVENT_ACTOR_SET_POSITION_TO_VALUE",
    "EVENT_ACTOR_SET_SPRITE",
    "EVENT_ACTOR_SET_STATE",
    "EVENT_ACTOR_SHOW",
    "EVENT_ACTOR_START_UPDATE",
    "EVENT_ACTOR_STOP_UPDATE",
    "EVENT_ADD_FLAGS",
    "EVENT_AWAIT_INPUT",
    "EVENT_CAMERA_LOCK",
    "EVENT_CAMERA_MOVE_TO",
    "EVENT_CAMERA_SHAKE",
    "EVENT_CLEAR_DATA",
    "EVENT_CLEAR_FLAGS",
    "EVENT_COMMENT",
    "EVENT_DEC_VALUE",
    "EVENT_DEFINE_LABEL",
    // A real no-op here, not an oversight: compile() itself strips every
    // literal EVENT_END out of the input array before compiling anything
    // (`(script || []).filter((e) => e.command !== EVENT_END)`, above) -
    // so one appearing inside a scene's top-level script or a nested
    // custom-event body (both real, confirmed against the actual "Space
    // Battle" project JSON) carries no compiled effect to reason about.
    "EVENT_END",
    "EVENT_ENGINE_FIELD_SET",
    "EVENT_ENGINE_FIELD_STORE",
    "EVENT_FADE_IN",
    "EVENT_FADE_OUT",
    "EVENT_HIDE_SPRITES",
    "EVENT_INC_VALUE",
    "EVENT_LAUNCH_PROJECTILE",
    "EVENT_LOAD_DATA",
    "EVENT_MOSAIC",
    "EVENT_MUSIC_STOP",
    "EVENT_OVERLAY_HIDE",
    "EVENT_OVERLAY_MOVE_TO",
    "EVENT_OVERLAY_SHOW",
    "EVENT_PLAYER_BOUNCE",
    "EVENT_PLAYER_SET_SPRITE",
    "EVENT_PLAYER_SET_STATE",
    "EVENT_REMOVE_INPUT_SCRIPT",
    "EVENT_RESET_VARIABLES",
    "EVENT_SAVE_DATA",
    "EVENT_SET_FALSE",
    "EVENT_SET_FLAGS",
    "EVENT_SET_TIMER_SCRIPT",
    "EVENT_SET_TRUE",
    "EVENT_SET_VALUE",
    "EVENT_SHOW_SPRITES",
    "EVENT_SOUND_PLAY_EFFECT",
    "EVENT_TEXT",
    "EVENT_TEXT_SET_ANIMATION_SPEED",
    "EVENT_TIMER_DISABLE",
    "EVENT_TIMER_RESTART",
    "EVENT_VARIABLE_MATH",
    "EVENT_VARIABLE_MATH_EVALUATE",
    "EVENT_WAIT",
    "EVENT_WEAPON_ATTACK",
  ]);

  const musicPlayHoistSafeToPassOver = (event) => {
    if (event.command === "EVENT_CALL_CUSTOM_EVENT") {
      // Inlined at compile time (compileEntityEvents.js) - safe to pass
      // over exactly when its own resolved body is (this is the real shape
      // Space Battle's own scene uses: a custom event wrapping SET_INPUT_
      // SCRIPT as the scene's first action, MUSIC_PLAY as a later sibling).
      const body = (event.children && event.children.script) || [];
      return body.every(musicPlayHoistSafeToPassOver);
    }
    if (event.command === "EVENT_SET_INPUT_SCRIPT") {
      // Its true/false children compile to a SEPARATE script
      // (input_script_ptrs[]), never inlined here - they don't affect
      // whether the next event in THIS stream is reached.
      return true;
    }
    return MUSIC_PLAY_HOIST_SAFE_LEAF_COMMANDS.has(event.command);
  };

  // Returns { musicIndex, scriptWithoutHoisted } - musicIndex is -1 if
  // nothing was hoisted (scriptWithoutHoisted is then the original array,
  // untouched - compileSnesData never mutates the input project object).
  const hoistSceneMusicPreload = (sceneScript, music) => {
    const events = sceneScript || [];
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.command === "EVENT_MUSIC_PLAY") {
        const musicIndex = getMusicIndex(event.args && event.args.musicId, music);
        if (musicIndex >= 0) {
          return {
            musicIndex,
            scriptWithoutHoisted: events.slice(0, i).concat(events.slice(i + 1)),
          };
        }
        return { musicIndex: -1, scriptWithoutHoisted: events };
      }
      if (!musicPlayHoistSafeToPassOver(event)) {
        return { musicIndex: -1, scriptWithoutHoisted: events };
      }
    }
    return { musicIndex: -1, scriptWithoutHoisted: events };
  };

  const sceneBlobs = scenes.map((scene, sceneIndex) => {
    // v4 fix (user-found, code review: "can scene_num_actors be >=
    // MAX_ACTORS?"): this byte is otherwise written unclamped below
    // (scene.actors.length, straight into the blob) - nothing here ever
    // stopped a scene from compiling with more actors than the engine can
    // load. SceneInit's own i < MAX_ACTORS guard (scene.c) silently drops
    // any actor past the limit rather than corrupting memory, but that's a
    // silent, easy-to-miss failure mode - warn here so it surfaces in the
    // actual build log, not only in the World editor's per-scene hover
    // tooltip (SceneInfo.js, editor-time only - never seen at all if this
    // scene isn't the one currently open when a build happens).
    // snesTarget.maxActors is already -1'd for the player's reserved slot.
    if ((scene.actors || []).length > snesTarget.maxActors) {
      warnings(
        `Scene "${scene.name || sceneIndex}" has ${scene.actors.length} actors, but only the first ${snesTarget.maxActors} will be included - the rest are silently dropped.`
      );
    }
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
    // MUSIC_PLAY preload - see hoistSceneMusicPreload's own comment above.
    // Never mutates scene.script (or the input project object) - passes a
    // copy with the hoisted event spliced out, if one was found.
    const { musicIndex: sceneMusicPreload, scriptWithoutHoisted } = hoistSceneMusicPreload(
      scene.script,
      projectData.music || []
    );
    compile(scriptWithoutHoisted, scene, "scene", sceneIndex, sceneIndex, scene, sceneOut);
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
    //
    // v4 fix (user-found: enemies in a real Shoot Em Up scene stopped
    // moving/shooting after one pass): loop=true makes compileEntityEvents
    // (already ported from GB Studio 3.x with this exact mechanism, just
    // never wired up here) emit a label at the script's own start and, once
    // it reaches the end, a one-frame yield (nextFrameAwait, so an update
    // script with no blocking op of its own can't spin forever within a
    // single frame) followed by a jump back to that label - instead of
    // just terminating. Matches B's real semantics exactly: an On Update
    // script that reaches its natural end does NOT auto-relaunch at the
    // *runtime* VM/context-pool level (update_script.c's own comment is
    // correct about that), it loops because the *compiler* always wraps it
    // this way, which this fork's compiler simply never did until now.
    const updateScriptIdx = (scene.actors || []).map((actor, i) =>
      pushScript(compile(actor.updateScript, actor, "actor", i, sceneIndex, scene, [], true))
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
    // M13's investigation). col_solid()/this bitmap are a single solid/
    // clear bit, so any nonzero flag byte - a wall on any side - counts as
    // a fully solid tile here; every genre except Platform reads only this.
    // Update_Platform now gets real directional/ladder data of its own,
    // see colDirBytes below.
    const colLen = Math.ceil((w * h) / 8);
    const collisions = new Array(colLen).fill(0);
    const rawCollisions = scene.collisions || [];
    for (let i = 0; i < w * h; i++) {
      if (rawCollisions[i]) {
        collisions[i >> 3] |= 1 << (i & 7);
      }
    }

    // Ladders / one-way platforms (v4, Update_Platform only): a second,
    // optional per-tile BYTE table carrying the real authored
    // COLLISION_TOP/BOTTOM/LEFT/RIGHT/TILE_PROP_LADDER bits - see scene.c's
    // own platform_col_byte()/platform_has_col_dir comment. Most scenes
    // paint only plain solid/empty tiles (every painted byte already
    // reduces to "solid from every side" once masked, i.e. COLLISION_ALL)
    // and skip this table entirely - col_solid()'s own flat bit above
    // already covers them with zero extra ROM/WRAM cost, matching
    // scenePriorityMaps' own "most scenes need none" precedent below.
    //
    // colDirByteFor() has one deliberate asymmetry with a plain mask: a
    // tile painted with *something* but none of COLLISION_ALL/LADDER's own
    // bits (e.g. a tile painted only for TILE_PROP_PRIORITY, 0x20 - the
    // "Colors" tool shares the same collision byte, see consts.js's own
    // comment) still has to read as fully solid here, matching col_solid()'s
    // existing "any nonzero raw byte counts as solid" rule every other
    // genre already relies on - a plain `raw & mask` would silently turn
    // such a tile *non*-solid for Platform alone the moment this scene
    // needs the table for some *other* tile's real directional/ladder bit.
    const PLAT_COL_DIR_MASK = COLLISION_ALL | TILE_PROP_LADDER;
    const SCENE_COL_DIR_BYTES = 2040; // must match scene.c's own SCENE_COL_DIR_BYTES
    const colDirByteFor = (raw) => {
      const dirBits = raw & PLAT_COL_DIR_MASK;
      if (raw !== 0 && dirBits === 0) {
        return COLLISION_ALL;
      }
      return dirBits;
    };
    let hasColDir = false;
    for (let i = 0; i < w * h; i++) {
      const b = colDirByteFor(rawCollisions[i] || 0);
      if (b !== 0 && b !== COLLISION_ALL) {
        hasColDir = true;
        break;
      }
    }
    let colDirBytes = [0]; // [has_col_dir] flag only, when false
    if (hasColDir) {
      if (w * h > SCENE_COL_DIR_BYTES) {
        warnings(
          `Scene '${scene.name || `#${sceneIndex}`}' paints one-way platform/ladder tiles across ${w * h} tiles, more than the ${SCENE_COL_DIR_BYTES} this engine can track for them - the rest fall back to plain solid/empty.`
        );
      }
      const dirBytes = [];
      for (let i = 0; i < w * h; i++) {
        dirBytes.push(colDirByteFor(rawCollisions[i] || 0));
      }
      colDirBytes = [1].concat(dirBytes);
    }

    const actorEntries = [];
    (scene.actors || []).forEach((actor, i) => {
      actorEntries.push(
        clampByte(actor.x),
        clampByte(actor.y),
        dirDec(actor.direction),
        moveDec(actor.movementType),
        slotForActor(sceneIndex, actor.spriteSheetId),
        ...u16b(actorScriptIdx[i]),
        spriteTypeForActor(actor.spriteSheetId, actor.spriteType),
        animSpeedDec(actor.animSpeed),
        actor.animate ? 1 : 0,
        // Projectiles (v4): [collision_group, hit1Idx, hit2Idx, hit3Idx] - see
        // hit1ScriptIdx/2/3 above. collisionGroupDec("") === 0 (COLLISION_GROUP_NONE)
        // for an actor that never opted in, matching B's own default.
        collisionGroupDec(actor.collisionGroup),
        ...u16b(hit1ScriptIdx[i]),
        ...u16b(hit2ScriptIdx[i]),
        ...u16b(hit3ScriptIdx[i]),
        // On Update subsystem (v4): see updateScriptIdx above.
        ...u16b(updateScriptIdx[i])
      );
    });

    // per-scene OBJ-slot tables, read by SceneInit straight after w/h.
    // [32] now, not [24] - M7 (SPRITE_EDITOR_PROGRESS.md) added oamIds[8].
    const spr = sceneSprites[sceneIndex];
    const sprSlotBytes = [].concat(spr.types, spr.frames, spr.pals, spr.oamIds);

    // M6 (v4): banded X-axis parallax scrolling, driven by the SNES's own
    // HDMA (setParallaxScrolling/HDMATable16, appData/src/snes/src/parallax.c)
    // instead of a second BG layer - matches GB Studio 3.x's real model (N
    // stacked bands on the SAME background, not two independent layers).
    // Fixed-size table (MAX_PARALLAX_LAYERS * 2 bytes), matching the [32]
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
        ...u16b(triggerScriptIdx[i])
      );
    });

    // Adventure genre, Option 1 (box-sweep collision): the player's real
    // collision bounding box, authored on the SpriteSheet itself
    // (boundsX/Y/Width/Height - SpriteInspector.tsx, already fully
    // authorable/visualized, but never compiled anywhere before now - see
    // entitiesTypes.ts's own "kept for schema parity... not compiled into
    // assets.c" comment). Resolved per-scene the same way the player's own
    // OBJ sheet already is (playerSpriteIdForScene/spriteById, both already
    // used elsewhere in this function, e.g. the OAM-budget warning below).
    // Converted from SpriteInspector's canvas-pixel authoring space into
    // actor-relative offsets with the *same* anchor formula already
    // Mesen-verified for M9.4 metasprite tiles (canvasWidth/2 horizontally
    // centered, canvasHeight bottom-anchored) - not GB's own 7/8-based
    // formula, which assumes GB's different actor-position anchor and
    // would be wrong here. No sheet resolved -> the documented defaults
    // (0,0,16,16) reproduce the legacy centered-16x16 box instead of zeros.
    const playerSheetForBounds = spriteById(playerSpriteIdForScene(scene));
    const boundsCanvasW = (playerSheetForBounds && playerSheetForBounds.canvasWidth) || 16;
    const boundsCanvasH = (playerSheetForBounds && playerSheetForBounds.canvasHeight) || 16;
    const boundsX = (playerSheetForBounds && playerSheetForBounds.boundsX) || 0;
    const boundsY = (playerSheetForBounds && playerSheetForBounds.boundsY) || 0;
    const boundsW = (playerSheetForBounds && playerSheetForBounds.boundsWidth) || 16;
    const boundsH = (playerSheetForBounds && playerSheetForBounds.boundsHeight) || 16;
    const playerBoundsLeft = boundsX - boundsCanvasW / 2;
    const playerBoundsTop = boundsY - boundsCanvasH;
    const playerBoundsBytes = [
      toS8Byte(playerBoundsLeft),
      toS8Byte(playerBoundsLeft + boundsW - 1),
      toS8Byte(playerBoundsTop),
      toS8Byte(playerBoundsTop + boundsH - 1)
    ];

    return [].concat(
      bgIndex,
      (scene.actors || []).length,
      (scene.triggers || []).length,
      u16b(sceneScriptIdx),
      w,
      h,
      sceneTypeDec(scene.type), // v2 M5a: genre dispatch byte
      sprSlotBytes, // [32] sprite_type[8], sprite_frames[8], sprite_pal[8], sprite_oam_ids[8]
      parallaxBytes, // [6] M6 (v4): up to 3 {lines, shift} parallax bands
      // [6] Projectiles (v4, follow-up): On Player Hit script indices,
      // collision group 1/2/3 - see playerHit1/2/3ScriptIdx above.
      u16b(playerHit1ScriptIdx),
      u16b(playerHit2ScriptIdx),
      u16b(playerHit3ScriptIdx),
      actorEntries,
      triggerEntries,
      collisions,
      // [40] M8.3 (SPRITE_EDITOR_PROGRESS.md): extra-pose half-tile-base
      // table - 5 arrays of SPRITE_SLOTS bytes (down-B, up-A, up-B, side-A,
      // side-B), read by SceneInit right after the collision bitmap (whose
      // length is itself variable, so this has to come last rather than
      // sit at a fixed offset the way the [32] sprite-slot table does).
      // Appended at the very end specifically so it doesn't shift any
      // existing byte-offset test (header/sprite-table/parallax/playerHit/
      // actor/trigger entries are all unaffected by this table's own size).
      spr.extraPoseBytes,
      // [2*SPRITE_SLOTS] M9.4: per-slot free-form metasprite frame data -
      // see buildSceneSprites' own comment above. Appended after
      // extraPoseBytes for the same "never shifts an earlier offset" reason.
      spr.metaspriteBytes,
      // [4] Adventure genre, Option 1: the player's collision bounding box
      // (left, right, top, bottom - signed byte offsets from actors[0].x/y),
      // computed above. Appended last, after metaspriteBytes, for the same
      // "never shifts an earlier offset" reason every prior scene-blob
      // growth in this file has followed.
      playerBoundsBytes,
      // [1] MUSIC_PLAY preload index (0xff = none) - see
      // hoistSceneMusicPreload's own comment above. Appended after
      // playerBoundsBytes, same reason.
      sceneMusicPreload >= 0 ? sceneMusicPreload : 0xff,
      // [1 or 1+w*h] Ladders / one-way platforms: has_col_dir flag,
      // optionally followed by the real per-tile directional-collision
      // table - see colDirBytes' own comment above. The real last thing in
      // the scene blob now, appended last for the same reason.
      colDirBytes
    );
  });

  // ---- resolve dialogue-string placeholders across every script ------
  const scriptBytes = rawScripts.map((b, i) =>
    resolvePlaceholders(b, `event_ptrs[${i}]`, warnings)
  );

  // ---- backgrounds -> tables ------------------------------------------
  // v4 fix (user-found, via the "SNES scenes wider/taller than 64x64" warning):
  // this used to hard-code a 32x32 loop regardless of the background's real
  // size (conv.tileW/tileH), so ANY background over 32 tiles in either
  // dimension silently lost everything past that corner at compile time -
  // with no warning below the unrelated 64-tile warning threshold
  // (maxBackgroundWidth/Height in targets/snes.js).
  //
  // A first pass just emitted conv.tilemap as one flat, row-major w*h array
  // - wrong for anything over 32 tiles in either dimension, caught by a
  // real Mesen spike (a background half blue/half red, the seam placed
  // exactly on tile column 32): real SNES hardware has no such thing as a
  // "56-wide tilemap row" - a BG tilemap is always built from 32x32-tile
  // "screens", and scene.c already selects SC_64x64 (four screens: TL/TR/
  // BL/BR, at VRAM word offsets 0x000/0x400/0x800/0xC00, each internally
  // row-major with a 32-word stride) whenever either dimension exceeds 32.
  // A flat w-wide buffer DMA'd straight into that region does not line up
  // with those four 1024-word blocks at all once w or h isn't a clean
  // multiple of 32 - exactly the corruption the spike showed (row 0's
  // right half landed inside what hardware reads as row 1 of the top-left
  // screen). Below 32x32 the flat layout IS the correct (single-screen,
  // SC_32x32) hardware layout - unchanged.
  //
  // No size cap on the *source* data read here: background tile/map data
  // is emitted as its own `.as` superfree section (see below), not packed
  // into assets.c's atomic 32 KB .rodata section, so there's no ROM
  // constraint forcing one. The four-screen buffer itself is naturally
  // capped at 64x64 tiles (SC_64x64's real VRAM budget) - real horizontal
  // streaming for backgrounds wider than that (up to 255 tiles) is done,
  // not still-to-do (this comment used to say otherwise - see
  // scene.c's SceneStreamBackground and PERF.md); it reads the background's
  // complete, unclamped tilemap (bg_fullmap_ptrs[], emitted below) as a
  // second ROM array and streams new columns in as the camera scrolls past
  // the initial 64-tile window loaded here. Vertical streaming genuinely
  // doesn't exist - a background over 64 tiles tall is still unsupported.
  const QUADRANT_TILES = 32;
  // usesQuadrants(w,h): does this background's VRAM tilemap need the real
  // SC_64x64 four-screen layout, or does it fit the single SC_32x32 screen
  // (plain row-major, w-wide stride) that's always been correct?
  const usesQuadrants = (w, h) => w > QUADRANT_TILES || h > QUADRANT_TILES;
  // mapByteIndex(tx,ty,w,h): the byte offset (word index * 2) a given tile
  // position lands at in bgTables[i].map / the DMA'd VRAM buffer - shared
  // by the map builder below and the priority-tile override further down
  // so the two can't drift out of sync the way the old hardcoded-32 stride
  // did. -1 means "outside the four-screen 64x64 budget", not stored.
  // Below 32x32, a real SC_32x32 hardware screen is ALWAYS a fixed 32-wide,
  // 1024-word block regardless of how much of it the background actually
  // uses - stride is QUADRANT_TILES (32), never the background's own w, so
  // the untouched remainder is left zero-padded rather than reusing
  // whatever was already in that VRAM region from a previous scene.
  const mapByteIndex = (tx, ty, w, h) => {
    if (!usesQuadrants(w, h)) return (ty * QUADRANT_TILES + tx) * 2;
    if (tx >= 64 || ty >= 64) return -1;
    const qx = tx >= QUADRANT_TILES ? 1 : 0;
    const qy = ty >= QUADRANT_TILES ? 1 : 0;
    const lx = tx - qx * QUADRANT_TILES;
    const ly = ty - qy * QUADRANT_TILES;
    const quadrantWords = QUADRANT_TILES * QUADRANT_TILES;
    return ((qy * 2 + qx) * quadrantWords + ly * QUADRANT_TILES + lx) * 2;
  };
  // A background wider than 64 tiles (the SC_64x64 VRAM budget - see
  // above) can't fit its whole tilemap in VRAM at once; scene.c streams in
  // new columns as the camera scrolls (horizontal only - no current scene
  // exceeds 64 tiles tall). Streaming needs the *complete* source tilemap
  // in ROM to stream from, not just the initial 64-wide VRAM window - a
  // second, flat row-major w*h array (conv.tilemap as-is, not
  // quadrant-shaped: it's a plain lookup table the engine indexes by
  // row*w+col, never DMA'd wholesale to VRAM the way bg<i>_map is).
  const NEEDS_STREAMING_TILES = 64;
  const bgTables = bgConverted.map((conv, i) => {
    const w = conv.tileW;
    const h = conv.tileH;
    const mapLenBytes = usesQuadrants(w, h)
      ? 64 * 64 * 2
      : QUADRANT_TILES * QUADRANT_TILES * 2;
    const map = new Array(mapLenBytes).fill(0);
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const idx = mapByteIndex(tx, ty, w, h);
        // idx === -1 -> beyond the 64x64 VRAM budget - streaming territory
        if (idx !== -1) {
          const e = conv.tilemap[ty * w + tx];
          map[idx] = e & 0xff;
          map[idx + 1] = (e >> 8) & 0xff;
        }
      }
    }
    const needsStreaming = w > NEEDS_STREAMING_TILES;
    const fullMap = needsStreaming
      ? [].concat(...conv.tilemap.map((e) => [e & 0xff, (e >> 8) & 0xff]))
      : null;
    // v4 (Map Engine streaming): a background needing streaming also gets
    // PVSnesLib's own Map Engine data (mapdata/metatiles), reusing the
    // already-written, previously-unwired snesMapEngine.js reshape pass -
    // see SceneInit (scene.c) for which scenes actually use this at runtime
    // (any wide background qualifies here; the parallax exclusion is a
    // per-scene runtime decision, not a per-background compile-time one,
    // since two scenes can share one background with different parallax
    // settings).
    const mapEngine = needsStreaming ? buildMapEngineBackground(conv) : null;
    return {
      name: `bg${i}`,
      tiles: conv.tileBytes,
      map,
      fullMap,
      pal: conv.paletteBytes,
      w,
      h,
      mapdata: mapEngine ? mapEngine.layer1map : null,
      metatiles: mapEngine ? mapEngine.metatiles : null,
    };
  });

  // ---- per-scene priority-tile tilemap overrides (M7, v4) -------------
  // Most scenes need none - the shared bgTables[i].map above is used
  // unmodified, matching every scene that references the same background
  // today. A scene that paints any TILE_PROP_PRIORITY collision-grid tiles
  // (BrushToolbar.js) gets its own copy of that background's tilemap with
  // BG_TIL_PRIO (snesgfx.js's tile<<13 priority bit) OR'd in at the painted
  // positions. This can't be a shared per-background flag: two scenes can
  // share one background and paint different priority patterns, so priority
  // has to live at the same per-scene granularity collision itself already
  // does.
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
          // v4 fix (same bug class as bgTables above, twice now: first a
          // hardcoded 32-wide stride, then a flat w-wide stride that didn't
          // account for the real SC_64x64 four-screen VRAM layout - now
          // shares mapByteIndex with the map builder so the two can't
          // drift apart again).
          const idx = mapByteIndex(tx, ty, bg.w, bg.h);
          // idx === -1 -> beyond the 64x64 VRAM budget
          if (idx !== -1) map[idx + 1] |= BG_TIL_PRIO_HI;
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
 * sprite_*_for_slot[] from the scene blob's [32] slot table. The tile / palette
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
  .map((b) => {
    const lines = [
      `extern const unsigned char ${b.name}_tiles[${b.tiles.length}];`,
      `extern const unsigned char ${b.name}_pal[${b.pal.length}];`,
      `extern const unsigned char ${b.name}_map[${b.map.length}];`,
    ];
    if (b.fullMap) {
      lines.push(`extern const unsigned char ${b.name}_fullmap[${b.fullMap.length}];`);
    }
    if (b.mapdata) {
      lines.push(`extern const unsigned char ${b.name}_mapdata[${b.mapdata.length}];`);
      lines.push(`extern const unsigned char ${b.name}_metatiles[${b.metatiles.length}];`);
    }
    return lines.join("\n");
  })
  .join("\n")}
extern const unsigned char *const bg_tiles_ptrs[${nBg}];
extern const unsigned char *const bg_maps_ptrs[${nBg}];
extern const unsigned char *const bg_pals_ptrs[${nBg}];
extern const unsigned short bg_tiles_len[${nBg}];
extern const unsigned short bg_maps_len[${nBg}];
extern const unsigned short bg_pals_len[${nBg}];
extern const unsigned char bg_map_w[${nBg}];
extern const unsigned char bg_map_h[${nBg}];
/* Horizontal background streaming (v4): 0 for a background <= 64 tiles
 * wide (the common case - VRAM already holds its whole tilemap, nothing
 * to stream), a real pointer to the *complete* flat w*h tilemap in ROM
 * (not quadrant-shaped - a plain row*w+col lookup table) for a wider one.
 * SceneStreamBackground (scene.c) reads new columns from here as the
 * camera scrolls past the initially-loaded 64-tile VRAM window - the
 * hand-rolled streaming path, still used by any wide scene with parallax
 * active (see bg_mapdata_ptrs below for the alternative). */
extern const unsigned char *const bg_fullmap_ptrs[${nBg}];
/* PVSnesLib Map Engine streaming (v4 follow-up): 0 for a background that
 * doesn't need streaming, a real pointer to mapLoad()'s own layer1map/
 * layertiles input (see snesMapEngine.js) for one that does. A wide
 * scene with no active parallax uses this (faster, hand-asm streaming)
 * instead of bg_fullmap_ptrs/SceneStreamBackground - see SceneInit. Both
 * bg_mapdata_ptrs and bg_fullmap_ptrs are populated together for any wide
 * background; which one a given *scene* actually uses is a runtime
 * decision (its own parallax_active), not a per-background compile-time
 * one, since two scenes can share one wide background. */
extern const unsigned char *const bg_mapdata_ptrs[${nBg}];
extern const unsigned char *const bg_metatiles_ptrs[${nBg}];
extern const unsigned char mapengine_tilesprop[${METATILE_PROP_WORDS * 2}];

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
#define NUM_STRINGS   ${nStr}
#define START_SCENE ${startSceneIndex}
#define START_X ${startX}
#define START_Y ${startY}
#define START_DIR ${startDir}
#define PLAYER_SPRITE_SLOT ${playerSpriteSlot}
#define PLAYER_ANIM_SPEED 3
#define NUM_MUSIC_TRACKS ${(projectData.music || []).length}
#define NUM_SOUND_EFFECTS ${(projectData.soundEffects || []).length}

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
    const parts = [
      { label: `${b.name}_tiles`, bytes: b.tiles },
      { label: `${b.name}_pal`, bytes: b.pal },
      { label: `${b.name}_map`, bytes: b.map },
    ];
    if (b.fullMap) parts.push({ label: `${b.name}_fullmap`, bytes: b.fullMap });
    assetsData[`${b.name}_data.as`] = asmAsset(b.name, parts);
    // Map Engine data (mapdata/metatiles) gets its OWN section, not bundled
    // into the one above - bundled, a wide background's tiles+pal+map+
    // fullmap+mapdata+metatiles routinely exceeds the 32 KB single-bank
    // "superfree" ceiling (confirmed: leaving_earth.png/255 tiles wide
    // failed to link with "No room for section" once mapdata/metatiles
    // were added on top of its already-near-the-cap fullmap). Splitting it
    // out lets wlalink place it in a different bank than the rest of this
    // background's data instead of forcing both to fit as one atomic unit.
    if (b.mapdata) {
      assetsData[`${b.name}_mapengine_data.as`] = asmAsset(`${b.name}_mapengine`, [
        { label: `${b.name}_mapdata`, bytes: b.mapdata },
        { label: `${b.name}_metatiles`, bytes: b.metatiles },
      ]);
    }
  });
  // One shared, all-T_EMPTY tilesprop blob, always emitted (scene.c
  // references mapengine_tilesprop unconditionally, even for a project with
  // no wide background at all - see SceneInit) - this project's own
  // collision bitmap (col_solid/scene_col, untouched) stays the only
  // collision source; mapGetMetaTile(sProp) is never called, so the real
  // content here is irrelevant, only mapLoad's fixed DMA size matters
  // (snesMapEngine.js's METATILE_PROP_WORDS).
  assetsData["mapengine_tilesprop_data.as"] = asmAsset("mapengine_tilesprop", [
    { label: "mapengine_tilesprop", bytes: new Array(METATILE_PROP_WORDS * 2).fill(0) },
  ]);
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
const unsigned char *const bg_fullmap_ptrs[${nBg}] = {
${bgTables.map((b) => (b.fullMap ? `    ${b.name}_fullmap` : "    0")).join(",\n")}
};
const unsigned char *const bg_mapdata_ptrs[${nBg}] = {
${bgTables.map((b) => (b.mapdata ? `    ${b.name}_mapdata` : "    0")).join(",\n")}
};
const unsigned char *const bg_metatiles_ptrs[${nBg}] = {
${bgTables.map((b) => (b.metatiles ? `    ${b.name}_metatiles` : "    0")).join(",\n")}
};
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
      // [sceneIndex][projectSpriteIndex] -> the scene's own OBJ slot for that
      // project sprite, or 0xff if it was never loaded into this scene - the
      // same array Script_ActorSetSprite_b/Script_PlayerSetSprite_b look up
      // at runtime (scene_sprite_slot_ptrs). Exposed for tests to verify a
      // sheet referenced only via a runtime sprite-swap event still gets a
      // real slot (v4 fix).
      sceneSlotForIndex,
    },
  };
};

export default compileSnesData;
export { resolvePlaceholders };
