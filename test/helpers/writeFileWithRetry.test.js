import Path from "path";
import os from "os";
import fs from "fs-extra";
import writeFileWithRetry from "../../src/lib/helpers/fs/writeFileWithRetry";

// Regression: "EPERM: operation not permitted, open '...\\src\\assets.h'"
// building a SNES ROM on Windows (buildProject.js's buildProjectSnes calls
// fs.writeFile() on a path ejectBuild.js just wiped+recreated+copied into
// microseconds earlier - antivirus/Search Indexer can hold a transient lock
// on a just-touched file on Windows). writeFileWithRetry() should absorb a
// few transient EPERM/EBUSY/EACCES failures and still succeed, but must not
// mask a genuinely permanent failure (unknown error code, or exhausting all
// attempts).
describe("writeFileWithRetry", () => {
  test("writes the file on the first try when there's no error", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeretry-"));
    try {
      const file = Path.join(dir, "out.txt");
      await writeFileWithRetry(file, "hello");
      expect(fs.readFileSync(file, "utf8")).toBe("hello");
    } finally {
      fs.removeSync(dir);
    }
  });

  test("retries past a transient EPERM and eventually succeeds", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeretry-"));
    try {
      const file = Path.join(dir, "out.txt");
      const realWriteFile = fs.writeFile;
      let calls = 0;
      const spy = jest.spyOn(fs, "writeFile").mockImplementation((...args) => {
        calls += 1;
        if (calls < 3) {
          const err = new Error("EPERM: operation not permitted, open");
          err.code = "EPERM";
          return Promise.reject(err);
        }
        return realWriteFile(...args);
      });
      await writeFileWithRetry(file, "hello", undefined, 5, 1);
      expect(calls).toBe(3);
      expect(fs.readFileSync(file, "utf8")).toBe("hello");
      spy.mockRestore();
    } finally {
      fs.removeSync(dir);
    }
  });

  test("gives up and throws after exhausting all attempts", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeretry-"));
    try {
      const file = Path.join(dir, "out.txt");
      const spy = jest.spyOn(fs, "writeFile").mockImplementation(() => {
        const err = new Error("EPERM: operation not permitted, open");
        err.code = "EPERM";
        return Promise.reject(err);
      });
      await expect(
        writeFileWithRetry(file, "hello", undefined, 3, 1)
      ).rejects.toThrow("EPERM");
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
      spy.mockRestore();
    } finally {
      fs.removeSync(dir);
    }
  });

  test("does not retry a non-transient error", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-writeretry-"));
    try {
      const file = Path.join(dir, "out.txt");
      const spy = jest.spyOn(fs, "writeFile").mockImplementation(() => {
        const err = new Error("ENOSPC: no space left on device");
        err.code = "ENOSPC";
        return Promise.reject(err);
      });
      await expect(
        writeFileWithRetry(file, "hello", undefined, 5, 1)
      ).rejects.toThrow("ENOSPC");
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    } finally {
      fs.removeSync(dir);
    }
  });
});
