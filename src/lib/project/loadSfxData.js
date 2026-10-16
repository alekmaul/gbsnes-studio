import glob from "glob";
import { promisify } from "util";
import uuid from "uuid/v4";
import { stat } from "fs-extra";
import parseAssetPath from "../helpers/path/parseAssetPath";

const globAsync = promisify(glob);

// Real per-project sound-effect assets (v4 follow-up) - Sound: Play Effect's
// "custom" type picks one of these, encoded to BRR by compileSnesSfx.js.
// Modeled on loadFontData.js (no per-asset `settings`, same as Font/Emote -
// unlike Music, a sound effect has nothing to configure beyond the file
// itself).
const loadSfxData = projectRoot => async filename => {
  const { file, plugin } = parseAssetPath(filename, projectRoot, "sounds");
  try {
    const fileStat = await stat(filename, { bigint: true });
    const inode = fileStat.ino.toString();
    return {
      id: uuid(),
      plugin,
      name: file.replace(/\.wav$/i, ""),
      filename: file,
      inode,
      _v: Date.now()
    };
  } catch (e) {
    console.error(e);
    return null;
  }
};

const loadAllSfxData = async projectRoot => {
  const soundPaths = await globAsync(
    `${projectRoot}/assets/sounds/**/@(*.wav|*.WAV)`
  );
  const pluginPaths = await globAsync(
    `${projectRoot}/plugins/*/sounds/**/@(*.wav|*.WAV)`
  );
  const soundData = (
    await Promise.all(
      [].concat(
        soundPaths.map(loadSfxData(projectRoot)),
        pluginPaths.map(loadSfxData(projectRoot))
      )
    )
  ).filter(s => s);
  return soundData;
};

export default loadAllSfxData;
export { loadSfxData };
