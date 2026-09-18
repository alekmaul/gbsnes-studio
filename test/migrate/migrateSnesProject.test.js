import fs from "fs-extra";
import Path from "path";
import migrateProject from "../../src/lib/project/migrateProject";
import compileSnesData from "../../src/lib/compiler/compileSnesData";

/*
 * M10 - roadmap step 3: "a real v1.1.4 SNES .gbsproj, committed, migrated
 * and recompiled in the new suite". This used to read appData/templates/
 * sneshtml directly, back when that template shipped un-migrated at its
 * original v1.1.4-era "1.2.0"/no _release shape (createProject.js copies
 * templates raw and only loadProjectData.js migrates, on open) - reusing it
 * avoided committing a second copy of the same data.
 *
 * That coupling turned the template's own staleness into a "feature" this
 * test quietly depended on - which was actually a real user-facing bug
 * (every new sneshtml/snesblank project opened straight into a spurious
 * "Project Requires Migrating" dialog, user-found). Now that the templates
 * are pre-migrated to the current version/release (so a fresh project opens
 * clean), this test owns a frozen, dedicated copy of the real pre-migration
 * content instead - still the genuine v1.1.4-era sample project, just no
 * longer required to also serve as the live template.
 */
const FIXTURE_PATH = Path.join(
  __dirname,
  "fixtures",
  "sneshtml_v1.2.0.gbsproj"
);
const RECOMPILE_PROJECT_ROOT = Path.join(
  __dirname,
  "..",
  "..",
  "appData",
  "templates",
  "sneshtml"
);

const loadFixture = () =>
  JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

describe("migrateProject - real v1.1.4 SNES project (sneshtml)", () => {
  test("fixture precondition: still at the pre-2.0.0 shape it shipped with", () => {
    const raw = loadFixture();
    expect(raw._version).toBe("1.2.0");
    expect(raw._release).toBeUndefined();
    expect(raw.settings.target).toBe("snes");
  });

  test("migrates cleanly to the current 2.0.0 release", () => {
    const migrated = migrateProject(loadFixture());
    expect(migrated._version).toBe("2.0.0");
    expect(migrated._release).toBe("6");
  });

  test("SNES-only settings (target/snesRegion/snesSramSize) survive the migration", () => {
    const migrated = migrateProject(loadFixture());
    expect(migrated.settings.target).toBe("snes");
    expect(migrated.settings.snesRegion).toBe("ntsc");
    expect(migrated.settings.snesSramSize).toBe("03");
  });

  test("randomWalk/randomFace actors gain a generated updateScript, but keep their original movementType", () => {
    // The v2.0.0 "On Update" script mechanism (generateRandomWalkScript /
    // generateRandomLookScript) isn't wired into the SNES engine yet - it
    // still needs genuine parallel VM contexts the engine doesn't have
    // (see the M5 "On Update" investigation) - so compileSnesData.js keeps
    // reading actor.movementType directly for its own move-byte encoding,
    // exactly like v1.1.4 did. migrateProject.js's actor migration is
    // additive (spreads ...actor before adding updateScript/spriteType),
    // so the old field is never lost - this is what makes that safe.
    const migrated = migrateProject(loadFixture());
    const allActors = migrated.scenes.flatMap((s) => s.actors);
    const randomWalkActor = allActors.find(
      (a) => a.movementType === "randomWalk"
    );
    expect(randomWalkActor).toBeDefined();
    expect(randomWalkActor.updateScript).toBeDefined();
    expect(randomWalkActor.updateScript.length).toBeGreaterThan(0);
  });

  test("recompiles through compileSnesData with no warnings, all 8 scenes present", async () => {
    const migrated = migrateProject(loadFixture());
    const warnings = [];
    // Assets (backgrounds, sprites, UI PNGs) still live under the real
    // template dir - the fixture above only froze the project.gbsproj JSON.
    const out = await compileSnesData(migrated, {
      projectRoot: RECOMPILE_PROJECT_ROOT,
      warnings: (m) => warnings.push(m),
    });
    expect(out.stats.sceneBlobs.length).toBe(8);
    expect(warnings).toEqual([]);
  });
});
