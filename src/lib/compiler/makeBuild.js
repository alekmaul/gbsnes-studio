import childProcess from "child_process";
import { remote } from "electron";
import fs from "fs-extra";
import { buildToolsRoot } from "../../consts";
import copy from "../helpers/fsCopy";
import buildMakeBat from "./buildMakeBat";
import { hexDec } from "../helpers/8bit";
import getTmp from "../helpers/getTmp";
import { isMBC1 } from "./helpers"

const HEADER_TITLE = 0x134;
const HEADER_CHECKSUM = 0x14d;
const GLOBAL_CHECKSUM = 0x14e;

const filterLogs = str => {
  return str.replace(/.*:\\.*>/g, "").replace(/.*:\\.*music/g, "");
};

const setROMTitle = async (filename, title) => {
  const romData = await fs.readFile(filename);
  for (let i = 0; i < 15; i++) {
    const charCode = title.charCodeAt(i) < 256 ? title.charCodeAt(i) || 0 : 0;
    romData[HEADER_TITLE + i] = charCode;
  }
  await fs.writeFile(filename, await patchROM(romData));
};

const convertHexTo15BitRGB = hex => {
  const r = Math.floor(hexDec(hex.substring(0, 2)) * (32 / 256));
  const g = Math.floor(hexDec(hex.substring(2, 4)) * (32 / 256));
  const b = Math.max(1, Math.floor(hexDec(hex.substring(4, 6)) * (32 / 256)));
  return `RGB(${r}, ${g}, ${b})`;
};

const patchROM = romData => {
  let checksum = 0;
  let headerChecksum = 0;
  const view = new DataView(romData.buffer);

  // Recalculate header checksum
  for (let i = HEADER_TITLE; i < HEADER_CHECKSUM; i++) {
    headerChecksum = headerChecksum - view.getUint8(i) - 1;
  }

  view.setUint8(HEADER_CHECKSUM, headerChecksum);

  // Recalculate cart checksum
  for (let i = 0; i < romData.length; i++) {
    if (i !== GLOBAL_CHECKSUM && i !== GLOBAL_CHECKSUM + 1) {
      checksum += view.getUint8(i);
    }
  }

  view.setUint16(GLOBAL_CHECKSUM, checksum, false);

  return romData;
};

let firstBuild = true;

