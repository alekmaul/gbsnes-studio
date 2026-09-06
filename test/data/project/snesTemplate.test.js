import fs from "fs-extra";
import Path from "path";
import os from "os";
import createProject from "../../../src/lib/project/createProject";
import migrateProject from "../../../src/lib/project/migrateProject";
import compileSnesData from "../../../src/lib/compiler/compileSnesData";
import buildProject from "../../../src/lib/compiler/buildProject";
import { buildToolsRoot } from "../../../src/consts";

const TMP_DIR = Path.join(os.tmpdir(), "gbs-snestemplate-test");
const hasToolchain = fs.existsSync(
  Path.join(buildToolsRoot, `${process.platform}-${process.arch}`, "pvsneslib")
);

describe("snesblank template", () => {
  beforeAll(async () => {
    await fs.remove(TMP_DIR);
    await fs.ensureDir(TMP_DIR);
  });
  afterAll(async () => {
    await fs.remove(TMP_DIR);
  });

  test("scaffolds via createProject with settings.target = snes", async () => {
    const projectDataPath = await createProject({
      name: "MySnesGame",
      path: TMP_DIR,
      target: "snesblank"
    });
    const raw = JSON.parse(fs.readFileSync(projectDataPath, "utf8"));
    expect(raw.settings.target).toBe("snes");
    expect(raw.name).toBe("MySnesGame");
    expect(raw.name).not.toMatch(/___/);
    expect(raw.author).not.toMatch(/___/);

    // migrateProject (run on load) shouldn't throw on the template's shape
    const migrated = migrateProject(raw);
    expect(migrated.settings.target).toBe("snes");

    // compileSnesData should get past asset/settings loading and only fail
    // on the expected "no scenes yet" (a truly blank template has none) -
    // any other failure means the template's assets/settings are broken.
    const projectRoot = Path.dirname(projectDataPath);
    await expect(
      compileSnesData(migrated, { projectRoot, warnings: () => {} })
    ).rejects.toThrow("Project has no scenes");
  });
});

describe("sneshtml template (the sample game, SNES)", () => {
  beforeAll(async () => {
    await fs.remove(TMP_DIR);
    await fs.ensureDir(TMP_DIR);
  });
  afterAll(async () => {
    await fs.remove(TMP_DIR);
  });

  test("scaffolds as a snes project and compiles through compileSnesData", async () => {
    const projectDataPath = await createProject({
      name: "MySnesGame",
      path: TMP_DIR,
      target: "sneshtml"
    });
    const raw = JSON.parse(fs.readFileSync(projectDataPath, "utf8"));
    expect(raw.settings.target).toBe("snes");
    expect(raw.name).toBe("MySnesGame");
    expect(raw.name).not.toMatch(/___/);
    expect(raw.author).not.toMatch(/___/);
    // it's the full sample: the same 8 scenes / 8 backgrounds as gbhtml
    expect(raw.scenes.length).toBe(8);

    const migrated = migrateProject(raw);
    expect(migrated.settings.target).toBe("snes");

    // unlike snesblank this has scenes, so it should compile - every event
    // the sample uses is on the SNES support list. No unresolved placeholders.
    const warnings = [];
    const projectRoot = Path.dirname(projectDataPath);
    const out = await compileSnesData(migrated, {
      projectRoot,
      warnings: m => warnings.push(m)
    });
    expect(out.stats.scenes).toBe(8);
    expect(out.assetsH).toMatch(/#define NUM_SCENES 8/);
    expect(warnings.filter(w => /Unresolved placeholder/.test(w))).toEqual([]);
  });

  (hasToolchain ? test : test.skip)(
    "builds end to end to a bootable .sfc",
    async () => {
      const projectDataPath = await createProject({
        name: "SnesSample",
        path: TMP_DIR,
        target: "sneshtml"
      });
      const raw = JSON.parse(fs.readFileSync(projectDataPath, "utf8"));
      const outputRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), "gbs-sneshtml-build-")
      );
      try {
        await buildProject(raw, {
          projectRoot: Path.dirname(projectDataPath),
          outputRoot,
          progress: () => {},
          warnings: () => {}
        });
        const rom = await fs.readFile(
          Path.join(outputRoot, "build", "rom", "game.sfc")
        );
        expect(rom.length % 0x8000).toBe(0);
        expect(rom[0x7fd5]).toBe(0x30); // LoROM | FastROM
      } finally {
        await fs.remove(outputRoot);
      }
    },
    240000
  );
});
