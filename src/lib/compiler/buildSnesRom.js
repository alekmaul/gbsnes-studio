import childProcess from "child_process";
import fs from "fs-extra";
import os from "os";
import Path from "path";
import { buildToolsRoot } from "../../consts";
import copy, { pathExists } from "../helpers/fsCopy";

/*
 * SNES build orchestration (PVSnesLib).
 *
 * The Game Boy target shells out to `lcc` through a generated make.bat
 * (buildMakeBat.js). PVSnesLib normally builds through a GNU-make file
 * (`snes_rules`) which needs make + a Unix shell + coreutils. To avoid
 * shipping those, this module drives the four tools directly, the same way
 * snes_rules does:
 *
 *   <root>/hdr.asm            generated here from devkitsnes/include/hdr.asm.in
 *   *.c   -> 816-tcc -> .ps -> 816-opt -> .asm -> wla-65816 -> .obj
 *   *.asm ->                              wla-65816 -> .obj
 *   linkfile (local .obj + pvsneslib/lib/<map>_<speed>/*.obj)
 *   wlalink -> build/rom/game.sfc
 *
 * Decisions D3 (LoROM + FastROM, SRAM 8 KB, auto header) and D7 (vendored
 * toolchain) from the M0 cadrage.
 */

const HDR_TEMPLATE_REL = Path.join("devkitsnes", "include", "hdr.asm.in");

// Tidy a tool's console line: drop ANSI colour codes, shorten leading paths,
// and swallow the pure version/banner noise (816-opt prints its version on
// every file even with -q; wla/wlalink print a box banner). Returns "" for a
// line that should not reach the build log.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;
const NOISE_RE = /^816opt: \([\d.]+\) version|^-{5,}$|Macro Assembler.*v\d/i;
const filterLog = str => {
  const s = str
    .replace(ANSI_RE, "")
    .replace(/.*[/\\]/g, "")
    .trim();
  return NOISE_RE.test(s) ? "" : s;
};

// ROM size byte ($08 = 2 Mbit / 8 LoROM banks) and the power-of-2 bank count,
// mirroring GB Studio's cart sizing in buildProject.js.
const romSizing = requestedBanks => {
  let banks = 8;
  let code = 0x08;
  while (banks < requestedBanks) {
    banks *= 2;
    code += 1;
  }
  return { banks, romSize: code.toString(16).toUpperCase().padStart(2, "0") };
};

// A path with no spaces that the toolchain is happy to run from. Mirrors the
// logic in helpers/getTmp.js without the electron dependency.
const spaceFreeTmp = () => {
  let tmp = os.tmpdir();
  const bad =
    tmp.indexOf(" ") > -1 ||
    tmp.indexOf(".itch") > -1 ||
    (process.platform === "win32" && tmp.length >= 35);
  if (bad) {
    tmp = process.platform === "win32" ? "C:\\tmp" : "/tmp";
  }
  fs.ensureDirSync(tmp);
  return tmp;
};

// Locate the vendored PVSnesLib for this platform, extracted to a real,
// space-free path first if needed - either because the install dir contains
// spaces (GBDK/tcc/wla all misbehave then), or because it's packed inside a
// packaged app's app.asar. The asar case isn't just "misbehaves": nothing
// inside app.asar is a real file, and child_process.spawn() needs one -
// Electron's asar support makes *reading* transparent (stat/lstat/readdir/
// readFile/createReadStream), never execution - so every tool spawn below
// (816-tcc, wla-65816, wlalink, 816-opt, smconv) would fail with ENOENT
// otherwise. User-found: "Build ROM" worked (the toolchain-not-found check
// was already fixed) but the first real tool invocation (smconv, building
// the soundbank) failed with exactly that ENOENT, spawning straight out of
// app.asar.
const resolvePvsHome = async ({ progress }) => {
  const vendored = Path.join(
    buildToolsRoot,
    `${process.platform}-${process.arch}`,
    "pvsneslib"
  );
  if (!(await pathExists(vendored))) {
    throw new Error(
      `PVSnesLib toolchain not found for ${process.platform}-${process.arch} ` +
        `(expected at ${vendored}). Vendor it under buildTools/, or build the ` +
        `Game Boy target instead.`
    );
  }

  const inAsar = vendored.indexOf(".asar") !== -1;
  if (vendored.indexOf(" ") === -1 && !inAsar) {
    return vendored;
  }

  const dest = Path.join(spaceFreeTmp(), "gbs-pvsneslib");

  if (inAsar) {
    // A real extraction (tens of MB) is the one genuinely slow case here -
    // reuse a previous build's copy instead of redoing it every time.
    if (await pathExists(dest)) {
      return dest;
    }
    progress("Extracting the build toolchain (first SNES build only)");
    await copy(vendored, dest, { overwrite: false });
    return dest;
  }

  // Not inside asar, just a path with a space in it - a cheap symlink is
  // enough, same as before.
  progress("Copying toolchain to a space-free path");
  try {
    await fs.remove(dest);
    await fs.ensureSymlink(vendored, dest);
  } catch (e) {
    await copy(vendored, dest, { overwrite: false });
  }
  return dest;
};

