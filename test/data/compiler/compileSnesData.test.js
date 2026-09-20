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
    // A background at or under 32x32 (w=20 here) fits a single, always-
    // 32-wide SC_32x32 hardware screen - real stride is 32 regardless of
    // the background's own real width, not w itself (a background this
    // small never needs the SC_64x64 four-screen layout at all). tile
    // (3,1) -> byte offset (1*32+3)*2 = 70, high byte (offset 71) should
    // have bit 0x20 set ((1<<13)>>8 - see compileSnesData.js's
    // BG_TIL_PRIO_HI).
    const dbMatch = asFile.match(/scene_bgmap_0:\n([\s\S]*?)\n\.ends/);
    expect(dbMatch).not.toBeNull();
    const bytes = dbMatch[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^\.db\s*/, "").trim())
      .filter(Boolean)
      .join(",")
      .split(",")
      .map((v) => parseInt(v.trim(), 10));
    expect(bytes[71] & 0x20).toBe(0x20);
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

  // Horizontal background streaming (v4): a background over 64 tiles wide
  // gets a second, complete (unclamped) flat tilemap in ROM
  // (bg_fullmap_ptrs) for scene.c's SceneStreamBackground to stream new
  // columns from as the camera scrolls past the initial 64-tile VRAM
  // window - see the plan's real Mesen verification (Space Battle's
  // starfield scrolling all the way to reveal the Earth/moon art far along
  // the 255-tile background). A background within the cap gets a null (0)
  // entry - nothing to stream, matching every other background.
  test("a background over 64 tiles wide gets a real bg_fullmap_ptrs entry with its complete tilemap", async () => {
    const project = JSON.parse(
      fs.readFileSync(Path.join(SNESGBS2_DIR, "project.gbsproj"), "utf8")
    );
    const leavingEarthIndex = project.backgrounds.findIndex(
      (b) => b.filename === "leaving_earth.png"
    );
    const sampleTownIndex = project.backgrounds.findIndex(
      (b) => b.filename === "sample_town.png"
    );
    expect(leavingEarthIndex).toBeGreaterThanOrEqual(0);
    expect(sampleTownIndex).toBeGreaterThanOrEqual(0);
    const out = await compileSnesData(project, {
      projectRoot: SNESGBS2_DIR,
      warnings: () => {},
    });
    const ptrsMatch = out.assetsC.match(
      /const unsigned char \*const bg_fullmap_ptrs\[\d+\] = \{\n([\s\S]*?)\n\};/
    );
    expect(ptrsMatch).toBeTruthy();
    const ptrs = ptrsMatch[1].split(",\n").map((s) => s.trim());
    expect(ptrs[leavingEarthIndex]).toBe(`bg${leavingEarthIndex}_fullmap`);
    expect(ptrs[sampleTownIndex]).toBe("0");

    // the extern declaration in assets.h carries the real array size -
    // confirms the fullmap is the *complete* 255x28 tilemap (14280 bytes),
    // not clamped to the 64x64 VRAM window like bg<i>_map is.
    expect(out.assetsH).toMatch(
      new RegExp(`bg${leavingEarthIndex}_fullmap\\[${255 * 28 * 2}\\]`)
    );
    expect(out.assetsData[`bg${leavingEarthIndex}_data.as`]).toMatch(
      new RegExp(`bg${leavingEarthIndex}_fullmap:`)
    );
  });

  // v4 fix, found while scoping background streaming: the two tests above
  // only ever checked whether the *warning* fired - neither actually
  // verified the tilemap DATA itself was complete or correctly laid out.
  // sample_town.png is 56x56 tiles (comfortably between 32 and the 64-tile
  // warning threshold, so it never warned) but bgTables' map-building loop
  // was hardcoded to 32x32, silently dropping everything past that corner.
  // A background this size (over 32 in both dimensions) needs the real
  // SC_64x64 four-screen VRAM layout (see mapByteIndex/usesQuadrants),
  // which always allocates the full 64x64-tile buffer regardless of the
  // source image's exact size - so the fixed expectation here is 8192
  // bytes (64*64*2), not 56*56*2.
  test("a background between 32 and 64 tiles wide compiles a full 64x64 (SC_64x64) tilemap, not a 32x32 corner", async () => {
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
    // was hardcoded to 2048 (32x32x2) before the fix.
    expect(lens[bgIndex]).toBe(64 * 64 * 2);
  });

  // The real SC_64x64 hardware layout (found via a real Mesen spike: a
  // background half blue/half red with the seam on tile column 32 - the
  // right half showed up scrambled into the wrong row instead of a clean
  // vertical split). A BG tilemap over 32 tiles in either dimension is
  // built from four 32x32-tile "screens" (TL/TR/BL/BR) at VRAM word
  // offsets 0x000/0x400/0x800/0xC00 - NOT one flat w-wide row-major array.
  // spike48.png is 48x2 tiles, solid blue for columns 0-31 (screen TL) and
  // solid red for columns 32-47 (screen TR, real SNES word offset 0x400 =
  // byte offset 2048) - this proves the actual quadrant jump, not just a
  // stride number.
  test("a background over 32 tiles wide places column 32 at the real SC_64x64 top-right-screen VRAM offset", async () => {
    const project = {
      _version: "2.0.0",
      _release: "7",
      settings: { target: "snes", startSceneId: "s0", startX: 0, startY: 0 },
      backgrounds: [{ id: "bg", filename: "spike48.png", width: 48, height: 2 }],
      spriteSheets: [],
      variables: [],
      scenes: [
        {
          id: "s0",
          name: "spike",
          backgroundId: "bg",
          width: 48,
          height: 2,
          actors: [],
          triggers: [],
          script: [],
        },
      ],
    };
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_DIR,
      warnings: () => {},
    });
    const text = out.assetsData["bg0_data.as"];
    const body = text.match(/bg0_map:\n([\s\S]*?)\n\.ends/)[1];
    const bytes = [];
    body.split("\n").forEach((line) => {
      const m = line.match(/^\.db (.+)$/);
      if (m) m[1].split(",").forEach((n) => bytes.push(parseInt(n.trim(), 10)));
    });
    const tileAt = (byteOffset) => bytes[byteOffset] | (bytes[byteOffset + 1] << 8);
    const blueTile = tileAt(0); // (tx=0,ty=0) - screen TL, byte 0
    const blueTileEdge = tileAt(31 * 2); // (tx=31,ty=0) - still screen TL
    const redTile = tileAt(2048); // (tx=32,ty=0) - screen TR starts at word 0x400 = byte 2048
    const redTileEdge = tileAt(2048 + 15 * 2); // (tx=47,ty=0) - last real red column
    expect(blueTile).toBe(blueTileEdge);
    expect(redTile).toBe(redTileEdge);
    expect(blueTile).not.toBe(redTile);
    // The naive (wrong) flat-stride byte offset for (tx=32,ty=0) would be
    // 32*2=64, not 2048 - assert the flat position is NOT where the red
    // tile actually landed (still blue, since (tx=32,ty=1) in a flat
    // layout - now genuinely part of screen TL's own row 1).
    expect(tileAt(64)).not.toBe(redTile);
  });

  // Same root cause as the two tests above, a second, independent site
  // that has now been wrong twice: first a hardcoded 32-wide stride, then
  // (this test's own earlier version) a flat w-wide stride that didn't
  // account for the real four-screen layout either - a priority tile in
  // the TR screen used to land inside what hardware reads as TL's own data
  // instead. Now shares mapByteIndex with the map builder (see
  // compileSnesData.js) so the two can't drift apart again.
  test("a priority tile in the top-right SC_64x64 screen lands at the real quadrant offset, not a flat stride", async () => {
    const collisions = new Array(40 * 4).fill(0);
    // tx=35 (screen TR, local x=3), ty=1 (still screen row 1, local y=1).
    collisions[1 * 40 + 35] = TILE_PROP_PRIORITY;
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
    // screen TR starts at word 0x400 (byte 2048); local (lx=3,ly=1) within
    // it -> word 1*32+3=35 -> byte (1024+35)*2=2118, high byte 2119.
    expect(bytes[2119] & 0x20).toBe(0x20);
    // the old flat 40-wide-stride guess: (1*40+35)*2+1 = 151 - must NOT be
    // where the bit actually landed.
    expect(bytes[151] & 0x20).toBe(0);
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
