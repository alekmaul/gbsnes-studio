import fs from "fs-extra";
import os from "os";
import Path from "path";
import createProject from "../../../src/lib/project/createProject";
import loadProjectData from "../../../src/lib/project/loadProjectData";
import compileSnesData from "../../../src/lib/compiler/compileSnesData";
import loadAllEmoteData from "../../../src/lib/project/loadEmoteData";

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
describe.each(["sneshtml", "snesblank", "snesgbs2"])(
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

        // User-found: every template shipped only the legacy
        // assets/ui/emotes.png 8-wide grid, never assets/emotes/*.png (the
        // real Emote entities EmoteSelect.tsx's Actor: Emote Bubble picker
        // actually lists since M5) - so a brand-new project's Emote Bubble
        // event had an unusably empty dropdown right out of the box, on
        // every template. Fixed by slicing that grid into 8 named PNGs
        // (exclamation/question/heart/pause/confused/sweat/music/sleep)
        // per template.
        const emotes = await loadAllEmoteData(projectRoot);
        expect(emotes.length).toBe(8);

        if (templateId === "sneshtml" || templateId === "snesgbs2") {
          // The sample games: should compile cleanly, real scenes present.
          const warnings = [];
          const out = await compileSnesData(data, {
            projectRoot,
            warnings: (m) => warnings.push(m),
          });
          expect(out.stats.sceneBlobs.length).toBeGreaterThan(0);
        }

        if (templateId === "snesgbs2") {
          // gbs2 is the richer GB Studio 2.0 sample (all 5 genres, many more
          // events than sneshtml/gbhtml exercise) - a real SNES project
          // built from it, not just a scaffold that compiles. The template
          // ships its own snesRomBanks: 32 (the 8-bank/256KB default is too
          // small - see MIGRATION_V2_AUDIT.md section 26).
          expect(data.settings.snesRomBanks).toBe(32);
        }
      } finally {
        await fs.remove(tmpRoot);
      }
    }, 30000);
  }
);
