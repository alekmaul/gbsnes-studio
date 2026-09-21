import Path from "path";
import os from "os";
import fs from "fs-extra";
import copy, { pathExists } from "../../src/lib/helpers/fsCopy";

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

// exclude: lets a caller skip copying specific root-relative paths (files
// or whole directories) - added so ejectBuild.js can skip the SNES engine
// core's committed dummy src/assets.{c,h}/src/data/*, which
// buildProjectSnes() always immediately overwrites anyway (see
// ejectBuild.js's own comment for why re-touching a path copy() just wrote
// caused a Windows EPERM no retry budget could reliably clear).
describe("fsCopy - exclude option", () => {
  test("skips an excluded file", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-copyexclude-"));
    try {
      const src = Path.join(dir, "src");
      const dest = Path.join(dir, "dest");
      fs.ensureDirSync(src);
      fs.writeFileSync(Path.join(src, "keep.txt"), "keep");
      fs.writeFileSync(Path.join(src, "skip.txt"), "skip");

      await copy(src, dest, { exclude: ["skip.txt"] });

      expect(fs.existsSync(Path.join(dest, "keep.txt"))).toBe(true);
      expect(fs.existsSync(Path.join(dest, "skip.txt"))).toBe(false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test("skips an excluded directory without descending into it", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-copyexclude-dir-"));
    try {
      const src = Path.join(dir, "src");
      const dest = Path.join(dir, "dest");
      fs.ensureDirSync(Path.join(src, "data"));
      fs.writeFileSync(Path.join(src, "data", "dummy.as"), "dummy");
      fs.writeFileSync(Path.join(src, "keep.txt"), "keep");

      await copy(src, dest, { exclude: ["data"] });

      expect(fs.existsSync(Path.join(dest, "keep.txt"))).toBe(true);
      expect(fs.existsSync(Path.join(dest, "data"))).toBe(false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test("only matches the exact root-relative path, not same-named files deeper in the tree", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-copyexclude-nested-"));
    try {
      const src = Path.join(dir, "src");
      const dest = Path.join(dir, "dest");
      fs.ensureDirSync(Path.join(src, "nested"));
      fs.writeFileSync(Path.join(src, "assets.h"), "root");
      fs.writeFileSync(Path.join(src, "nested", "assets.h"), "nested");

      await copy(src, dest, { exclude: ["assets.h"] });

      expect(fs.existsSync(Path.join(dest, "assets.h"))).toBe(false);
      expect(fs.existsSync(Path.join(dest, "nested", "assets.h"))).toBe(true);
    } finally {
      fs.removeSync(dir);
    }
  });
});

// Regression: a real packaged Linux build's "Build ROM" failed with
// "spawn .../smconv EACCES" - copyFile() wrote the destination with Node's
// default stream mode (0o666, no executable bit) regardless of the source
// file's own permissions, so every file this helper copies (a vendored
// toolchain extracted from app.asar on Linux/macOS, in particular) lost its
// executable bit and could no longer be spawned. Only meaningful on a
// platform with real POSIX permission bits (skipped on Windows, where
// there's no executable-bit concept at the filesystem level to preserve).
const maybeOnPosix = process.platform === "win32" ? describe.skip : describe;

maybeOnPosix("fsCopy - copy preserves executable permissions", () => {
  test("a copied file keeps the source file's mode (incl. the executable bit)", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-copyperm-"));
    try {
      const src = Path.join(dir, "tool");
      const dest = Path.join(dir, "tool-copy");
      fs.writeFileSync(src, "#!/bin/sh\necho hi\n");
      fs.chmodSync(src, 0o755);

      await copy(src, dest);

      const srcMode = fs.lstatSync(src).mode & 0o777;
      const destMode = fs.lstatSync(dest).mode & 0o777;
      expect(destMode).toBe(srcMode);
      expect(destMode & 0o100).toBe(0o100); // owner-executable
    } finally {
      fs.removeSync(dir);
    }
  });

  test("a copied directory tree keeps each file's executable bit", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-copyperm-dir-"));
    try {
      const srcDir = Path.join(dir, "src");
      const destDir = Path.join(dir, "dest");
      fs.ensureDirSync(Path.join(srcDir, "bin"));
      const toolPath = Path.join(srcDir, "bin", "tool");
      fs.writeFileSync(toolPath, "#!/bin/sh\necho hi\n");
      fs.chmodSync(toolPath, 0o755);
      const dataPath = Path.join(srcDir, "data.txt");
      fs.writeFileSync(dataPath, "hi");
      fs.chmodSync(dataPath, 0o644);

      await copy(srcDir, destDir);

      expect(fs.lstatSync(Path.join(destDir, "bin", "tool")).mode & 0o777).toBe(0o755);
      expect(fs.lstatSync(Path.join(destDir, "data.txt")).mode & 0o777).toBe(0o644);
    } finally {
      fs.removeSync(dir);
    }
  });

  // Regression: forcing mode: 0o755 (buildSnesRom.js resolvePvsHome() /
  // makeBuild.js, both extracting a toolchain packed inside app.asar) still
  // produced EACCES on a real packaged Linux build even after the fix
  // above - because the *source* file's own reported mode (asar's own
  // stat/lstat reporting for a file inside the archive, on this project's
  // old pinned asar/Electron 4) isn't something this helper - or anything
  // else - should trust for a file living inside app.asar. An explicit
  // `mode` option must win outright, not just supply a fallback default.
  test("an explicit mode option overrides the source file's own mode, not just a fallback default", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-copyperm-override-"));
    try {
      const src = Path.join(dir, "not-executable-at-the-source");
      const dest = Path.join(dir, "must-be-executable-at-the-dest");
      fs.writeFileSync(src, "#!/bin/sh\necho hi\n");
      fs.chmodSync(src, 0o644); // deliberately NOT executable at the source

      await copy(src, dest, { mode: 0o755 });

      expect(fs.lstatSync(dest).mode & 0o777).toBe(0o755);
    } finally {
      fs.removeSync(dir);
    }
  });
});
