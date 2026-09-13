import fs from "fs-extra";
import Path from "path";
import compileSnesData, {
  resolvePlaceholders,
} from "../../../src/lib/compiler/compileSnesData";

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
    // scene start script + 1 actor script
    expect(out.stats.scripts).toBe(2);
  });

  test("collects the actor's dialogue strings and variables", () => {
    expect(out.stats.strings).toBeGreaterThan(10); // the actor spams TEXT
    expect(out.stats.variables).toBeGreaterThanOrEqual(0);
  });

  // v2 M5a: the scene blob header gained a scene_type byte at position 6
  // (after height, before the [24] sprite-slot table) - every offset past
  // height in the old (v1.1.4) layout shifts by +1 here.
  test("scene blob header: [bg, nActors, nTriggers, scriptIdx, w, h, sceneType] + [24] sprite table", () => {
    const blob = out.stats.sceneBlobs[0];
    expect(blob.slice(0, 6)).toEqual([0, 1, 0, 0, 20, 18]);
    expect(blob[6]).toBe(0); // scene.type undefined -> defaults to 0 (Top Down)
    // [7..30] per-scene OBJ slot table: sprite_type[8], sprite_frames[8], sprite_pal[8]
    expect(blob.slice(23, 31)).toEqual([0, 3, 4, 5, 6, 7, 0, 0]); // pal numbers
    // first actor entry (9 bytes) starts right after the 24-byte table (at 31)
    // x, y, dir(down=1), move(static=1), spriteSlot, scriptIdx, ...
    expect(blob.slice(31, 37)).toEqual([9, 7, 1, 1, 0, 1]);
  });

  test("the actor's first TEXT resolves to a string index", () => {
    // actor script index 1; first op is TEXT (0x01) then bank/hi/lo of string 0
    const s = out.stats.scriptBytes[1];
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
    // actor entry starts right after [6]+[24]=[31]; spriteType is byte 6 of
    // the 9-byte actor entry (x,y,dir,move,slot,scriptIdx,spriteType,...)
    const actorEntry = out.stats.sceneBlobs[0].slice(31, 40);
    expect(actorEntry[6]).toBe(0); // SPRITE_STATIC despite movementType=randomWalk
  });
});
