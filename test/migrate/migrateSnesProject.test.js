import fs from "fs-extra";
import Path from "path";
import migrateProject from "../../src/lib/project/migrateProject";
import compileSnesData from "../../src/lib/compiler/compileSnesData";

/*
 * M10 - roadmap step 3: "a real v1.1.4 SNES .gbsproj, committed, migrated
 * and recompiled in the new suite". appData/templates/sneshtml already IS
 * exactly that fixture - the SNES sample project, still at its original
 * v1.1.4-era "1.2.0"/no _release shape (never run through migrateProject,
 * since createProject.js copies templates raw and only loadProjectData.js
 * migrates, on open) - so it's used directly rather than committing a
 * second copy of the same data.
 */
const FIXTURE_DIR = Path.join(
  __dirname,
  "..",
  "..",
  "appData",
  "templates",
  "sneshtml"
);

const loadFixture = () =>
  JSON.parse(
    fs.readFileSync(Path.join(FIXTURE_DIR, "project.gbsproj"), "utf8")
  );

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
    const out = await compileSnesData(migrated, {
      projectRoot: FIXTURE_DIR,
      warnings: (m) => warnings.push(m),
    });
    expect(out.stats.sceneBlobs.length).toBe(8);
    expect(warnings).toEqual([]);
  });
});
