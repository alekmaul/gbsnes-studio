import fs from "fs-extra";
import os from "os";
import Path from "path";
import loadProjectData from "../../../src/lib/project/loadProjectData";

const FIXTURE_DIR = Path.join(__dirname, "..", "..", "projects", "Test_Math");

describe("loadProjectData - merging saved project data with a fresh asset scan", () => {
  const withProject = async (editProject, check) => {
    const tmpDir = await fs.mkdtemp(Path.join(os.tmpdir(), "gbs-loadproj-"));
    try {
      await fs.copy(FIXTURE_DIR, tmpDir);
      const projectPath = Path.join(tmpDir, "Test_Math.gbsproj");
      const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
      editProject(
        project.spriteSheets.find((s) => s.filename === "static.png")
      );
      await fs.writeFile(projectPath, JSON.stringify(project, null, 2));
      const loaded = await loadProjectData(projectPath);
      check(loaded.spriteSheets.find((s) => s.filename === "static.png"));
    } finally {
      await fs.remove(tmpDir);
    }
  };

  test("a sheet saved without states is converted from its image", async () => {
    await withProject(
      () => {},
      (sheet) => {
        expect(sheet.states.length).toBe(1);
        expect(sheet.states[0].animationType).toBe("fixed");
        expect(sheet.states[0].animations.length).toBe(8);
        expect(sheet.states[0].animations[0].frames[0].tiles).toMatchObject([
          { x: 0, y: 0, sliceX: 0, sliceY: 0, size: 16 },
        ]);
        expect(sheet.canvasWidth).toBe(16);
        expect(sheet.canvasHeight).toBe(16);
        expect(sheet.width).toBe(16);
      }
    );
  });

  test("edited sprite settings survive reopening the project", async () => {
    const states = [
      {
        id: "state1",
        name: "Jump",
        animationType: "fixed",
        flipLeft: false,
        animations: [{ id: "anim1", frames: [{ id: "frame1", tiles: [] }] }],
      },
    ];
    await withProject(
      (sheet) => {
        Object.assign(sheet, {
          states,
          canvasWidth: 24,
          canvasHeight: 40,
          boundsHeight: 8,
          width: 99,
        });
      },
      (sheet) => {
        expect(sheet.states).toEqual(states);
        expect(sheet.canvasWidth).toBe(24);
        expect(sheet.canvasHeight).toBe(40);
        expect(sheet.boundsHeight).toBe(8);
        // what the image itself says is refreshed
        expect(sheet.width).toBe(16);
      }
    );
  });

  test("settings of the previous sprite editor are replaced", async () => {
    await withProject(
      (sheet) => {
        Object.assign(sheet, {
          states: [{ id: "swap", name: "Jump", spriteSheetId: "other" }],
          metaspriteMode: true,
          metasprites: [{ id: "frame0", tiles: [] }],
          metaspriteTiles: {},
          canvasWidth: 24,
        });
      },
      (sheet) => {
        expect(sheet.states[0].animations.length).toBe(8);
        expect(sheet.metaspriteMode).toBeUndefined();
        expect(sheet.metasprites).toBeUndefined();
        expect(sheet.canvasWidth).toBe(16);
      }
    );
  });
});
