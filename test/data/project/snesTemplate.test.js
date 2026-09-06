import fs from "fs-extra";
import Path from "path";
import os from "os";
import createProject from "../../../src/lib/project/createProject";
import migrateProject from "../../../src/lib/project/migrateProject";
import compileSnesData from "../../../src/lib/compiler/compileSnesData";

const TMP_DIR = Path.join(os.tmpdir(), "gbs-snestemplate-test");

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
