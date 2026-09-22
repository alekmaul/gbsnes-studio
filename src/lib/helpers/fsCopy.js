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
  // Preserve the source file's permissions (in particular the executable
  // bit) unless the caller explicitly overrides them. createWriteStream's
  // own `mode` option is applied through the process umask at file-creation
  // time, so it isn't guaranteed to land exactly - chmod explicitly after
  // writing to be sure. Without this, every file this helper copies (e.g. a
  // vendored toolchain extracted from app.asar - resolvePvsHome() in
  // buildSnesRom.js, or the GBDK toolchain in makeBuild.js) loses its
  // executable bit on Linux/macOS: Node's write-stream default mode (0o666)
  // has none, and spawning the copy then fails with EACCES (user-found on
  // Linux: "spawn .../smconv EACCES" building a SNES ROM's soundbank).
  const destMode = mode !== undefined ? mode : (await fs.lstat(src)).mode;
  await new Promise((resolve, reject) => {
    const inputStream = fs.createReadStream(src);
    const outputStream = fs.createWriteStream(dest, { mode: destMode });
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error(`Could not write file ${dest}`));
    };
    inputStream.once('error', () => {
      outputStream.close();
      fail();
    });
    outputStream.once('error', fail);
    // Wait for the *output* stream's 'close', not its 'finish' (which this
    // helper used to wait on) or the input stream's 'end' (an earlier,
    // already-fixed instance of the same class of bug - see git history).
    // 'finish' only means all data has been flushed to the write stream;
    // fs.WriteStream still closes the underlying OS file handle as a
    // separate async step afterwards, and 'close' is what actually signals
    // that has completed. On fast local storage that gap is microseconds
    // and invisible, but on a slow/virtualized disk it can be wide enough
    // that code re-touching this exact path moments later (e.g.
    // makeBuild.js reading+rewriting game.h right after this function
    // copies the whole engine tree) collides with a handle copyFile()
    // itself hadn't fully released yet - a real Windows EPERM, user-
    // confirmed reproducible on a Windows 8 VM with no antivirus involved,
    // so not an AV/indexer lock as earlier fixes here assumed.
    outputStream.once('close', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
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
