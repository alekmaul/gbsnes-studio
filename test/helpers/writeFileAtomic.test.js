import Path from "path";
import os from "os";
import fs from "fs-extra";
import writeFileAtomic from "../../src/lib/helpers/fs/writeFileAtomic";

// Regression: v1.1.6 and v1.1.7 both retried a plain fs.writeFile() on the
// exact path ejectBuild.js's copy() had just written (assets.h etc.) -
// even v1.1.7's ~20s exponential backoff still reproduced the identical
// "EPERM: operation not permitted, open '...\\src\\assets.h'" on a real
// packaged Windows build (user-confirmed, same file/error, after the
// longer retry budget shipped) - repeatedly re-opening the exact same
// just-written path for writing never clears. writeFileAtomic() sidesteps
// this by writing to a brand-new temp path and renaming it over the
// destination instead of re-opening the destination directly.
describe("writeFileAtomic", () => {
  test("writes the destination file with the given content", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeatomic-"));
    try {
      const file = Path.join(dir, "out.txt");
      await writeFileAtomic(file, "hello");
      expect(fs.readFileSync(file, "utf8")).toBe("hello");
    } finally {
      fs.removeSync(dir);
    }
  });

  test("overwrites an existing destination file", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeatomic-"));
    try {
      const file = Path.join(dir, "out.txt");
      fs.writeFileSync(file, "old content, e.g. the engine's committed dummy assets.h");
      await writeFileAtomic(file, "new content");
      expect(fs.readFileSync(file, "utf8")).toBe("new content");
    } finally {
      fs.removeSync(dir);
    }
  });

  test("does not leave a stray temp file behind next to the destination", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeatomic-"));
    try {
      const file = Path.join(dir, "out.txt");
      await writeFileAtomic(file, "hello");
      expect(fs.readdirSync(dir)).toEqual(["out.txt"]);
    } finally {
      fs.removeSync(dir);
    }
  });

  test("never re-opens the destination path itself for writing - only the fresh temp path", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeatomic-"));
    try {
      const file = Path.join(dir, "assets.h");
      fs.writeFileSync(file, "dummy committed template content");
      const realWriteFile = fs.writeFile;
      const writeFileCalls = [];
      const spy = jest.spyOn(fs, "writeFile").mockImplementation((...args) => {
        writeFileCalls.push(args[0]);
        return realWriteFile(...args);
      });
      await writeFileAtomic(file, "real compiled content");
      expect(writeFileCalls).toHaveLength(1);
      expect(writeFileCalls[0]).not.toBe(file);
      expect(fs.readFileSync(file, "utf8")).toBe("real compiled content");
      spy.mockRestore();
    } finally {
      fs.removeSync(dir);
    }
  });

  test("retries a transient EPERM on the rename step and still succeeds", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeatomic-"));
    try {
      const file = Path.join(dir, "assets.h");
      const realRename = fs.rename;
      let calls = 0;
      const spy = jest.spyOn(fs, "rename").mockImplementation((...args) => {
        calls += 1;
        if (calls < 2) {
          const err = new Error("EPERM: operation not permitted, rename");
          err.code = "EPERM";
          return Promise.reject(err);
        }
        return realRename(...args);
      });
      await writeFileAtomic(file, "hello", undefined, { baseDelayMs: 1 });
      expect(calls).toBe(2);
      expect(fs.readFileSync(file, "utf8")).toBe("hello");
      spy.mockRestore();
    } finally {
      fs.removeSync(dir);
    }
  });

  test("cleans up the temp file if the rename ultimately fails", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeatomic-"));
    try {
      const file = Path.join(dir, "assets.h");
      const spy = jest.spyOn(fs, "rename").mockImplementation(() => {
        const err = new Error("EPERM: operation not permitted, rename");
        err.code = "EPERM";
        return Promise.reject(err);
      });
      await expect(
        writeFileAtomic(file, "hello", undefined, { attempts: 3, baseDelayMs: 1 })
      ).rejects.toThrow("EPERM");
      const remaining = fs.readdirSync(dir);
      expect(remaining).toEqual([]);
      spy.mockRestore();
    } finally {
      fs.removeSync(dir);
    }
  });
});
