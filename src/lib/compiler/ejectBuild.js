import fs from "fs-extra";
import rimraf from "rimraf";
import { promisify } from "util";
import Path from "path";
import { engineRoot } from "../../consts";
import copy from "../helpers/fsCopy";

const rmdir = promisify(rimraf);

const ejectBuild = async ({
  projectType = "gb",
  outputRoot = "/tmp",
  compiledData,
  progress = () => {},
  warnings = () => {}
} = {}) => {
  const corePath = `${engineRoot}/${projectType}`;
  progress(`Unlink ${Path.basename(outputRoot)}`);
  await rmdir(outputRoot);
  await fs.ensureDir(outputRoot);
  progress("Copy core");

  // The SNES engine core ships committed dummy src/assets.{c,h} + src/data/*
  // (appData/src/snes/tools/gen-dummy-gfx.js) so the raw tree is buildable
  // on its own via plain `make` - but buildProjectSnes() always immediately
  // overwrites every one of those paths with the real compiled content right
  // after this call returns, so copying the dummy versions here is pure
  // throwaway work. Worse, on Windows it also creates the exact race that
  // caused a genuinely unfixable-by-retry EPERM (v1.1.6-v1.1.8 - see
  // writeFileAtomic.js's header comment): re-touching a path something else
  // *just* wrote can hit a persistent antivirus lock no backoff clears.
  // Skipping the copy here removes that specific double-touch entirely
  // instead of trying to survive it - the GB engine's own ejected files
  // never had this problem in the first place, since its generated
  // filenames are never part of the copied core to begin with.
  const exclude =
    projectType === "snes" ? ["src/assets.h", "src/assets.c", "src/data"] : [];
  await copy(corePath, outputRoot, { exclude });
  await fs.ensureDir(`${outputRoot}/src/data`);
  await fs.ensureDir(`${outputRoot}/node_modules`);
  await fs.ensureDir(`${outputRoot}/obj`);
  await fs.ensureDir(`${outputRoot}/obj/music`);
  await fs.ensureDir(`${outputRoot}/obj/data`);
  await fs.ensureDir(`${outputRoot}/build/rom`);

  for (const filename in compiledData.files) {
    if (filename.endsWith(".h")) {
      progress(`Copy header ${filename}`);
      await fs.writeFile(
        `${outputRoot}/include/${filename}`,
        compiledData.files[filename]
      );
    } else {
      progress(`Copy code ${filename}`);
      await fs.writeFile(
        `${outputRoot}/src/data/${filename}`,
        compiledData.files[filename]
      );
    }
  }
};

export default ejectBuild;