const generateHeader = async (pvsHome, buildRoot, opts) => {
  const template = await fs.readFile(
    Path.join(pvsHome, HDR_TEMPLATE_REL),
    "utf8"
  );
  const subs = {
    "@HIROMDEF@": opts.hirom ? ".DEFINE HIROM 1" : "",
    "@FASTROMDEF@": opts.fastrom ? ".DEFINE FASTROM 1" : "",
    "@ROMTITLE@": String(opts.title || "GB STUDIO")
      .toUpperCase()
      .replace(/[^\x20-\x7E]/g, " ")
      .slice(0, 21),
    "@CARTRIDGETYPE@": opts.sramSize !== "00" ? "02" : "00",
    "@ROMSIZE@": opts.romSize,
    "@SRAMSIZE@": opts.sramSize,
    "@COUNTRY@": opts.country,
    "@LICENSEECODE@": "00",
    "@VERSION@": "00",
    "@ROMBANKS@": String(opts.romBanks),
    "@ROMBANKSIZE@": opts.hirom ? "10000" : "8000",
    "@ROMMODE@": opts.hirom ? "HIROM" : "LOROM",
    "@ROMSPEED@": opts.fastrom ? "FASTROM" : "SLOWROM"
  };
  let out = template;
  Object.keys(subs).forEach(key => {
    out = out.split(key).join(subs[key]);
  });
  await fs.writeFile(Path.join(buildRoot, "hdr.asm"), out, "utf8");
};

// Collect *.c / *.asm the way snes_rules does: project root + up to 3 levels
// under src/. Generated data files land in src/data/ and are picked up here.
const collectSources = async buildRoot => {
  const cFiles = [];
  const sFiles = [];
  const skip = ["obj", "build", "node_modules"];
  const walk = async (dir, depth) => {
    if (depth > 4) return;
    const entries = await fs.readdir(dir);
    for (const name of entries) {
      const full = Path.join(dir, name);
      const stat = await fs.lstat(full);
      if (stat.isDirectory()) {
        if (skip.indexOf(name) === -1) {
          await walk(full, depth + 1);
        }
      } else if (name.endsWith(".c")) {
        cFiles.push(full);
      } else if (name.endsWith(".asm")) {
        sFiles.push(full);
      }
    }
  };
  await walk(buildRoot, 0);
  return { cFiles, sFiles };
};

