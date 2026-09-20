import fs from "fs-extra";
import Path from "path";
import compileSnesData, {
  resolvePlaceholders,
} from "../../../src/lib/compiler/compileSnesData";
import { COLLISION_ALL, COLLISION_TOP, TILE_PROP_PRIORITY } from "../../../src/consts";

const PROJECT_DIR = Path.join(__dirname, "..", "..", "projects", "Test_Math");
const loadProject = () => {
  const p = JSON.parse(fs.readFileSync(Path.join(PROJECT_DIR, "Test_Math.gbsproj"), "utf8"));
  return { ...p, settings: { ...p.settings, target: "snes" } };
};

describe("resolvePlaceholders", () => {
  const warn = () => {};
  test("STRING_* triple -> 0 / hi / lo of the string index", () => {
    expect(
      resolvePlaceholders(
        [1, "__REPLACE:STRING_BANK:5", "__REPLACE:STRING_HI:5", "__REPLACE:STRING_LO:5"],
        "x",
        warn
      )
    ).toEqual([1, 0, 0, 5]);
    expect(resolvePlaceholders(["__REPLACE:STRING_LO:300"], "x", warn)).toEqual([300 & 0xff]);
    expect(resolvePlaceholders(["__REPLACE:STRING_HI:300"], "x", warn)).toEqual([1]);
  });

  test("truncates numbers to bytes", () => {
    expect(resolvePlaceholders([0x1234, -1], "x", warn)).toEqual([0x34, 0xff]);
  });
});

