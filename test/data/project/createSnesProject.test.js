import fs from "fs-extra";
import os from "os";
import Path from "path";
import createProject from "../../../src/lib/project/createProject";
import loadProjectData from "../../../src/lib/project/loadProjectData";
import compileSnesData from "../../../src/lib/compiler/compileSnesData";

/*
 * M11 follow-up (user-found): the Splash "New Project" screen's template
 * list (Splash.tsx) never included the SNES templates - only
 * gbs2/gbhtml/blank were listed, even though appData/templates/
 * {sneshtml,snesblank} have existed on this branch since before M2 (just
 * never wired into the picker). A user could not create an SNES project
 * from the app's own UI at all. Fixed by adding two entries to Splash.tsx's
 * `templates` array; this test covers the createProject()->loadProjectData()
 * ->compileSnesData() path those entries now drive, the same path
 * createProject.test.js-equivalent GB coverage would use if it existed.
 */
describe.each(["sneshtml", "snesblank"])(
  "createProject - %s (SNES) template",
  (templateId) => {
    test("scaffolds, loads/migrates, and is a real SNES project", async () => {
      const tmpRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), `gbs-createsnes-${templateId}-`)
      );
      try {
        const projectDataPath = await createProject({
          name: `Test${templateId}`,
          path: tmpRoot,
          target: templateId,
        });
        const projectRoot = Path.dirname(projectDataPath);
        const data = await loadProjectData(projectDataPath);

        expect(data.settings.target).toBe("snes");
        expect(data._version).toBe("2.0.0");

        if (templateId === "sneshtml") {
          // The sample game: should compile cleanly, real scenes present.
          const warnings = [];
          const out = await compileSnesData(data, {
            projectRoot,
            warnings: (m) => warnings.push(m),
          });
          expect(out.stats.sceneBlobs.length).toBeGreaterThan(0);
        }
      } finally {
        await fs.remove(tmpRoot);
      }
    }, 30000);
  }
);