const makeBuild = ({
  buildType = "rom",
  buildRoot = "/tmp",
  data = {},
  cartSize = 64,
  progress = () => {},
  warnings = () => {}
} = {}) => {
  // `new Promise(async (resolve, reject) => {...})` is a well-known trap: if
  // the async executor throws before calling resolve/reject, that rejection
  // has nowhere to go - the outer Promise just never settles. That's exactly
  // what happened here (user-found: a real Windows VM build sat frozen with
  // 0% CPU/disk forever, no error ever shown, right after this function's
  // first line of work). Wrapping the whole body in an IIFE and routing any
  // throw through `.catch(reject)` guarantees this Promise always settles
  // one way or the other.
  return new Promise((resolve, reject) => {
    (async () => {
    const env = Object.create(process.env);
    const { settings } = data;

    const buildToolsPath = `${buildToolsRoot}/${process.platform}-${
      process.arch
    }`;

    const tmpPath = getTmp();
    // "-v3": bumped twice now, same reasoning as resolvePvsHome() in
    // buildSnesRom.js (see its own long comment) - "-v2" invalidated caches
    // from the first bug (no chmod at all), this bump invalidates caches
    // from the second bug (source-mode preservation isn't trustworthy for a
    // path inside app.asar - see the explicit `mode: 0o755` below). The
    // symlink branch just below is effectively unreachable in practice
    // (fs.unlink() throws for both "doesn't exist yet" and "already a real
    // directory", landing in the copy() catch either time - see CLAUDE.md),
    // so once a bad extraction exists at a given path it's never refreshed -
    // confirmed twice now: user-found, "make: lcc: Permission non accordée"
    // persisted after each of the last two fixes.
    const tmpBuildToolsPath = `${tmpPath}/_gbs-v3`;

    // Symlink build tools so that path doesn't contain any spaces
    // GBDKDIR doesn't work if path has spaces :-(
    try {
      await fs.unlink(tmpBuildToolsPath);
      await fs.ensureSymlink(buildToolsPath, tmpBuildToolsPath);
    } catch (e) {
      // mode: 0o755, not left to fsCopy.js's own "preserve the source
      // file's mode" default - buildToolsPath is a path *inside* app.asar,
      // and this old asar format (0.11.0, matching this project's pinned
      // Electron 4) only stores a boolean "executable" flag per file, not
      // real POSIX permission bits; whether Electron's own asar-transparent
      // fs.lstat() reconstructs a mode reflecting that flag isn't something
      // to trust blindly - forcing every extracted file executable
      // sidesteps the question entirely (harmless on the non-binary files
      // in this tree - headers, examples, docs - matching the same
      // explicit override ensureBuildTools.js already uses).
      await copy(buildToolsPath, tmpBuildToolsPath, {
        overwrite: firstBuild,
        mode: 0o755
      });
    }
    
    firstBuild = false;

    env.PATH = [`${tmpBuildToolsPath}/gbdk/bin`, env.PATH].join(":");
    env.GBDKDIR = `${tmpBuildToolsPath}/gbdk/`;

    env.CART_TYPE = parseInt(settings.cartType || "1B", 16);
    env.CART_SIZE = cartSize;
    env.TMP = getTmp();
    env.TEMP = getTmp();
    
    // Modify game.h to overide color palette
    let gameHeader = await fs.readFile(`${buildRoot}/include/game.h`, "utf8");
    if (settings.customColorsEnabled) {
      gameHeader = gameHeader
        .replace(/RGB\(29, 31, 28\)/g, convertHexTo15BitRGB(settings.customColorsWhite))
        .replace(/RGB\(22, 30, 17\)/g, convertHexTo15BitRGB(settings.customColorsLight))
        .replace(/RGB\(10, 19, 15\)/g, convertHexTo15BitRGB(settings.customColorsDark))
        .replace(/RGB\(4, 5, 10\)/g, convertHexTo15BitRGB(settings.customColorsBlack));
    }
    if (!(settings.customColorsEnabled || settings.gbcFastCPUEnabled)) {
      gameHeader = gameHeader.replace(/#define CUSTOM_COLORS/g, '');
    }
    if (!settings.gbcFastCPUEnabled) {
      gameHeader = gameHeader.replace(/#define FAST_CPU/g, '');
    }
    if(isMBC1(settings.cartType)) {
      gameHeader = gameHeader.replace(/_MBC5/g, '_MBC1');
    }
    await fs.writeFile(`${buildRoot}/include/game.h`, gameHeader, "utf8");

    // Remove GBC Rombyte Offset from Makefile (OSX/Linux) if custom colors and fast CPU are not enabled
    if (process.platform !== "win32" && !settings.customColorsEnabled && !settings.gbcFastCPUEnabled)
    {
      let makeFile = await fs.readFile(`${buildRoot}/Makefile`, "utf8");
      makeFile = makeFile.replace("-Wl-yp0x143=0x80", "");
      await fs.writeFile(`${buildRoot}/Makefile`, makeFile, "utf8");
    }

    const makeBat = await buildMakeBat(buildRoot, {
      CART_TYPE: env.CART_TYPE,
      CART_SIZE: env.CART_SIZE,
      customColorsEnabled: settings.customColorsEnabled,
      gbcFastCPUEnabled: settings.gbcFastCPUEnabled
    });
    await fs.writeFile(`${buildRoot}/make.bat`, makeBat);

    const command = process.platform === "win32" ? "make.bat" : "make";
    const args = ["rom"];

    const options = {
      cwd: buildRoot,
      env,
      shell: true
    };

    const child = childProcess.spawn(command, args, options, {
      encoding: "utf8"
    });

    // 'error' means the child never spawned at all (e.g. make.bat couldn't
    // be launched) - 'close' will never fire in that case, so this MUST
    // reject too, not just warn, or the build hangs forever with no error
    // ever shown (see the comment above this Promise for the full story).
    child.on("error", err => {
      warnings(err.toString());
      reject(err);
    });

    child.stdout.on("data", childData => {
      const lines = childData.toString().split("\n");
      lines.forEach(line => {
        progress(filterLogs(line));
      });
    });

    child.stderr.on("data", childData => {
      const lines = childData.toString().split("\n");
      lines.forEach(line => {
        warnings(line);
      });
    });

    child.on("close", async code => {
      if (code === 0) {
        await setROMTitle(
          `${buildRoot}/build/rom/game.gb`,
          data.name.toUpperCase()
        );
        resolve();
      } else reject(code);
    });
    })().catch(reject);
  });
};

export default makeBuild;
