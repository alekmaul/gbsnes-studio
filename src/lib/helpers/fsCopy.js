/* eslint-disable no-await-in-loop */
import fs from "fs-extra";

// `relPath` accumulates the path so far, relative to the original copy()
// root - lets `options.exclude` (a list of root-relative paths, files or
// whole directories) skip an entry without ever descending into it.
const copyDir = async (src, dest, options = {}, relPath = "") => {
  const { exclude = [] } = options;
  const filePaths = await fs.readdir(src);
  await fs.ensureDir(dest);
  for (const fileName of filePaths) {
    const entryRelPath = relPath ? `${relPath}/${fileName}` : fileName;
    if (exclude.includes(entryRelPath)) {
      continue;
    }
    const fileStat = await fs.lstat(`${src}/${fileName}`);
    if (fileStat.isDirectory()) {
      await copyDir(`${src}/${fileName}`, `${dest}/${fileName}`, options, entryRelPath);
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
  // buildSnesRom.js). Windows-only real build tests (this Windows EPERM
  // saga's real conclusion) showed every attempt to touch this function
  // beyond its original v1.1.4 shape - including this chmod - correlated
  // with new Windows EPERM failures that were never fully root-caused, so
  // it's scoped to non-Windows only, where it's both needed and safe.
  if (process.platform !== "win32") {
    const destMode = mode !== undefined ? mode : (await fs.lstat(src)).mode;
    await fs.chmod(dest, destMode);
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
// Confirmed with a real packaged build: resolvePvsHome() (buildSnesRom.js)
// used fs.pathExists() to find the vendored PVSnesLib toolchain and always
// failed with "toolchain not found" although the files were really there.
export const pathExists = async path => {
  try {
    await fs.lstat(path);
    return true;
  } catch (e) {
    return false;
  }
};

export default copy;
