import fs from "fs-extra";
import os from "os";
import Path from "path";
import compileSnesData, {
  resolvePlaceholders
} from "../../../src/lib/compiler/compileSnesData";
import buildProject from "../../../src/lib/compiler/buildProject";
import { buildToolsRoot } from "../../../src/consts";

const PROJECT_DIR = Path.join(
  __dirname,
  "..",
  "..",
  "projects",
  "Test_Math"
);
const loadProject = () => {
  const p = JSON.parse(
    fs.readFileSync(Path.join(PROJECT_DIR, "Test_Math.gbsproj"), "utf8")
  );
  p.settings = { ...p.settings, target: "snes" };
  return p;
};

describe("resolvePlaceholders", () => {
  const warn = () => {};
  test("STRING_* triple -> 0 / hi / lo of the string index", () => {
    expect(
      resolvePlaceholders(
        [
          1,
          "__REPLACE:STRING_BANK:5",
          "__REPLACE:STRING_HI:5",
          "__REPLACE:STRING_LO:5"
        ],
        "x",
        warn
      )
    ).toEqual([1, 0, 0, 5]);
    expect(
      resolvePlaceholders(["__REPLACE:STRING_LO:300"], "x", warn)
    ).toEqual([300 & 0xff]);
    expect(
      resolvePlaceholders(["__REPLACE:STRING_HI:300"], "x", warn)
    ).toEqual([1]);
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
      warnings: m => warnings.push(m)
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
    expect(out.stats.variables).toBeGreaterThanOrEqual(5);
  });

  test("scene start script compiles the 5 SET_VALUE events + END", () => {
    // value 0 optimises to SET_FALSE (0x06, args varHi/varLo); the rest are
    // SET_VALUE (0x24, args varHi/varLo/value). Terminating 0 = END.
    expect(out.stats.scriptBytes[0]).toEqual([
      0x06, 0x00, 0x00,
      0x24, 0x00, 0x01, 10,
      0x24, 0x00, 0x02, 25,
      0x24, 0x00, 0x03, 50,
      0x24, 0x00, 0x04, 100,
      0x00
    ]);
  });

  test("scene blob header: [bg, nActors, nTriggers, scriptIdx, w, h] + [24] sprite table", () => {
    const blob = out.stats.sceneBlobs[0];
    expect(blob.slice(0, 6)).toEqual([0, 1, 0, 0, 20, 18]);
    // [6..29] per-scene OBJ slot table: sprite_type[8], sprite_frames[8], sprite_pal[8]
    expect(blob.slice(22, 30)).toEqual([0, 3, 4, 5, 6, 7, 0, 0]); // pal numbers
    // first actor entry (9 bytes) starts right after the 24-byte table
    // x, y, dir(down=1), move(static=1), spriteSlot, scriptIdx, ...
    expect(blob.slice(30, 36)).toEqual([9, 7, 1, 1, 0, 1]);
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
    expect(out.assetsH).toMatch(
      new RegExp(`event_ptrs\\[${out.stats.scripts}\\]`)
    );
  });

  test("no unresolved-placeholder warnings", () => {
    expect(warnings.filter(w => /Unresolved placeholder/.test(w))).toEqual([]);
  });
});

describe("compileSnesData - CHOICE / MENU (M5b)", () => {
  const project = {
    settings: { target: "snes", startSceneId: "s", startX: 1, startY: 1 },
    backgrounds: [{ id: "bg", filename: "placeholder.png", width: 20, height: 18 }],
    variables: [],
    scenes: [
      {
        id: "s",
        name: "s",
        backgroundId: "bg",
        width: 20,
        height: 18,
        actors: [],
        triggers: [],
        script: [
          {
            command: "EVENT_CHOICE",
            args: { variable: "0", trueText: "Yes", falseText: "No" }
          },
          {
            command: "EVENT_MENU",
            args: {
              variable: "1",
              items: 3,
              option1: "A",
              option2: "B",
              option3: "C",
              layout: "menu",
              cancelOnB: true
            }
          }
        ]
      }
    ]
  };

  test("CHOICE -> opcode 0x27 + var + string index; MENU -> 0x5C + layout/cfg", async () => {
    const out = await compileSnesData(
      { ...project, backgrounds: project.backgrounds },
      {
        projectRoot: Path.join(__dirname, "..", "..", "projects", "Test_Math"),
        warnings: () => {}
      }
    );
    const s = out.stats.scriptBytes[0];
    // CHOICE: [0x27, varHi, varLo, 0, strHi, strLo]
    expect(s[0]).toBe(0x27);
    expect(s[1]).toBe(0); // var 0 hi
    expect(s[2]).toBe(0); // var 0 lo
    expect(s[3]).toBe(0); // bank
    expect((s[4] << 8) | s[5]).toBe(0); // string index 0 ("Yes\nNo")
    // MENU right after: [0x5C, varHi, varLo, 0, strHi, strLo, layout, cfg]
    expect(s[6]).toBe(0x5c);
    expect((s[7] << 8) | s[8]).toBe(1); // var 1
    expect((s[10] << 8) | s[11]).toBe(1); // string index 1 ("A\nB\nC")
    expect(s[12]).toBe(1); // layout "menu" -> 1
    expect(s[13]).toBe(2); // cancelOnB -> bit 1
    // two option-strings collected: "Yes\nNo" and "A\nB\nC"
    expect(out.stats.strings).toBe(2);
  });
});