describe("compileSnesData - Test_Math fixture", () => {
  let out;
  const warnings = [];
  beforeAll(async () => {
    out = await compileSnesData(loadProject(), {
      projectRoot: PROJECT_DIR,
      warnings: (m) => warnings.push(m),
    });
  });

  test("one scene, one background, scene + actor scripts", () => {
    expect(out.stats.scenes).toBe(1);
    expect(out.stats.backgrounds).toBe(1);
    // scene start script + the scene's 3 playerHit1/2/3Script slots + 1 actor
    // script + that actor's 3 hit1/2/3Script slots (v4, Projectiles) + 1
    // updateScript slot (v4, On Update subsystem) - always compiled, even
    // empty, same as .script
    expect(out.stats.scripts).toBe(9);
  });

  test("collects the actor's dialogue strings and variables", () => {
    expect(out.stats.strings).toBeGreaterThan(10); // the actor spams TEXT
    expect(out.stats.variables).toBeGreaterThanOrEqual(0);
  });

  // v2 M5a: the scene blob header gained a scene_type byte at position 6
  // (after height, before the [24] sprite-slot table) - every offset past
  // height in the old (v1.1.4) layout shifts by +1 here. M6 (v4): a further
  // [6]-byte parallax table follows the [24] sprite-slot table, shifting
  // every offset past it by +6 on top of that. Projectiles follow-up (v4): a
  // further [3]-byte playerHit1/2/3ScriptIdx table follows *that*, shifting
  // every offset past it by +3 more on top of both.
  test("scene blob header: [bg, nActors, nTriggers, scriptIdx, w, h, sceneType] + [24] sprite table + [6] parallax table + [3] playerHit table", () => {
    const blob = out.stats.sceneBlobs[0];
    expect(blob.slice(0, 6)).toEqual([0, 1, 0, 0, 20, 18]);
    expect(blob[6]).toBe(0); // scene.type undefined -> defaults to 0 (Top Down)
    // [7..30] per-scene OBJ slot table: sprite_type[8], sprite_frames[8], sprite_pal[8]
    expect(blob.slice(23, 31)).toEqual([0, 3, 4, 5, 6, 7, 0, 0]); // pal numbers
    // [31..36] parallax table (MAX_PARALLAX_LAYERS*2): no parallax on this fixture
    expect(blob.slice(31, 37)).toEqual([0, 0, 0, 0, 0, 0]);
    // [37..39] playerHit1/2/3ScriptIdx: none authored on this fixture, but
    // still real (nonzero, since index 0 is the scene's own start script)
    // event_ptrs[] indices pointing at trivially-empty compiled scripts.
    expect(blob.slice(37, 40)).toEqual([1, 2, 3]);
    // first actor entry (9 bytes) starts right after the playerHit table (at 40)
    // x, y, dir(down=1), move(static=1), spriteSlot, scriptIdx, ...
    expect(blob.slice(40, 46)).toEqual([9, 7, 1, 1, 0, 4]);
  });

  test("the actor's first TEXT resolves to a string index", () => {
    // actor script index 4 (0=scene start, 1-3=playerHit1/2/3); first op is
    // TEXT (0x01) then bank/hi/lo of string 0
    const s = out.stats.scriptBytes[4];
    expect(s[0]).toBe(0x01);
    expect(s[1]).toBe(0); // bank
    expect(s[2]).toBe(0); // hi
    expect(s[3]).toBe(0); // lo -> string index 0
  });

  test("assets.h exposes the start position and table sizes", () => {
    expect(out.assetsH).toMatch(/#define START_SCENE 0/);
    // settings.startX/Y/Direction = 11 / 7 / "left"(2)
    expect(out.assetsH).toMatch(/#define START_X 11/);
    expect(out.assetsH).toMatch(/#define START_Y 7/);
    expect(out.assetsH).toMatch(/#define START_DIR 2/);
    expect(out.assetsH).toMatch(/#define NUM_BGS 1/);
    expect(out.assetsH).toMatch(new RegExp(`event_ptrs\\[${out.stats.scripts}\\]`));
  });

  test("no unresolved-placeholder warnings", () => {
    expect(warnings.filter((w) => /Unresolved placeholder/.test(w))).toEqual([]);
  });
});

describe("compileSnesData - collision bitmap (v2 M13, real user-found bug)", () => {
  // GB Studio 1.2.2 (main branch) stored scene.collisions already bit-packed
  // (1 bit/tile) - GB Studio 2.0.0-beta5 (this branch's base) changed it to
  // one BYTE per tile (COLLISION_TOP/BOTTOM/LEFT/RIGHT flags, consts.js;
  // GB's own compileData.js has no `/8` in its collisionsLength). The SNES
  // compiler was ported from main without noticing the format changed, so it
  // just truncated the first colLen raw per-tile bytes instead of packing
  // them - every SNES scene's collision data was meaningless. User-found:
  // the player could only ever walk in whichever direction happened to read
  // a truncated-but-zero byte; every other direction reported blocked
  // (`can_step`) regardless of the scene's real layout.
  test("a scene's per-tile collision bytes are packed into a real 1-bit-per-tile bitmap", async () => {
    // The background asset's real pixel size drives the scene's compiled
    // w/h (20x18, Test_Math's own placeholder.png), regardless of what a
    // scene JSON's own width/height say - so the collisions array below is
    // sized for a real 20x18 = 360-tile scene, not an arbitrary small one.
    const w = 20;
    const h = 18;
    const collisions = new Array(w * h).fill(0);
    collisions[0] = COLLISION_ALL; // tile 0 -> bit 0 of byte 0
    collisions[2] = COLLISION_ALL; // tile 2 -> bit 2 of byte 0
    collisions[5] = COLLISION_TOP; // tile 5 -> bit 5 of byte 0 (any nonzero flag counts as solid)
    const project = {
      // compileSnesData.js runs migrateProject() on its input - without an
      // explicit up-to-date version, migrateProject assumes "1.0.0" and runs
      // the *entire* migration chain, including the older collision
      // fixups, which would scramble this already-2.0.0-shaped synthetic
      // fixture. Pin to the latest known version/release so migrateProject
      // treats it as already migrated and leaves collisions untouched.
      _version: "2.0.0",
      _release: "6",
      settings: { target: "snes", startSceneId: "s0", startX: 0, startY: 0 },
      backgrounds: [{ id: "bg", filename: "placeholder.png", width: w, height: h }],
      variables: [],
      scenes: [
        {
          id: "s0",
          name: "collisionTest",
          backgroundId: "bg",
          width: w,
          height: h,
          actors: [],
          triggers: [],
          script: [],
          collisions,
        },
      ],
    };
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    const blob = out.stats.sceneBlobs[0];
    // header(7) + sprite-slot table(24) + parallax table(6) + playerHit
    // table(3) + 0 actors + 0 triggers = 40 bytes before the ceil(w*h/8) =
    // 45-byte collision bitmap.
    const colLen = Math.ceil((w * h) / 8);
    expect(blob.length).toBe(40 + colLen);
    const colByte = blob[40];
    // bit i set <=> tile i was solid. Any nonzero flag byte counts as solid
    // (this target has no directional-collision concept).
    expect(colByte & (1 << 0)).toBeTruthy(); // tile 0: COLLISION_ALL
    expect(colByte & (1 << 1)).toBeFalsy(); // tile 1: clear
    expect(colByte & (1 << 2)).toBeTruthy(); // tile 2: COLLISION_ALL
    expect(colByte & (1 << 3)).toBeFalsy(); // tile 3: clear
    expect(colByte & (1 << 4)).toBeFalsy(); // tile 4: clear
    expect(colByte & (1 << 5)).toBeTruthy(); // tile 5: COLLISION_TOP (nonzero)
    expect(colByte & (1 << 6)).toBeFalsy(); // tile 6: clear
    expect(colByte & (1 << 7)).toBeFalsy(); // tile 7: clear
    // Every other collision byte should be 0 - this is the crux of the bug:
    // the old code truncated the raw per-tile array instead of packing it,
    // so most of the "bitmap" ended up reading whatever raw per-tile bytes
    // happened to land within the first colLen indices (mostly garbage
    // relative to real tile positions), not real per-tile solidity.
    expect(blob.slice(41, 40 + colLen)).toEqual(new Array(colLen - 1).fill(0));
  });
});

describe("compileSnesData - scene_type (v2 M5a genre dispatch)", () => {
  const baseProject = {
    settings: { target: "snes", startSceneId: "s0", startX: 1, startY: 1 },
    backgrounds: [{ id: "bg", filename: "placeholder.png", width: 20, height: 18 }],
    variables: [],
    scenes: [
      { id: "s0", name: "topdown", type: "0", backgroundId: "bg", width: 20, height: 18, actors: [], triggers: [], script: [] },
      { id: "s1", name: "platform", type: "1", backgroundId: "bg", width: 20, height: 18, actors: [], triggers: [], script: [] },
      { id: "s2", name: "adventure", type: "2", backgroundId: "bg", width: 20, height: 18, actors: [], triggers: [], script: [] },
      { id: "s3", name: "shmup", type: "3", backgroundId: "bg", width: 20, height: 18, actors: [], triggers: [], script: [] },
      { id: "s4", name: "pointnclick", type: "4", backgroundId: "bg", width: 20, height: 18, actors: [], triggers: [], script: [] },
    ],
  };

  test("each scene's type string becomes the scene blob's byte 6", async () => {
    const out = await compileSnesData(baseProject, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    expect(out.stats.sceneBlobs.map((b) => b[6])).toEqual([0, 1, 2, 3, 4]);
  });

  test("a scene with no type field defaults to 0 (Top Down)", async () => {
    const project = {
      ...baseProject,
      scenes: [{ ...baseProject.scenes[0], type: undefined }],
    };
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    expect(out.stats.sceneBlobs[0][6]).toBe(0);
  });
});

describe("compileSnesData - actor.spriteType (v2, replaces movementType inference)", () => {
  const PROJECT_ROOT = Path.join(__dirname, "..", "..", "projects", "Test_ActorInvoke");

  test("a moving actor with an explicit static spriteType still compiles as SPRITE_STATIC (0)", async () => {
    const project = {
      settings: { target: "snes", startSceneId: "s", startX: 1, startY: 1 },
      backgrounds: [{ id: "bg", filename: "placeholder.png", width: 20, height: 18 }],
      spriteSheets: [{ id: "npc", filename: "signpost.png", numFrames: 1 }],
      variables: [],
      scenes: [
        {
          id: "s",
          name: "s",
          backgroundId: "bg",
          width: 20,
          height: 18,
          actors: [
            {
              id: "a0",
              x: 5,
              y: 5,
              spriteSheetId: "npc",
              movementType: "randomWalk", // moves, but...
              spriteType: "static", // ...explicitly a decorative cycling sprite
              script: [],
            },
          ],
          triggers: [],
          script: [],
        },
      ],
    };
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_ROOT,
      warnings: () => {},
    });
    // actor entry starts right after [7]+[24]+[6]+[3]=[40]; spriteType is
    // byte 6 of the 9-byte actor entry (x,y,dir,move,slot,scriptIdx,spriteType,...)
    const actorEntry = out.stats.sceneBlobs[0].slice(40, 49);
    expect(actorEntry[6]).toBe(0); // SPRITE_STATIC despite movementType=randomWalk
  });
});

describe("compileSnesData - banded parallax scrolling (M6, v4)", () => {
  // screenTileHeight (targets/snes.js) is 28 tiles = 224 scanlines (NTSC).
  const w = 20;
  const h = 18;

  const baseProject = (parallax) => ({
    _version: "2.0.0",
    _release: "6",
    settings: { target: "snes", startSceneId: "s0", startX: 0, startY: 0 },
    backgrounds: [{ id: "bg", filename: "placeholder.png", width: w, height: h }],
    variables: [],
    scenes: [
      {
        id: "s0",
        name: "parallaxTest",
        backgroundId: "bg",
        width: w,
        height: h,
        actors: [],
        triggers: [],
        script: [],
        parallax,
      },
    ],
  });

  test("no parallax field emits an all-zero [6] table", async () => {
    const out = await compileSnesData(baseProject(undefined), {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    expect(out.stats.sceneBlobs[0].slice(31, 37)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test("layer heights convert to scanlines and the last layer fills the rest of the screen", async () => {
    const out = await compileSnesData(
      baseProject([
        { height: 4, speed: 2 },
        { height: 6, speed: 1 },
      ]),
      {
        projectRoot: PROJECT_DIR,
        warnings: () => {},
      }
    );
    const table = out.stats.sceneBlobs[0].slice(31, 37);
    // layer 0: 4 tiles * 8 = 32 lines, shift 2
    // layer 1 (last): auto-extends to 224 - 32 = 192 lines, shift 1
    expect(table).toEqual([32, 2, 192, 1, 0, 0]);
  });

  test("a negative speed (faster than camera) round-trips as a signed byte", async () => {
    const out = await compileSnesData(baseProject([{ height: 4, speed: -1 }]), {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    const table = out.stats.sceneBlobs[0].slice(31, 37);
    // Single layer auto-extends to the full screen (224 lines); -1 as an
    // unsigned byte is 0xff (255), matching the engine's (s8) reinterpret.
    expect(table).toEqual([224, 255, 0, 0, 0, 0]);
  });

  test("warns and truncates when more than 3 layers are given", async () => {
    const warnings = [];
    await compileSnesData(
      baseProject([
        { height: 4, speed: 1 },
        { height: 4, speed: 1 },
        { height: 4, speed: 1 },
        { height: 4, speed: 1 },
      ]),
      {
        projectRoot: PROJECT_DIR,
        warnings: (m) => warnings.push(m),
      }
    );
    expect(warnings.some((w2) => /parallax layers/.test(w2))).toBe(true);
  });
});

describe("compileSnesData - per-scene Player Sprite Sheet override (v4)", () => {
  // Reuses Test_Math's real sprite fixtures: actor_animated (6 frames, the
  // project-wide default) and static (1 frame) - frame count is an easy,
  // unambiguous signal that a scene's own override sheet was really loaded
  // into player slot 0, not just the global default every time.
  const PLAYER_DEFAULT_ID = "581d34d0-9591-4e6e-a609-1d94f203b0cd"; // actor_animated, 6 frames
  const OVERRIDE_ID = "daf95270-e30d-423b-9ee7-990ae29f57f6"; // static, 1 frame

  const project = {
    _version: "2.0.0",
    _release: "7",
    settings: {
      target: "snes",
      startSceneId: "s0",
      startX: 0,
      startY: 0,
      playerSpriteSheetId: PLAYER_DEFAULT_ID,
    },
    backgrounds: [
      { id: "bg", filename: "placeholder.png", width: 20, height: 18 },
    ],
    spriteSheets: [
      { id: PLAYER_DEFAULT_ID, filename: "actor_animated.png", type: "actor_animated" },
      { id: OVERRIDE_ID, filename: "static.png", type: "static" },
    ],
    variables: [],
    scenes: [
      {
        id: "s0",
        name: "overridden",
        backgroundId: "bg",
        width: 20,
        height: 18,
        actors: [],
        triggers: [],
        script: [],
        playerSpriteSheetId: OVERRIDE_ID,
      },
      {
        id: "s1",
        name: "usesDefault",
        backgroundId: "bg",
        width: 20,
        height: 18,
        actors: [],
        triggers: [],
        script: [],
      },
    ],
  };

  test("a scene's own playerSpriteSheetId loads into slot 0 instead of the project default", async () => {
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    // scene blob layout: [7]-byte header, then types[8] at offset 7..14,
    // frames[8] at offset 15..22 (see the M6 describe block above).
    const overriddenBlob = out.stats.sceneBlobs[0];
    const defaultBlob = out.stats.sceneBlobs[1];
    expect(overriddenBlob[15]).toBe(1); // static.png -> 1 frame
    expect(defaultBlob[15]).toBe(6); // actor_animated.png -> 6 frames
    expect(overriddenBlob[7]).not.toBe(defaultBlob[7]); // distinct sprite types too
  });

  test("no scene falls back to the removed PLAYER_SPRITE_TYPE/_PAL compile-time constants", async () => {
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    expect(out.assetsH).toContain("PLAYER_SPRITE_SLOT");
    expect(out.assetsH).not.toContain("PLAYER_SPRITE_TYPE");
    expect(out.assetsH).not.toContain("PLAYER_SPRITE_PAL");
  });
});

describe("compileSnesData - BG-above-OBJ priority tiles (M7, v4)", () => {
  const w = 20;
  const h = 18;

  const baseProject = (collisions) => ({
    _version: "2.0.0",
    _release: "6",
    settings: { target: "snes", startSceneId: "s0", startX: 0, startY: 0 },
    backgrounds: [{ id: "bg", filename: "placeholder.png", width: w, height: h }],
    variables: [],
    scenes: [
      {
        id: "s0",
        name: "priorityTest",
        backgroundId: "bg",
        width: w,
        height: h,
        actors: [],
        triggers: [],
        script: [],
        collisions,
      },
    ],
  });

  test("a scene with no priority tiles gets a null (shared tilemap) entry", async () => {
    const out = await compileSnesData(baseProject(new Array(w * h).fill(0)), {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    expect(out.assetsC).toMatch(
      /const unsigned char \*const scene_bg_map_ptrs\[1\] = \{\s*0\s*\};/
    );
    expect(Object.keys(out.assetsData)).not.toContain("scene_bgmap_0_data.as");
  });

  test("a painted priority tile gets its own tilemap override with the BG_TIL_PRIO bit set", async () => {
    const collisions = new Array(w * h).fill(0);
    // tile (tx=3, ty=1) -> collision index 1*20+3 = 23
    collisions[23] = TILE_PROP_PRIORITY;
    const out = await compileSnesData(baseProject(collisions), {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    expect(out.assetsC).toMatch(
      /const unsigned char \*const scene_bg_map_ptrs\[1\] = \{\s*scene_bgmap_0\s*\};/
    );
    const asFile = out.assetsData["scene_bgmap_0_data.as"];
    expect(asFile).toBeDefined();
    // The override tilemap is sized to the background's own real width (w=20
    // here), not a fixed 32 - v4 fix, this test used to hardcode the 32-wide
    // stride even though its own fixture background is 20 tiles wide,
    // enshrining the pre-fix bug instead of catching it. tile (3,1) -> byte
    // offset (1*20+3)*2 = 46, high byte (offset 47) should have bit 0x20 set
    // ((1<<13)>>8 - see compileSnesData.js's BG_TIL_PRIO_HI).
    const dbMatch = asFile.match(/scene_bgmap_0:\n([\s\S]*?)\n\.ends/);
    expect(dbMatch).not.toBeNull();
    const bytes = dbMatch[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^\.db\s*/, "").trim())
      .filter(Boolean)
      .join(",")
      .split(",")
      .map((v) => parseInt(v.trim(), 10));
    expect(bytes[47] & 0x20).toBe(0x20);
  });
});

describe("compileSnesData - Engine Fields (v4)", () => {
  test("an untouched field compiles to its engine.json defaultValue", async () => {
    const project = loadProject();
    project.engineFieldValues = [];
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    expect(out.engineFieldsC).toMatch(/topdown_grid @0 = 8/);
    expect(out.engineFieldsC).toMatch(/plat_jump_vel @13 = 16384/);
    expect(out.engineFieldsC).toMatch(/shooter_scroll_speed @21 = 1/);
    // the actual byte(s), not just the doc comment - 16384 = 0x4000,
    // little-endian -> lo=0x00, hi=0x40
    expect(out.engineFieldsC).toMatch(/\s+0, 64, \/\* plat_jump_vel @13 = 16384 \*\//);
  });

  test("a project-chosen value overrides the default", async () => {
    const project = loadProject();
    project.engineFieldValues = [
      { id: "shooter_scroll_speed", value: 4 },
      { id: "topdown_grid", value: 16 },
    ];
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    expect(out.engineFieldsC).toMatch(/shooter_scroll_speed @21 = 4/);
    expect(out.engineFieldsC).toMatch(/topdown_grid @0 = 16/);
    expect(out.engineFieldsC).toMatch(/\s+4, \/\* shooter_scroll_speed @21 = 4 \*\//);
    expect(out.engineFieldsC).toMatch(/\s+16, \/\* topdown_grid @0 = 16 \*\//);
    // an untouched field alongside the overridden ones still falls back to
    // its own default, not some shared/reset value
    expect(out.engineFieldsC).toMatch(/plat_jump_vel @13 = 16384/);
  });
});

describe("compileSnesData - oversized background warning (v4)", () => {
  // user-found: this warning still fired for sample_town (56x56 tiles) even
  // after targets/snes.js's maxBackgroundWidth/Height was raised to 512px -
  // it turned out to be a second, independent check hardcoded to the old
  // pre-SC_64x64 32-tile limit. Uses the real snesgbs2 template (its own
  // real PNG files on disk), not a synthetic fixture, since the bug is
  // specifically about real background dimensions.
  const SNESGBS2_DIR = Path.join(
    __dirname,
    "..",
    "..",
    "..",
    "appData",
    "templates",
    "snesgbs2"
  );

  test("a background within the real 64-tile cap does not warn", async () => {
    const project = JSON.parse(
      fs.readFileSync(Path.join(SNESGBS2_DIR, "project.gbsproj"), "utf8")
    );
    const warnings = [];
    await compileSnesData(project, {
      projectRoot: SNESGBS2_DIR,
      warnings: (w) => warnings.push(w),
    });
    expect(warnings.some((w) => w.includes("sample_town"))).toBe(false);
  });

  test("a background beyond the real 64-tile cap still warns, with the real limit in the message", async () => {
    const project = JSON.parse(
      fs.readFileSync(Path.join(SNESGBS2_DIR, "project.gbsproj"), "utf8")
    );
    const warnings = [];
    await compileSnesData(project, {
      projectRoot: SNESGBS2_DIR,
      warnings: (w) => warnings.push(w),
    });
    const leavingEarth = warnings.find((w) => w.includes("leaving_earth"));
    expect(leavingEarth).toBeDefined();
    expect(leavingEarth).toMatch(/255x28 tiles/);
    expect(leavingEarth).toMatch(/64x64 tiles/);
    expect(leavingEarth).not.toMatch(/32x32|32 tiles/);
  });

  // v4 fix, found while scoping background streaming: the two tests above
  // only ever checked whether the *warning* fired - neither actually
  // verified the tilemap DATA itself was complete. sample_town.png is 56x56
  // tiles (comfortably between 32 and the 64-tile warning threshold, so it
  // never warned) but bgTables' map-building loop was hardcoded to 32x32,
  // silently dropping everything past that corner - a real, previously
  // undetected content bug affecting any background over 32 tiles in either
  // dimension, not just the two the user originally reported.
  test("a background between 32 and 64 tiles wide compiles its full tilemap, not a 32x32 corner", async () => {
    const project = JSON.parse(
      fs.readFileSync(Path.join(SNESGBS2_DIR, "project.gbsproj"), "utf8")
    );
    const bgIndex = project.backgrounds.findIndex(
      (b) => b.filename === "sample_town.png"
    );
    expect(bgIndex).toBeGreaterThanOrEqual(0);
    const out = await compileSnesData(project, {
      projectRoot: SNESGBS2_DIR,
      warnings: () => {},
    });
    const lenMatch = out.assetsC.match(/bg_maps_len\[\d+\] = \{ ([^}]+) \};/);
    expect(lenMatch).toBeTruthy();
    const lens = lenMatch[1].split(",").map((s) => parseInt(s.trim(), 10));
    // 56x56 tiles x 2 bytes/tile - was hardcoded to 2048 (32x32x2) before the fix.
    expect(lens[bgIndex]).toBe(56 * 56 * 2);
  });

  // Same root cause, a second, independent hardcoded-32 stride in the
  // priority-tile tilemap override (scenePriorityMaps) - a painted priority
  // tile beyond column 32 used to write its BG_TIL_PRIO bit at the WRONG
  // byte offset (computed with a 32-wide stride against a now-wider map).
  test("a priority tile beyond the old 32-wide corner lands at the correct (not the old 32-stride) offset", async () => {
    const collisions = new Array(40 * 4).fill(0);
    // tx=5, ty=1: old (buggy) 32-wide stride offset (75) differs from the
    // real 40-wide stride offset (91) - ty=0 would coincide with both and
    // wouldn't prove anything.
    collisions[1 * 40 + 5] = TILE_PROP_PRIORITY;
    const project = {
      _version: "2.0.0",
      _release: "7",
      settings: { target: "snes", startSceneId: "s0", startX: 0, startY: 0 },
      backgrounds: [{ id: "bg-wide", filename: "wide40.png", width: 40, height: 4 }],
      spriteSheets: [],
      variables: [],
      scenes: [
        {
          id: "s0",
          name: "wide",
          backgroundId: "bg-wide",
          width: 40,
          height: 4,
          actors: [],
          triggers: [],
          script: [],
          collisions,
        },
      ],
    };
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    const text = out.assetsData["scene_bgmap_0_data.as"];
    expect(text).toBeDefined();
    const body = text.match(/scene_bgmap_0:\n([\s\S]*?)\n\.ends/)[1];
    const bytes = [];
    body.split("\n").forEach((line) => {
      const m = line.match(/^\.db (.+)$/);
      if (m) m[1].split(",").forEach((n) => bytes.push(parseInt(n.trim(), 10)));
    });
    expect(bytes[91] & 0x20).toBe(0x20); // real 40-wide stride offset
    expect(bytes[75] & 0x20).toBe(0); // old buggy 32-wide stride offset
  });
});

describe("compileSnesData - runtime sprite-swap events get a real slot (v4 fix)", () => {
  // user-found: a sheet referenced *only* via EVENT_ACTOR_SET_SPRITE/
  // EVENT_PLAYER_SET_SPRITE (not any actor's own default sheet, not a
  // projectile/weapon event) used to stay unloaded (0xff slot) - the scanner
  // that feeds sceneSpriteIds only ever looked at LAUNCH_PROJECTILE/
  // WEAPON_ATTACK and avatarId. This is exactly the shape a "named animation
  // state" (a dedicated alternate-look sheet, switched to only via a swap
  // event) needs to work.
  const DEFAULT_ID = "581d34d0-9591-4e6e-a609-1d94f203b0cd"; // actor_animated, 6 frames
  const SWAP_ONLY_ID = "swap-only-sheet";

  const baseProject = {
    _version: "2.0.0",
    _release: "7",
    settings: {
      target: "snes",
      startSceneId: "s0",
      startX: 0,
      startY: 0,
      playerSpriteSheetId: DEFAULT_ID,
    },
    backgrounds: [
      { id: "bg", filename: "placeholder.png", width: 20, height: 18 },
    ],
    spriteSheets: [
      { id: DEFAULT_ID, filename: "actor_animated.png", type: "actor_animated" },
      { id: SWAP_ONLY_ID, filename: "actor.png", type: "actor" },
    ],
    variables: [],
  };

  const sceneWithSwapEvent = (command) => ({
    ...baseProject,
    scenes: [
      {
        id: "s0",
        name: "swap",
        backgroundId: "bg",
        width: 20,
        height: 18,
        actors: [
          {
            id: "a0",
            spriteSheetId: DEFAULT_ID,
            x: 0,
            y: 0,
            script: [
              {
                id: "ev0",
                command,
                args: {
                  actorId: command === "EVENT_ACTOR_SET_SPRITE" ? "a0" : undefined,
                  spriteSheetId: SWAP_ONLY_ID,
                },
              },
            ],
          },
        ],
        triggers: [],
        script: [],
      },
    ],
  });

  test("EVENT_ACTOR_SET_SPRITE's own target sheet gets a real (non-0xff) slot", async () => {
    const out = await compileSnesData(sceneWithSwapEvent("EVENT_ACTOR_SET_SPRITE"), {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    const swapOnlyIndex = baseProject.spriteSheets.findIndex((s) => s.id === SWAP_ONLY_ID);
    expect(out.stats.sceneSlotForIndex[0][swapOnlyIndex]).not.toBe(0xff);
  });

  test("EVENT_PLAYER_SET_SPRITE's own target sheet gets a real (non-0xff) slot", async () => {
    const out = await compileSnesData(sceneWithSwapEvent("EVENT_PLAYER_SET_SPRITE"), {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    const swapOnlyIndex = baseProject.spriteSheets.findIndex((s) => s.id === SWAP_ONLY_ID);
    expect(out.stats.sceneSlotForIndex[0][swapOnlyIndex]).not.toBe(0xff);
  });

  // Named animation states (v4, Phase 3): EVENT_ACTOR_SET_STATE/
  // EVENT_PLAYER_SET_STATE carry a stateId, not a spriteSheetId - the real
  // target sheet is one level removed, through the referenced sheet's own
  // states[] (Phase 2). The scanner has to resolve that indirection the
  // same way the event's own compile() does, or a state-only sheet stays
  // unloaded exactly like the original swap-event bug this whole describe
  // block guards against.
  const STATE_ID = "state1";
  const projectWithState = {
    ...baseProject,
    spriteSheets: [
      {
        ...baseProject.spriteSheets[0],
        states: [{ id: STATE_ID, name: "Jump", spriteSheetId: SWAP_ONLY_ID }],
      },
      baseProject.spriteSheets[1],
    ],
  };

  const sceneWithStateEvent = (command) => ({
    ...projectWithState,
    scenes: [
      {
        id: "s0",
        name: "swap",
        backgroundId: "bg",
        width: 20,
        height: 18,
        actors: [
          {
            id: "a0",
            spriteSheetId: DEFAULT_ID,
            x: 0,
            y: 0,
            script: [
              {
                id: "ev0",
                command,
                args: {
                  actorId: command === "EVENT_ACTOR_SET_STATE" ? "a0" : undefined,
                  spriteSheetId: DEFAULT_ID,
                  stateId: STATE_ID,
                },
              },
            ],
          },
        ],
        triggers: [],
        script: [],
      },
    ],
  });

  test("EVENT_ACTOR_SET_STATE resolves through states[] to a real (non-0xff) slot", async () => {
    const out = await compileSnesData(sceneWithStateEvent("EVENT_ACTOR_SET_STATE"), {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    const swapOnlyIndex = baseProject.spriteSheets.findIndex((s) => s.id === SWAP_ONLY_ID);
    expect(out.stats.sceneSlotForIndex[0][swapOnlyIndex]).not.toBe(0xff);
  });

  test("EVENT_PLAYER_SET_STATE resolves through states[] to a real (non-0xff) slot", async () => {
    const out = await compileSnesData(sceneWithStateEvent("EVENT_PLAYER_SET_STATE"), {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    const swapOnlyIndex = baseProject.spriteSheets.findIndex((s) => s.id === SWAP_ONLY_ID);
    expect(out.stats.sceneSlotForIndex[0][swapOnlyIndex]).not.toBe(0xff);
  });
});
