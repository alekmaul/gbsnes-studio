import fs from "fs-extra";
import compile from "./compileData";
import compileSnesData from "./compileSnesData";
import ejectBuild from "./ejectBuild";
import makeBuild from "./makeBuild";
import buildSnesRom from "./buildSnesRom";
import compileMusic from "./compileMusic";
import compileSnesMusic from "./compileSnesMusic";
import { emulatorRoot, snesEmulatorRoot } from "../../consts";
import copy from "../helpers/fsCopy";

const MAX_BANKS = 512; // GBDK supports max of 512 banks

// Which backend to compile for. "gb" (GBDK/Game Boy) is the default and the
// stock behaviour; "snes" (PVSnesLib) is the second target being brought up.
const resolveTarget = data =>
  process.env.GBS_TARGET ||
  (data.settings && data.settings.target) ||
  "gb";

// Copies a target's static JS-emulator template into build/web, drops the built
// ROM in next to it, and fills in the placeholders both templates share
// (___PROJECT_NAME___ / ___AUTHOR___ / ___PROJECT_HEAD___ / ___CUSTOM_CONTROLS___).
// ___COLORS_HEAD___ is GB-only (custom palette CSS) - replacing it when the
// template doesn't contain it (SNES) is a harmless no-op.
const buildWebPlayer = async ({ outputRoot, data, emulatorDir, romFilename }) => {
  await copy(emulatorDir, `${outputRoot}/build/web`);
  await copy(
    `${outputRoot}/build/rom/${romFilename}`,
    `${outputRoot}/build/web/rom/${romFilename}`
  );
  const sanitize = s => String(s || "").replace(/["<>]/g, "");
  const projectName = sanitize(data.name);
  const author = sanitize(data.author);
  const colorsHead = data.settings.customColorsEnabled
    ? `<style type="text/css"> body { background-color:#${data.settings.customColorsBlack}; }</style>`
    : "";
  const customHead = data.settings.customHead || "";
  const customControls = JSON.stringify({
    up: data.settings.customControlsUp,
    down: data.settings.customControlsDown,
    left: data.settings.customControlsLeft,
    right: data.settings.customControlsRight,
    a: data.settings.customControlsA,
    b: data.settings.customControlsB,
    start: data.settings.customControlsStart,
    select: data.settings.customControlsSelect,
    // SNES-only; the GB web player ignores these keys.
    x: data.settings.customControlsX,
    y: data.settings.customControlsY,
    l: data.settings.customControlsL,
    r: data.settings.customControlsR
  });
  const html = (await fs.readFile(`${outputRoot}/build/web/index.html`, "utf8"))
    .replace(/___PROJECT_NAME___/g, projectName)
    .replace(/___AUTHOR___/g, author)
    .replace(/___COLORS_HEAD___/g, colorsHead)
    .replace(/___PROJECT_HEAD___/g, customHead)
    .replace(/___CUSTOM_CONTROLS___/g, customControls);
  await fs.writeFile(`${outputRoot}/build/web/index.html`, html);
};

// SNES path: eject the appData/src/snes engine, compile the project's scenes /
// scripts / strings / backgrounds into src/assets.{c,h} (compileSnesData, M7),
// rebuild the snesmod soundbank from the project's .mod music (compileSnesMusic,
// M8 phase 2), then build the ROM (buildSnesRom, M1).
const buildProjectSnes = async (
  data,
  { projectRoot, outputRoot, buildType, progress, warnings }
) => {
  await ejectBuild({
    projectType: "snes",
    outputRoot,
    compiledData: { files: {} },
    progress,
    warnings
  });
  progress("Compiling SNES data");
  const snesData = await compileSnesData(data, { projectRoot, warnings });
  await fs.writeFile(`${outputRoot}/src/assets.h`, snesData.assetsH);
  await fs.writeFile(`${outputRoot}/src/assets.c`, snesData.assetsC);
  // Graphic assets go in src/data/: one `<name>_data.as` (superfree section)
  // per background / font / OBJ sheet / OBJ palette, plus data.asm that
  // `.include`s them - so wla spreads them across banks instead of one atomic
  // 32 KB-capped `.rodata` section. Drop any stale assets_spr.asm shipped in
  // the engine tree (its blobs live in src/data/ now).
  await fs.remove(`${outputRoot}/src/assets_spr.asm`);
  await fs.ensureDir(`${outputRoot}/src/data`);
  for (const [name, content] of Object.entries(snesData.assetsData)) {
    await fs.writeFile(`${outputRoot}/src/data/${name}`, content);
  }
  await compileSnesMusic({
    music: data.music || [],
    projectRoot,
    buildRoot: outputRoot,
    progress,
    warnings
  });
  await buildSnesRom({
    buildRoot: outputRoot,
    data,
    progress,
    warnings
  });
  if (buildType === "web") {
    await buildWebPlayer({
      outputRoot,
      data,
      emulatorDir: snesEmulatorRoot,
      romFilename: "game.sfc"
    });
  }
};

const buildProject = async (
  data,
  {
    buildType = "rom",
    projectRoot = "/tmp",
    tmpPath = "/tmp",
    outputRoot = "/tmp/testing",
    progress = () => {},
    warnings = () => {}
  } = {}
) => {
  if (resolveTarget(data) === "snes") {
    await buildProjectSnes(data, {
      projectRoot,
      outputRoot,
      buildType,
      progress,
      warnings
    });
    return;
  }

  const compiledData = await compile(data, {
    projectRoot,
    tmpPath,
    progress,
    warnings
  });
  await ejectBuild({
    outputRoot,
    compiledData,
    progress,
    warnings
  });
  await compileMusic({
    music: compiledData.music,
    musicBanks: compiledData.musicBanks,
    projectRoot,
    buildRoot: outputRoot,
    progress,
    warnings
  });

  const musicBanks = compiledData.music.map((m)=> m.bank);
  const maxMusicBank = Math.max(...musicBanks);

  console.log(`The last bank with music data is ${maxMusicBank}`); // for cartSize, 0 if no music...

  const banksRequired = Math.max(compiledData.maxDataBank, maxMusicBank) + 1;
  
  // Determine next power of 2 for cart size based on number of banks required
  const cartSize = Math.pow(2, Math.ceil(Math.log(banksRequired) / Math.log(2)));

  if (cartSize > MAX_BANKS) {
    throw new Error(
      `Game content is over the maximum of ${MAX_BANKS} banks available. Content requires ${banksRequired} banks.`
    );
  }

  await makeBuild({
    buildRoot: outputRoot,
    buildType,
    cartSize,
    data,
    progress,
    warnings
  });
  if (buildType === "web") {
    await buildWebPlayer({
      outputRoot,
      data,
      emulatorDir: emulatorRoot,
      romFilename: "game.gb"
    });
  }
};

export default buildProject;