describe("compileSnesData - TEXT_WITH_AVATAR / OVERLAY (M5d)", () => {
  const project = {
    settings: { target: "snes", startSceneId: "s", startX: 1, startY: 1 },
    backgrounds: [{ id: "bg", filename: "placeholder.png", width: 20, height: 18 }],
    spriteSheets: [{ id: "av", filename: "static.png", numFrames: 1 }],
    variables: [],
    scenes: [
      {
        id: "s",
        name: "s",
        backgroundId: "bg",
        width: 20,
        height: 18,
        actors: [],
        triggers: [],
        script: [
          { command: "EVENT_TEXT", args: { text: "Hi", avatarId: "av" } },
          { command: "EVENT_ACTOR_EMOTE", args: { actorId: "player", emoteId: 3 } },
          { command: "EVENT_OVERLAY_SHOW", args: { color: "white", x: 0, y: 0 } },
          { command: "EVENT_OVERLAY_HIDE", args: {} }
        ]
      }
    ]
  };

  test("resolves an avatar sprite sheet into slot 0 of the OBJ sheet", async () => {
    const out = await compileSnesData(project, {
      projectRoot: Path.join(
        __dirname, "..", "..", "projects", "Test_ActorInvoke"
      ),
      warnings: () => {}
    });
    const s = out.stats.scriptBytes[0];
    // TEXT_WITH_AVATAR: [0x5B, bank, strHi, strLo, avatarIndex]
    expect(s[0]).toBe(0x5b);
    expect(s[1]).toBe(0); // bank
    expect((s[2] << 8) | s[3]).toBe(0); // string index 0 ("Hi")
    expect(s[4]).toBe(0); // avatar slot 0 (only avatar used)
    expect(out.assetsH).toMatch(/#define NUM_AVATARS 1/);
  });
});

describe("compileSnesData - per-sprite OBJ palettes", () => {
  const PROJECT_ROOT = Path.join(
    __dirname, "..", "..", "projects", "Test_ActorInvoke"
  );
  // two distinct sprite sheets: player + one NPC on a different sheet
  const project = {
    settings: {
      target: "snes",
      startSceneId: "s",
      startX: 1,
      startY: 1,
      playerSpriteSheetId: "player"
    },
    backgrounds: [{ id: "bg", filename: "placeholder.png", width: 20, height: 18 }],
    spriteSheets: [
      { id: "player", filename: "actor.png", numFrames: 3 },
      { id: "npc", filename: "signpost.png", numFrames: 1 }
    ],
    variables: [],
    scenes: [
      {
        id: "s",
        name: "s",
        backgroundId: "bg",
        width: 20,
        height: 18,
        actors: [
          { id: "a0", x: 5, y: 5, spriteSheetId: "npc", movementType: "static", script: [] }
        ],
        triggers: [],
        script: []
      }
    ]
  };

  test("each used sprite slot draws its own OBJ palette", async () => {
    const out = await compileSnesData(project, {
      projectRoot: PROJECT_ROOT,
      warnings: () => {}
    });
    // slot 0 (player) -> OBJ pal 0, slot 1 (npc) -> pal 3 (pool skips 1/2 =
    // emote/avatar). The per-scene blob's pal table (bytes 22..29) carries it.
    expect(out.stats.sceneBlobs[0].slice(22, 30)).toEqual([0, 3, 4, 5, 6, 7, 0, 0]);
    expect(out.assetsH).toMatch(/#define PLAYER_SPRITE_PAL 0/);
    // the per-scene OBJ CGRAM image: 8 palettes * 32 bytes, in its own .as file
    expect(out.assetsH).toMatch(/#define SPR_PAL_SIZE\s+256/);
    const palAs = out.assetsData["scene_spr_pal_0_data.as"];
    expect(palAs).toMatch(/\.section "rodata_scene_spr_pal_0" superfree/);
    expect(palAs).toMatch(/\nscene_spr_pal_0:/);
    // pal 0 (bytes 0..31) and pal 3 (bytes 96..127) hold different colours
    const bytes = palAs
      .split(/\r?\n/)
      .filter(l => l.startsWith(".db "))
      .flatMap(l => l.slice(4).split(",").map(x => parseInt(x.trim(), 10)));
    expect(bytes.length).toBe(256);
    const pal0 = bytes.slice(0, 32).join(",");
    const pal3 = bytes.slice(96, 128).join(",");
    expect(pal0).not.toBe(pal3);
    expect(pal3).not.toMatch(/^0(,0)*$/); // pal 3 actually populated
  });

  test("a 7th distinct sheet falls back to palette 0", async () => {
    const many = {
      ...project,
      spriteSheets: Array.from({ length: 7 }, (_, i) => ({
        id: `s${i}`,
        filename: i % 2 ? "signpost.png" : "static.png",
        numFrames: 1
      })),
      settings: { ...project.settings, playerSpriteSheetId: "s0" },
      scenes: [
        {
          ...project.scenes[0],
          actors: Array.from({ length: 6 }, (_, i) => ({
            id: `a${i}`,
            x: i + 2,
            y: 5,
            spriteSheetId: `s${i + 1}`,
            movementType: "static",
            script: []
          }))
        }
      ]
    };
    const out = await compileSnesData(many, {
      projectRoot: PROJECT_ROOT,
      warnings: () => {}
    });
    // 6 actor sheets + player = 7 in one scene: slot 6 (7th) reuses pal 0
    expect(out.stats.sceneBlobs[0].slice(22, 30)).toEqual([0, 3, 4, 5, 6, 7, 0, 0]);
  });
});

describe("compileSnesData - per-scene sprite sheets", () => {
  const PROJECT_ROOT = Path.join(
    __dirname, "..", "..", "projects", "Test_ActorInvoke"
  );
  const sheet = (id, file) => ({ id, filename: file, numFrames: 1 });

  test("each scene loads its own <=8 sheets; the same actor sheet gets a per-scene slot", async () => {
    // 12 distinct sheets across 2 scenes - would overflow one project-wide 8-slot
    // sheet, but each scene only uses a handful.
    const project = {
      settings: { target: "snes", startSceneId: "a", startX: 1, startY: 1, playerSpriteSheetId: "player" },
      backgrounds: [{ id: "bg", filename: "placeholder.png", width: 20, height: 18 }],
      spriteSheets: [
        sheet("player", "actor.png"),
        ...Array.from({ length: 11 }, (_, i) =>
          sheet(`s${i}`, i % 2 ? "signpost.png" : "static.png")
        )
      ],
      variables: [],
      scenes: [
        {
          id: "a", name: "A", backgroundId: "bg", width: 20, height: 18, triggers: [],
          actors: [
            { id: "a0", x: 2, y: 2, spriteSheetId: "s0", movementType: "static", script: [] },
            { id: "a1", x: 3, y: 2, spriteSheetId: "s1", movementType: "static", script: [] }
          ]
        },
        {
          id: "b", name: "B", backgroundId: "bg", width: 20, height: 18, triggers: [],
          actors: [
            // s1 again (different scene -> different slot) + a fresh sheet
            { id: "b0", x: 2, y: 2, spriteSheetId: "s1", movementType: "static", script: [] },
            { id: "b1", x: 3, y: 2, spriteSheetId: "s9", movementType: "static", script: [] }
          ]
        }
      ]
    };
    const out = await compileSnesData(project, { projectRoot: PROJECT_ROOT, warnings: () => {} });

    // one deduped tile blob + pointer table entry per scene, no project-wide spr_tiles
    expect(out.assetsC).not.toMatch(/\bspr_tiles\b/);
    expect(out.assetsData["scene_spr_0_data.as"]).toMatch(
      /\.section "rodata_scene_spr_0" superfree[\s\S]*\nscene_spr_0:/
    );
    expect(out.assetsData["data.asm"]).toMatch(
      /\.include "src\/data\/scene_spr_0_data\.as"/
    );
    expect(out.assetsC).toMatch(/scene_spr_ptrs\[2\]/);

    // scene A: player=slot 0, s0=1, s1=2 -> actor entries reference 1 and 2
    const a = out.stats.sceneBlobs[0];
    const actorsA = a.slice(6 + 24);
    expect(actorsA[4]).toBe(1); // a0 -> s0 -> slot 1
    expect(actorsA[9 + 4]).toBe(2); // a1 -> s1 -> slot 2
    // scene B: player=0, s1=1 (NOT 2 - it's B's first actor sheet), s9=2
    const b = out.stats.sceneBlobs[1];
    const actorsB = b.slice(6 + 24);
    expect(actorsB[4]).toBe(1); // b0 -> s1 -> slot 1 in scene B
    expect(actorsB[9 + 4]).toBe(2); // b1 -> s9 -> slot 2
  });

  test("a scene with >8 distinct sheets warns and overflows to slot 0", async () => {
    const warns = [];
    const project = {
      settings: { target: "snes", startSceneId: "s", startX: 1, startY: 1, playerSpriteSheetId: "player" },
      backgrounds: [{ id: "bg", filename: "placeholder.png", width: 20, height: 18 }],
      spriteSheets: [
        sheet("player", "actor.png"),
        ...Array.from({ length: 9 }, (_, i) => sheet(`s${i}`, "static.png"))
      ],
      variables: [],
      scenes: [
        {
          id: "s", name: "Crowded", backgroundId: "bg", width: 20, height: 18, triggers: [],
          actors: Array.from({ length: 9 }, (_, i) => ({
            id: `a${i}`, x: i + 2, y: 5, spriteSheetId: `s${i}`, movementType: "static", script: []
          }))
        }
      ]
    };
    await compileSnesData(project, { projectRoot: PROJECT_ROOT, warnings: m => warns.push(m) });
    expect(warns.join("\n")).toMatch(/Crowded.*sprite sheets/);
  });
});

// Every checked-in fixture that has scenes must at least compile: no throw, no
// unresolved placeholder, every scene blob points at a real script/bg.
describe("compileSnesData - all test/projects fixtures", () => {
  const fixtures = fs
    .readdirSync(Path.join(__dirname, "..", "..", "projects"))
    .map(name => {
      const dir = Path.join(__dirname, "..", "..", "projects", name);
      if (!fs.statSync(dir).isDirectory()) return null;
      const gbs = fs.readdirSync(dir).find(x => x.endsWith(".gbsproj"));
      if (!gbs) return null;
      const gbsproj = Path.join(dir, gbs);
      const p = JSON.parse(fs.readFileSync(gbsproj, "utf8"));
      if (!Array.isArray(p.scenes) || p.scenes.length === 0) return null;
      return { name, dir, gbsproj };
    })
    .filter(Boolean);

  test.each(fixtures.map(f => [f.name, f]))("%s compiles", async (_name, f) => {
    const p = JSON.parse(fs.readFileSync(f.gbsproj, "utf8"));
    p.settings = { ...p.settings, target: "snes" };
    const w = [];
    const out = await compileSnesData(p, {
      projectRoot: f.dir,
      warnings: m => w.push(m)
    });
    expect(w.filter(x => /Unresolved placeholder/.test(x))).toEqual([]);
    out.stats.sceneBlobs.forEach(blob => {
      expect(blob[3]).toBeLessThan(out.stats.scripts); // scene script idx
      expect(blob[0]).toBeLessThan(out.stats.backgrounds); // bg idx
    });
  });
});

// Toolchain-gated: the full project -> bootable .sfc path.
const vendored = Path.join(
  buildToolsRoot,
  `${process.platform}-${process.arch}`,
  "pvsneslib"
);
const maybe = fs.existsSync(vendored) ? describe : describe.skip;

maybe("buildProject (snes) - fixtures end to end", () => {
  // Fixtures that use only implemented opcodes - each must compile to a
  // bootable 256 KB LoROM/FastROM .sfc through the real toolchain.
  const E2E = [
    "Test_Math",
    "Test_CombinedMath",
    "Test_ActorStoreDirection",
    "Test_RelativePos",
    "Test_SceneState",
    "Test_ActorInvoke"
  ];

  test.each(E2E)(
    "%s -> bootable ROM",
    async name => {
      const dir = Path.join(__dirname, "..", "..", "projects", name);
      const gbs = fs.readdirSync(dir).find(x => x.endsWith(".gbsproj"));
      const p = JSON.parse(fs.readFileSync(Path.join(dir, gbs), "utf8"));
      p.name = name;
      p.settings = { ...p.settings, target: "snes" };
      const outputRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), `gbs-snes-m7-${name}-`)
      );
      try {
        await buildProject(p, {
          projectRoot: dir,
          outputRoot,
          progress: () => {},
          warnings: () => {}
        });
        const rom = await fs.readFile(
          Path.join(outputRoot, "build", "rom", "game.sfc")
        );
        expect(rom.length).toBe(8 * 0x8000);
        expect(rom[0x7fd5]).toBe(0x30); // LoROM | FastROM
        const assetsC = await fs.readFile(
          Path.join(outputRoot, "src", "assets.c"),
          "utf8"
        );
        expect(assetsC).toMatch(/compileSnesData\.js/);
      } finally {
        await fs.remove(outputRoot);
      }
    },
    180000
  );
});
