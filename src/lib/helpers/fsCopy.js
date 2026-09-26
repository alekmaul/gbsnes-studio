/* eslint-disable no-await-in-loop */
import fs from "fs-extra";

const copyDir = async (src, dest, options = {}) => {
  const filePaths = await fs.readdir(src);
  await fs.ensureDir(dest);
  for (const fileName of filePaths) {
    const fileStat = await fs.lstat(`${src}/${fileName}`);
    if (fileStat.isDirectory()) {
      await copyDir(`${src}/${fileName}`, `${dest}/${fileName}`, options);
    } else {
      await copyFile(`${src}/${fileName}`, `${dest}/${fileName}`, options);
    }
  }
};

const copyFile = async (src, dest, options = {}) => {
  const { overwrite = true, errorOnExist = false, mode } = options;
  if (!overwrite) {
    try {
      await fs.lstat(dest);
      if (errorOnExist) {
        throw new Error(`File already exists ${dest}`);
      } else {
        return;
      }
    } catch (e) {
      // Didn't exist so copy it
    }
  }
  await new Promise((resolve, reject) => {
    const inputStream = fs.createReadStream(src);
    const outputStream = fs.createWriteStream(dest, { mode });
    inputStream.once('error', (err) => {
      outputStream.close();
      reject(new Error(`Could not write file ${dest}`));
    });
    inputStream.once('end', () => { resolve(); });
    inputStream.pipe(outputStream);
  });
  // Preserve the source file's permissions (in particular the executable
  // bit) unless the caller explicitly overrides them - by default (no
  // explicit `mode`) on Linux/macOS a copied binary loses its executable bit
  // under Node's default write-stream mode (0o666), causing EACCES spawning
  // it later (e.g. resolvePvsHome()'s toolchain extraction in
  // buildSnesRom.js). Ported from the same fix on `main`, found there by a
  // real-machine bisection (v1.1.4 works reliably on Windows; every later
  // version that added this chmod call and/or resolved the copy's
  // completion on the output stream's 'finish' instead of the input
  // stream's 'end' failed with a Windows EPERM reopening the exact file
  // this helper had just written, on a real packaged build) - scoped to
  // non-Windows only, where it's both needed and safe.
  if (process.platform !== "win32") {
    const destMode = mode !== undefined ? mode : (await fs.lstat(src)).mode;
    try {
      await fs.chmod(dest, destMode);
    } catch (e) {
      // Resolving on the *input* stream's 'end' only means reading
      // finished - the output stream can still be flushing to disk a
      // moment later, so on a fast copy of many small files this chmod can
      // race ahead of the destination actually existing yet (real CI
      // failure on `main`, Linux: "ENOENT ... chmod '.../cursor.gbr'", a
      // GB toolchain example asset, not a binary - losing its executable
      // bit here is harmless). Swallow only that specific race rather than
      // crash the whole copy; anything else still surfaces normally.
      if (e.code !== "ENOENT") {
        throw e;
      }
    }
  }
};

const copy = async (src, dest, options) => {
  const fileStat = await fs.lstat(src);
  if (fileStat.isDirectory()) {
    await copyDir(src, dest, options);
  } else {
    await copyFile(src, dest, options);
  }
};

// fs-extra's own pathExists()/fs.access() is NOT asar-aware - Electron's asar
// support patches stat/lstat/readdir/readFile/createReadStream (what copy()
// above already relies on, which is why it works from inside a packaged
// app.asar), but explicitly NOT access/accessSync. A path that genuinely
// exists inside app.asar therefore makes pathExists() always report false,
// even though fs.existsSync()/fs.lstat() on the exact same path succeed.
// Confirmed with a real packaged build on v1: resolvePvsHome() (buildSnesRom.js)
// used fs.pathExists() to find the vendored PVSnesLib toolchain and always
// failed with "toolchain not found" although the files were really there.
// Re-added here ahead of the SNES compiler port (M7/M8) so that work can
// reuse this asar-safe helper from the start instead of rediscovering the bug.
export const pathExists = async path => {
  try {
    await fs.lstat(path);
    return true;
  } catch (e) {
    return false;
  }
};

export default copy;
