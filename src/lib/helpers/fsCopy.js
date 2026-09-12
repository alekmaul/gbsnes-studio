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
