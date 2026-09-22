import Path from "path";
import fs from "fs-extra";

jest.mock("electron", () => ({
  remote: { app: { getPath: () => require("os").tmpdir() } }
}));

// eslint-disable-next-line import/first
import ensureBuildTools from "../../../src/lib/compiler/ensureBuildTools";
// eslint-disable-next-line import/first
import { buildToolsRoot } from "../../../src/consts";

// Regression: this function previously called `fs.fstat(tmpBuildToolsPath)`
// (fstat takes a file descriptor, not a path) which always threw, so it
// silently re-copied the whole toolchain on *every* call, not just the
// first - real wasted work, and (combined with makeBuild.js's own separate,
// unguarded copy of the exact same destination) a real source of the
// Windows EPERM class upstream GB Studio fixed in v4.2.1. Also verifies
// concurrent calls dedupe to a single extraction (dedupeByKey.js).
const vendored = `${buildToolsRoot}/${process.platform}-${process.arch}`;
const maybe = fs.existsSync(vendored) ? describe : describe.skip;

maybe("ensureBuildTools", () => {
  test("returns the same real, populated path across repeated and concurrent calls", async () => {
    const [a, b, c] = await Promise.all([
      ensureBuildTools(),
      ensureBuildTools(),
      ensureBuildTools()
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(fs.existsSync(Path.join(a, ".extracted-ok"))).toBe(true);
    expect(fs.existsSync(Path.join(a, "gbdk"))).toBe(true);

    // A later, non-concurrent call reuses the cache (doesn't re-copy).
    const spy = jest.spyOn(fs, "remove");
    const d = await ensureBuildTools();
    expect(d).toBe(a);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }, 180000);
});
