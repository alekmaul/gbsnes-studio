import childProcess from "child_process";
import { remote } from "electron";
import fs from "fs-extra";
import Path from "path";
import buildMakeBat from "./buildMakeBat";
import { hexDec } from "../helpers/8bit";
import getTmp from "../helpers/getTmp";
import { isMBC1 } from "./helpers"
import writeFileAtomic from "../helpers/fs/writeFileAtomic";
import ensureBuildTools from "./ensureBuildTools";

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
  // Same shape as game.h/data_ptrs.c (see makeBuild.js's own comment on
  // game.h): game.gb was just written moments earlier, this time by the
  // make.bat subprocess exiting rather than ejectBuild's copy - re-opening
  // it for writing again right away is the same class of risk.
  await writeFileAtomic(filename, await patchROM(romData));
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

    // Used to extract its own separate (redundant) copy of the exact same
    // shared toolchain cache ensureBuildTools.js already manages for
    // compileMusic.js's mod2gbt - two independent, unguarded extractions of
    // the same destination directory in the same build, neither checking
    // whether the other had already finished. Upstream GB Studio hit and
    // fixed this exact class of bug in v4.2.1 ("Fix for issue where Windows
    // would attempt to remove tmp _gbsbuild while still keeping file
    // handles open") by consolidating to one guarded extraction path -
    // ensureBuildTools.js now has the same in-flight-dedup guard (see
    // dedupeByKey.js), so this just calls it instead of duplicating the
    // extraction logic. Also drops the "symlink to dodge spaces in the
    // path" dance entirely - getTmp() already guarantees its own return
    // value has no spaces, so the destination here never had any to dodge.
    const tmpBuildToolsPath = await ensureBuildTools();

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
    // game.h is a real committed file ejectBuild's copy just wrote moments
    // earlier, edited in place (not a throwaway placeholder that can just be
    // excluded from the copy, unlike the SNES committed dummy assets - see
    // ejectBuild.js's own comment on that fix) - so a plain fs.writeFile()
    // overwriting that same just-copied path can hit the identical Windows
    // EPERM class of bug (user-found: "EPERM ... open '...\\include\\game.h'",
    // on the same real VM that had already confirmed the SNES-side fixes).
    // writeFileAtomic (write to a fresh temp path, then rename over the
    // destination) sidesteps it the same way it does for SNES's assets.h/c.
    await writeFileAtomic(`${buildRoot}/include/game.h`, gameHeader, "utf8");

    // Remove GBC Rombyte Offset from Makefile (OSX/Linux) if custom colors and fast CPU are not enabled
    if (process.platform !== "win32" && !settings.customColorsEnabled && !settings.gbcFastCPUEnabled)
    {
      let makeFile = await fs.readFile(`${buildRoot}/Makefile`, "utf8");
      makeFile = makeFile.replace("-Wl-yp0x143=0x80", "");
      await writeFileAtomic(`${buildRoot}/Makefile`, makeFile, "utf8");
    }

    const makeBat = await buildMakeBat(buildRoot, {
      CART_TYPE: env.CART_TYPE,
      CART_SIZE: env.CART_SIZE,
      customColorsEnabled: settings.customColorsEnabled,
      gbcFastCPUEnabled: settings.gbcFastCPUEnabled,
      lccPath: Path.join(tmpBuildToolsPath, "gbdk", "bin", "lcc")
    });
    const makeBatPath = Path.join(buildRoot, "make.bat");
    await fs.writeFile(makeBatPath, makeBat);

    // An absolute path, not a bare "make.bat" - Windows only searches cwd
    // for an unqualified command name when NoDefaultCurrentDirectoryInExePath
    // isn't set (a documented Microsoft security-hardening setting, real and
    // confirmed set on a real test machine here: "'make.bat' n'est pas
    // reconnu..." even though it's genuinely sitting in cwd right after
    // being written). buildSnesRom.js's own tool invocations already always
    // use absolute paths for exactly this reason and never had this problem
    // - matches that same, already-proven pattern.
    const command = process.platform === "win32" ? makeBatPath : "make";
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
