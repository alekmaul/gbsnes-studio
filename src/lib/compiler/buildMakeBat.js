import fs from "fs-extra";
import Path from "path";

export default async (
  buildRoot,
  { CART_TYPE, CART_SIZE, customColorsEnabled, gbcFastCPUEnabled, lccPath }
) => {
  const cmds = ['set __COMPAT_LAYER=WIN7RTM'];
  const buildFiles = [];
  const objFiles = [];
  let musicFiles = [];

  // An absolute path (from ensureBuildTools.js's real, current toolchain
  // cache location), not the hardcoded "..\_gbs\gbdk\bin\lcc" this used to
  // be - that string assumed the toolchain cache directory was always
  // named "_gbs", a sibling of buildRoot, but the "-v2"/"-v3" cache-busting
  // renames (see ensureBuildTools.js) changed the real directory name
  // without this hardcoded string ever being updated to match. Since no
  // automated test exercised a real `make.bat` run all the way through
  // before this was found, and manual testing kept getting stopped earlier
  // by the game.h/data_ptrs.c EPERM bugs, this was never actually reached
  // and discovered - fixing those bugs alone would still have left `lcc`
  // itself unfindable.
  const CC = `${lccPath} -Wa-l -Wl-m -Wl-j -Wl-yt${CART_TYPE} -Iinclude`;
  const CFLAGS = `-DUSE_SFR_FOR_REG -Wl-yo${CART_SIZE} -Wl-ya4`;
  const CGBFLAGS = `-Wl-yp0x143=0x80`;

  const srcRoot = `${buildRoot}/src`;
  const dataRoot = `${buildRoot}/src/data`;
  const musicRoot = `${buildRoot}/src/music`;
  const srcFiles = await fs.readdir(srcRoot);
  const dataFiles = await fs.readdir(dataRoot);
  try {
    musicFiles = await fs.readdir(musicRoot);
  } catch (e) {
    // No music folder
  }

  for (const file of srcFiles) {
    const fileStat = await fs.lstat(`${srcRoot}/${file}`);
    const ext = Path.extname(file);
    if (fileStat.isFile() && [".c", ".s"].indexOf(ext) > -1) {
      buildFiles.push(`src/${file}`);
    }
  }

  for (const file of dataFiles) {
    const fileStat = await fs.lstat(`${dataRoot}/${file}`);
    const ext = Path.extname(file);
    if (fileStat.isFile() && [".c", ".s"].indexOf(ext) > -1) {
      buildFiles.push(`src/data/${file}`);
    }
  }

  for (const file of musicFiles) {
    const fileStat = await fs.lstat(`${musicRoot}/${file}`);
    const ext = Path.extname(file);
    if (fileStat.isFile() && [".c", ".s"].indexOf(ext) > -1) {
      buildFiles.push(`src/music/${file}`);
    }
  }

  for (const file of buildFiles) {
    const objFile = `${file.replace(/^src/, "obj").replace(/\.[cs]$/, "")}.o`;
    cmds.push(`${CC} -c -o ${objFile} ${file}`);
    objFiles.push(objFile);
  }

  if (customColorsEnabled || gbcFastCPUEnabled) {
    cmds.push(`${CC} ${CFLAGS} ${CGBFLAGS} -o build/rom/game.gb ${objFiles.join(" ")}`);
  } else {
    cmds.push(`${CC} ${CFLAGS} -o build/rom/game.gb ${objFiles.join(" ")}`);
  }

  return cmds.join("\n");
};
