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
  // Preserve the source file's permissions (in particular the executable
  // bit) unless the caller explicitly overrides them. createWriteStream's
  // own `mode` option is applied through the process umask at file-creation
  // time, so it isn't guaranteed to land exactly - chmod explicitly after
  // writing to be sure. Without this, every file this helper copies (e.g. a
  // vendored toolchain extracted from app.asar - resolvePvsHome() in
  // buildSnesRom.js, or the GBDK toolchain in makeBuild.js) loses its
  // executable bit on Linux/macOS: Node's write-stream default mode (0o666)
  // has none, and spawning the copy then fails with EACCES (ported from the
  // same fix on `main`, user-found there: "spawn .../smconv EACCES" building
  // a SNES ROM's soundbank on a packaged Linux build).
  const destMode = mode !== undefined ? mode : (await fs.lstat(src)).mode;
  await new Promise((resolve, reject) => {
    const inputStream = fs.createReadStream(src);
    const outputStream = fs.createWriteStream(dest, { mode: destMode });
    inputStream.once('error', (err) => {
      outputStream.close();
      reject(new Error(`Could not write file ${dest}`));
    });
    outputStream.once('error', (err) => {
      reject(new Error(`Could not write file ${dest}`));
    });
    // Wait for the *output* stream to actually finish (all data flushed,
    // file descriptor ready), not the input stream's 'end' - that fires as
    // soon as reading is done, which can race ahead of the write still in
    // flight, so a chmod() right after could hit a file that doesn't fully
    // exist yet (a real ENOENT hit verifying this fix on `main`).
    outputStream.once('finish', () => { resolve(); });
    inputStream.pipe(outputStream);
  });
  await fs.chmod(dest, destMode);
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
