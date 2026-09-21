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

  // The SNES engine core ships several committed placeholder/proof-of-concept
  // files so the raw tree is buildable on its own via plain `make`:
  // src/assets.{c,h} + src/data/* (gen-dummy-gfx.js) and the soundbank
  // (res/soundbank.{bnk,h,_banks.h} + src/res/soundbank.asm, a real smconv
  // output committed once). buildProjectSnes()/compileSnesMusic.js always
  // immediately overwrite the asset ones, and the soundbank ones whenever a
  // project has its own music - so copying the placeholder here is pure
  // throwaway work in those cases. Worse, re-touching a path something else
  // *just* wrote can hit a persistent Windows EPERM no retry budget clears -
  // confirmed on a real Windows 8 VM with **no antivirus running at all**
  // (v1.1.6-v1.1.9 each chased this as an AV issue for the assets files;
  // the same class of error then reproduced on the soundbank files, on a
  // machine with no AV to blame - so this is Windows file-locking around a
  // just-touched path in general, of which AV is only one possible cause,
  // not the antivirus-specific livelock earlier versions assumed). Skipping
  // the copy removes the double-touch entirely instead of trying to survive
  // it - the GB engine's own ejected files never had this problem in the
  // first place, since its generated filenames are never part of the copied
  // core to begin with. compileSnesMusic.js now copies the committed
  // soundbank itself when a project has no music of its own, since ejecting
  // no longer will.
  const exclude =
    projectType === "snes"
      ? [
          "src/assets.h",
          "src/assets.c",
          "src/data",
          "res/soundbank.bnk",
          "res/soundbank.h",
          "res/soundbank_banks.h",
          "src/res/soundbank.asm"
        ]
      : [];
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
