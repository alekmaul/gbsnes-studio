import fs from "fs-extra";
import os from "os";
import path from "path";

// getTmp() (used internally by ensureBuildTools.js/makeBuild.js, independent
// of the tmpPath option) reads electron-settings' "tmpDir" - mock it to fall
// back to the real os.tmpdir() so this test doesn't need Electron running.
jest.mock("electron-settings", () => ({
  get: () => undefined,
  set: () => {},
}));

import createProject from "../../../src/lib/project/createProject";
import loadProjectData from "../../../src/lib/project/loadProjectData";
import buildProject from "../../../src/lib/compiler/buildProject";

jest.setTimeout(180000);

test("gbs2 sample project builds end-to-end to a bootable GB ROM", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gbs-buildtest-"));
  const projectDataPath = await createProject({
    name: "BuildTest",
    path: tmpRoot,
    target: "gbs2",
  });
  const projectRoot = path.dirname(projectDataPath);
  const data = await loadProjectData(projectDataPath);

  const engineJson = await fs.readJson(
    path.join(__dirname, "..", "..", "..", "appData", "src", "gb", "engine.json")
  );
  const engineFields = engineJson.fields || [];

  // makeBuild.js/ensureBuildTools.js call the real getTmp() internally to
  // place a "_gbstools" toolchain cache dir, and the generated make.bat
  // references it as "../_gbstools" relative to buildRoot - so buildRoot
  // (outputRoot/build) must live exactly one level under the same
  // os.tmpdir() getTmp() resolves to (mocked above to have no override).
  const outputRoot = path.join(os.tmpdir(), "_gbsbuild_test");
  await fs.remove(outputRoot);

  await buildProject(data, {
    projectRoot,
    tmpPath: os.tmpdir(),
    outputRoot,
    buildType: "rom",
    engineFields,
  });

  const romPath = path.join(outputRoot, "build", "rom", "game.gb");
  expect(await fs.pathExists(romPath)).toBe(true);

  const rom = await fs.readFile(romPath);
  // GB cartridge header: Nintendo logo bytes at 0x0104-0x0133, bank size is
  // always a power of 2 x 16KB.
  expect(rom.length % (16 * 1024)).toBe(0);
  expect(rom[0x104]).toBe(0xce);
  expect(rom[0x133]).toBe(0x3e);
});
