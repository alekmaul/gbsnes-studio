import Path from "path";
import os from "os";
import fs from "fs-extra";
import EventEmitter from "events";
import childProcess from "child_process";

jest.mock("child_process");
// getTmp.js (via ensureBuildTools.js, called before compileTrack() is ever
// reached) needs electron's remote.app.getPath("temp") - not available
// under plain Jest. Mock it to a real OS temp dir so execution actually
// gets as far as the spawn() call this test needs to exercise, instead of
// failing earlier for an unrelated reason.
jest.mock("electron", () => ({
  remote: { app: { getPath: () => require("os").tmpdir() } }
}));

// eslint-disable-next-line import/first
import compileMusic from "../../../src/lib/compiler/compileMusic";

const PROJECTS = Path.join(__dirname, "..", "..", "projects");

// Regression (GB target only): compileTrack()'s spawned mod2gbt process had
// `child.on("error", (err) => { warnings(err.toString()); })` with no
// reject() call. 'error' means the child never actually launched, so
// 'close' never fires either - the enclosing `new Promise(...)` (and the
// whole GB build awaiting it) hung forever with no error ever shown, the
// same bug shape found and fixed in makeBuild.js (see its own test/comment
// for the full story - a real Windows VM build froze mid-pipeline with 0%
// CPU/disk). Mocks only child_process.spawn (to deterministically trigger a
// real spawn failure) - everything else (asset resolution, the vendored
// mod2gbt toolchain extraction) runs for real.
describe("compileMusic - error handling", () => {
  test("a spawn error (mod2gbt failing to launch) rejects instead of hanging forever", async () => {
    const buildRoot = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-compilemusic-"));
    try {
      // Schedule the failure from inside the mock's own call, right after
      // spawn() returns - compileTrack() attaches child.on("error", ...)
      // synchronously in the same tick spawn() returns in, so by the time
      // this fires the listener is guaranteed to already be attached
      // (emitting 'error' with no listener attached throws instead, which
      // isn't what this test is about).
      childProcess.spawn.mockImplementation(() => {
        const fakeChild = new EventEmitter();
        fakeChild.stdout = new EventEmitter();
        fakeChild.stderr = new EventEmitter();
        setImmediate(() => fakeChild.emit("error", new Error("spawn ENOENT")));
        return fakeChild;
      });

      const promise = compileMusic({
        music: [{ id: "1", dataName: "music_track_0", filename: "template.mod" }],
        musicBanks: [0],
        buildRoot,
        projectRoot: Path.join(PROJECTS, "Test_SoundEffects"),
        progress: () => {},
        warnings: () => {}
      });

      await expect(promise).rejects.toThrow("spawn ENOENT");
    } finally {
      fs.removeSync(buildRoot);
    }
  }, 30000);
});
