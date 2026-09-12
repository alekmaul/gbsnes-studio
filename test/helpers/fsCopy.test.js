import Path from "path";
import os from "os";
import fs from "fs-extra";
import { pathExists } from "../../src/lib/helpers/fsCopy";

// Regression: a real packaged build of the app (v1.1.0) threw "PVSnesLib
// toolchain not found" even though the toolchain genuinely shipped inside
// app.asar. Root cause: fs-extra's pathExists()/fs.access() is NOT one of
// the fs functions Electron's asar support patches (stat/lstat/readdir/
// readFile/createReadStream are; access/accessSync famously aren't) - so
// pathExists() on anything inside app.asar always reports false, even
// though fs.existsSync()/fs.lstat() on the exact same path work fine.
// Confirmed empirically against a real packaged build's app.asar (see the
// buildSnesRom.js / compileSnesMusic.js call sites this fixed). This test
// only proves the plain-filesystem true/false logic, since jest runs under
// plain Node, not a packaged Electron asar - the asar-transparency itself
// is exactly what distinguishes pathExists() (broken) from the fs.lstat()
// this helper uses instead (confirmed working, same as copy() already
// relies on in this same file).
describe("fsCopy - pathExists", () => {
  test("true for a file that exists", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-pathexists-"));
    try {
      const file = Path.join(dir, "real.txt");
      fs.writeFileSync(file, "hi");
      expect(await pathExists(file)).toBe(true);
    } finally {
      fs.removeSync(dir);
    }
  });

  test("true for a directory that exists", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-pathexists-"));
    try {
      expect(await pathExists(dir)).toBe(true);
    } finally {
      fs.removeSync(dir);
    }
  });

  test("false for a path that doesn't exist", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-pathexists-"));
    try {
      expect(await pathExists(Path.join(dir, "nope.txt"))).toBe(false);
    } finally {
      fs.removeSync(dir);
    }
  });
});
