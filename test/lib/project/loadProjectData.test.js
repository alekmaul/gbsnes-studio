import fs from "fs-extra";
import os from "os";
import Path from "path";
import loadProjectData from "../../../src/lib/project/loadProjectData";

const FIXTURE_DIR = Path.join(__dirname, "..", "..", "projects", "Test_Math");

describe("loadProjectData - merging saved project data with a fresh asset scan", () => {
  // User-found (M9.4 follow-up): a Free-form (Metasprite) sprite sheet's
  // metaspriteMode/canvasWidth/canvasHeight/metasprites/metaspriteTiles
  // fields - none of them re-derivable from the PNG file itself - were
  // silently discarded every time a project was reopened. Root cause: the
  // merge here spread the FRESH file-scan object first and only picked
  // `id` off the SAVED project.json object, the opposite of the correct
  // direction (confirmed by `entitiesState.ts`'s own in-session asset-
  // rescan reducers, which already do `{...existingAsset, ...payload.data,
  // id: existingId}}` correctly). Same bug shape fixed in the same pass for
  // backgrounds/music/fonts/emotes (the sibling blocks right above/below
  // this one in the source, same copy-pasted shape) - not separately
  // tested here, since none of those entity types currently have a real
  // editor-authored field that isn't already re-derived from the asset
  // file on every scan (confirmed directly: Background.name is always
  // `file.replace(/.png/i, "")`, never user-renamable independent of the
  // filename) - sprites are the one entity type with a real field to prove
  // this against today.
  test("a sprite sheet's editor-authored Free-form fields survive reopening the project", async () => {
    const tmpDir = await fs.mkdtemp(Path.join(os.tmpdir(), "gbs-loadproj-"));
    try {
      await fs.copy(FIXTURE_DIR, tmpDir);
      const projectPath = Path.join(tmpDir, "Test_Math.gbsproj");
      const project = JSON.parse(await fs.readFile(projectPath, "utf8"));

      const spriteSheet = project.spriteSheets.find(
        (s) => s.filename === "static.png"
      );
      expect(spriteSheet).toBeTruthy();
      spriteSheet.metaspriteMode = true;
      spriteSheet.animationType = "fixed";
      spriteSheet.canvasWidth = 16;
      spriteSheet.canvasHeight = 32;
      spriteSheet.metasprites = [{ id: "frame0", tiles: ["top", "bottom"] }];
      spriteSheet.metaspriteTiles = {
        top: { id: "top", x: 0, y: 0, sliceX: 0, sliceY: 0 },
        bottom: { id: "bottom", x: 0, y: 16, sliceX: 0, sliceY: 0 },
      };
      await fs.writeFile(projectPath, JSON.stringify(project, null, 2));

      const loaded = await loadProjectData(projectPath);
      const loadedSheet = loaded.spriteSheets.find(
        (s) => s.filename === "static.png"
      );

      expect(loadedSheet.id).toBe(spriteSheet.id); // id still carried over correctly
      expect(loadedSheet.metaspriteMode).toBe(true);
      expect(loadedSheet.animationType).toBe("fixed");
      expect(loadedSheet.canvasWidth).toBe(16);
      expect(loadedSheet.canvasHeight).toBe(32);
      expect(loadedSheet.metasprites).toEqual(spriteSheet.metasprites);
      expect(loadedSheet.metaspriteTiles).toEqual(spriteSheet.metaspriteTiles);
      // the fresh file-system scan's own fields (type, numFrames re-derived
      // from the real static.png - 16x16, 1 frame) still correctly refresh,
      // not frozen at whatever the saved json happened to say.
      expect(loadedSheet.numFrames).toBe(1);
      expect(typeof loadedSheet.inode).toBe("string");
    } finally {
      await fs.remove(tmpDir);
    }
  });
});
