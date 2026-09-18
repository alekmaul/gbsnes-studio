import fs from "fs-extra";
import compileSnesData from "./compileSnesData";
import ejectBuild from "./ejectBuild";
import buildSnesRom from "./buildSnesRom";
import compileSnesMusic from "./compileSnesMusic";
import { snesEmulatorRoot } from "../../consts";
import copy from "../helpers/fsCopy";

// Copies the JS-emulator template into build/web, drops the built ROM in
// next to it, and fills in the placeholders the template contains
// (___PROJECT_NAME___ / ___AUTHOR___ / ___PROJECT_HEAD___ /
// ___CUSTOM_CONTROLS___).
const buildWebPlayer = async ({ outputRoot, data, emulatorDir, romFilename }) => {
  await copy(emulatorDir, `${outputRoot}/build/web`);
  await copy(
    `${outputRoot}/build/rom/${romFilename}`,
    `${outputRoot}/build/web/rom/${romFilename}`
  );
  const sanitize = (s) => String(s || "").replace(/["<>]/g, "");
  const projectName = sanitize(data.name);
  const author = sanitize(data.author);
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
    x: data.settings.customControlsX,
    y: data.settings.customControlsY,
    l: data.settings.customControlsL,
    r: data.settings.customControlsR,
  });
  const html = (
    await fs.readFile(`${outputRoot}/build/web/index.html`, "utf8")
  )
    .replace(/___PROJECT_NAME___/g, projectName)
    .replace(/___AUTHOR___/g, author)
    .replace(/___PROJECT_HEAD___/g, customHead)
    .replace(/___CUSTOM_CONTROLS___/g, customControls);
  await fs.writeFile(`${outputRoot}/build/web/index.html`, html);
};

// Eject the appData/src/snes engine, compile the project's scenes / scripts /
// strings / backgrounds into src/assets.{c,h} + src/data/* (M7), rebuild the
// snesmod soundbank from the project's .mod music (M8 phase 2), then build
// the ROM (M8 phase 1). M12: also exports a "web" build via buildWebPlayer().
const buildProject = async (
  data,
  {
    buildType = "rom",
    projectRoot = "/tmp",
    outputRoot = "/tmp/testing",
    progress = (_msg) => {},
    warnings = (_msg) => {},
  } = {}
) => {
  await ejectBuild({
    projectType: "snes",
    projectRoot,
    outputRoot,
    compiledData: { files: {} },
    progress,
    warnings,
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
  for (const [name, content] of Object.entries(snesData.assetsData || {})) {
    await fs.writeFile(`${outputRoot}/src/data/${name}`, content);
  }
  await compileSnesMusic({
    music: data.music || [],
    projectRoot,
    buildRoot: outputRoot,
    progress,
    warnings,
  });
  await buildSnesRom({
    buildRoot: outputRoot,
    data,
    progress,
    warnings,
  });
  if (buildType === "web") {
    await buildWebPlayer({
      outputRoot,
      data,
      emulatorDir: snesEmulatorRoot,
      romFilename: "game.sfc",
    });
  }
};

export default buildProject;
