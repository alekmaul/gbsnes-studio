import Path from "path";
import os from "os";
import fs from "fs-extra";
import ejectBuild from "../../../src/lib/compiler/ejectBuild";

// Regression: buildProjectSnes() always immediately overwrites
// src/assets.{c,h} and every src/data/* file with real compiled content
// right after ejectBuild() returns - so copying the SNES engine core's
// committed dummy versions of those paths was pure throwaway work, and on
// Windows it also created a real, eventually-unfixable-by-retry EPERM (a
// path something else *just* wrote getting re-touched moments later - see
// writeFileAtomic.js). ejectBuild() now excludes those specific paths from
// the SNES engine-core copy instead.
describe("ejectBuild", () => {
  test("SNES: does not copy the dummy src/assets.{c,h} or src/data/* (always overwritten by buildProjectSnes)", async () => {
    const outputRoot = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-ejectbuild-snes-"));
    try {
      await ejectBuild({
        projectType: "snes",
        outputRoot,
        compiledData: { files: {} }
      });
      expect(fs.existsSync(Path.join(outputRoot, "src", "assets.h"))).toBe(false);
      expect(fs.existsSync(Path.join(outputRoot, "src", "assets.c"))).toBe(false);
      // The directory itself still exists (ensureDir'd), ready for
      // buildProjectSnes's own writes - just none of its dummy content.
      expect(fs.existsSync(Path.join(outputRoot, "src", "data"))).toBe(true);
      expect(fs.readdirSync(Path.join(outputRoot, "src", "data"))).toEqual([]);
      // The rest of the engine core still copies through normally.
      expect(fs.existsSync(Path.join(outputRoot, "src", "camera.h"))).toBe(true);
    } finally {
      fs.removeSync(outputRoot);
    }
  });

  test("GB: engine core copies through unaffected (no exclude applies)", async () => {
    const outputRoot = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-ejectbuild-gb-"));
    try {
      await ejectBuild({
        projectType: "gb",
        outputRoot,
        compiledData: { files: {} }
      });
      expect(fs.existsSync(Path.join(outputRoot, "include", "GameTypes.h"))).toBe(true);
    } finally {
      fs.removeSync(outputRoot);
    }
  });
});