const spawnTool = (label, cmd, args, cwd, { progress, warnings }) =>
  new Promise((resolve, reject) => {
    progress(`${label} ${Path.basename(args[args.length - 1] || "")}`.trim());
    const child = childProcess.spawn(cmd, args, { cwd, shell: false });
    let stderr = "";
    child.stdout.on("data", data => {
      data
        .toString()
        .split("\n")
        .forEach(line => {
          const clean = filterLog(line);
          if (clean) progress(clean);
        });
    });
    child.stderr.on("data", data => {
      stderr += data.toString();
      data
        .toString()
        .split("\n")
        .forEach(line => {
          const clean = filterLog(line);
          if (clean) warnings(clean);
        });
    });
    child.on("error", err =>
      reject(new Error(`${label}: could not run ${cmd} (${err.message})`))
    );
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (exit ${code})\n${stderr.trim()}`));
    });
  });

// Some tools return before the OS has flushed their output file when the build
// dir is on a network/shared mount. Give it a beat before the next step reads it.
const waitForFile = async (file, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    if (await pathExists(file)) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`Expected build output was not produced: ${file}`);
};

const buildSnesRom = async ({
  buildRoot = "/tmp",
  data = {},
  progress = () => {},
  warnings = () => {}
} = {}) => {
  const settings = data.settings || {};
  const hirom = false; // D3
  const fastrom = settings.snesFastRom !== false; // D3, on by default
  const romMode = hirom ? "HiROM" : "LoROM";
  const romSpeed = fastrom ? "FastROM" : "SlowROM";

  const pvsHome = await resolvePvsHome({ progress });
  const binDir = Path.join(pvsHome, "devkitsnes", "bin");
  const toolsDir = Path.join(pvsHome, "devkitsnes", "tools");
  const libDir = Path.join(
    pvsHome,
    "pvsneslib",
    "lib",
    `${romMode}_${romSpeed}`
  );
  const includeArgs = [
    `-I${Path.join(pvsHome, "pvsneslib", "include")}`,
    `-I${Path.join(pvsHome, "devkitsnes", "include")}`,
    `-I${buildRoot}`
  ];
  const ext = process.platform === "win32" ? ".exe" : "";
  const exe = name => Path.join(binDir, name) + ext;
  const tool = name => Path.join(toolsDir, name) + ext;

  const { banks, romSize } = romSizing(settings.snesRomBanks || 8);

  progress("Generating SNES header");
  await generateHeader(pvsHome, buildRoot, {
    hirom,
    fastrom,
    title: data.name,
    romSize,
    romBanks: banks,
    sramSize: settings.snesSramSize || "03", // D3: 8 KB battery-backed save
    country: settings.snesRegion === "pal" ? "02" : "01"
  });

  const { cFiles, sFiles } = await collectSources(buildRoot);
  if (cFiles.length === 0) {
    warnings("No C source files found for the SNES target");
  }

  await fs.ensureDir(Path.join(buildRoot, "build", "rom"));

  const objFiles = [];
  // wla resolves `.include "hdr.asm"` relative to its working dir, and snes_rules
  // runs every tool from the project root with root-relative paths — match that.
  const fromRoot = p => Path.relative(buildRoot, p).split(Path.sep).join("/");

  // C sources: 816-tcc -> 816-opt -> wla-65816
  for (const cFile of cFiles) {
    const base = cFile.replace(/\.c$/, "");
    await spawnTool(
      "Compiling",
      exe("816-tcc"),
      [
        ...includeArgs,
        "-Wall",
        ...(fastrom ? ["-F"] : []),
        ...(hirom ? ["-H"] : []),
        "-c",
        cFile,
        "-o",
        `${base}.ps`
      ],
      buildRoot,
      { progress, warnings }
    );
    await waitForFile(`${base}.ps`);
    await spawnTool(
      "Optimising",
      tool("816-opt"),
      ["-q", "-i", `${base}.ps`, "-o", `${base}.asm`],
      buildRoot,
      { progress, warnings }
    );
    await waitForFile(`${base}.asm`);
    await spawnTool(
      "Assembling",
      exe("wla-65816"),
      ["-d", "-s", "-x", "-o", `${fromRoot(base)}.obj`, `${fromRoot(base)}.asm`],
      buildRoot,
      { progress, warnings }
    );
    await waitForFile(`${base}.obj`);
    objFiles.push(`${fromRoot(base)}.obj`);
  }

  // Hand-written / generated asm (hdr.asm, data.asm, ...): wla-65816 only
  for (const sFile of sFiles) {
    const base = sFile.replace(/\.asm$/, "");
    await spawnTool(
      "Assembling",
      exe("wla-65816"),
      ["-d", "-s", "-x", "-o", `${fromRoot(base)}.obj`, fromRoot(sFile)],
      buildRoot,
      { progress, warnings }
    );
    await waitForFile(`${base}.obj`);
    objFiles.push(`${fromRoot(base)}.obj`);
  }

  // Linkfile: local objects (root-relative) + PVSnesLib runtime objects.
  // wlalink on Windows needs native `C:\...` paths for the library objects,
  // not msys-style `/c/...` (per the snes_rules comment).
  const winPath = p =>
    process.platform === "win32" ? p.split("/").join("\\") : p;
  const libObjs = (await fs.readdir(libDir))
    .filter(f => f.endsWith(".obj"))
    .map(f => winPath(Path.join(libDir, f)));
  const linkfile = ["[objects]"]
    .concat(objFiles)
    .concat(libObjs)
    .join("\n");
  await fs.writeFile(Path.join(buildRoot, "linkfile"), `${linkfile}\n`, "utf8");

  // wlalink writes <name>.sfc and <name>.sym next to its output; snes_rules
  // runs it from the project root, so do the same and move the results.
  progress("Linking game.sfc");
  await spawnTool(
    "Linking",
    exe("wlalink"),
    ["-d", "-s", "-A", "-c", "-L", winPath(libDir), "linkfile", "game.sfc"],
    buildRoot,
    { progress, warnings }
  );
  await waitForFile(Path.join(buildRoot, "game.sfc"));

  const romPath = Path.join(buildRoot, "build", "rom", "game.sfc");
  const symOut = Path.join(buildRoot, "build", "rom", "game.sym");
  await fs.move(Path.join(buildRoot, "game.sfc"), romPath, { overwrite: true });

  // Normalise the symbol file for Mesen (snes_rules strips the ':' too).
  const symSrc = Path.join(buildRoot, "game.sym");
  if (await pathExists(symSrc)) {
    const sym = await fs.readFile(symSrc, "utf8");
    await fs.writeFile(symOut, sym.replace(/:/g, ""), "utf8");
    await fs.remove(symSrc);
  }

  progress(`ROM ready (${romMode} ${romSpeed}, ${banks} banks)`);
  return { romPath };
};

export default buildSnesRom;
export { resolvePvsHome, filterLog };
