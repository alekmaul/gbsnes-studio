import glob from "glob";
import { promisify } from "util";
import uuid from "uuid/v4";
import { stat } from "fs-extra";
import parseAssetPath from "../helpers/path/parseAssetPath";

const globAsync = promisify(glob);

const loadEmoteData = projectRoot => async filename => {
  const { file, plugin } = parseAssetPath(filename, projectRoot, "emotes");
  try {
    const fileStat = await stat(filename, { bigint: true });
    const inode = fileStat.ino.toString();
    return {
      id: uuid(),
      plugin,
      name: file.replace(/.png/i, ""),
      filename: file,
      inode,
      _v: Date.now()
    };
  } catch (e) {
    console.error(e);
    return null;
  }
};

const loadAllEmoteData = async projectRoot => {
  const imagePaths = await globAsync(
    `${projectRoot}/assets/emotes/**/@(*.png|*.PNG)`
  );
  const pluginPaths = await globAsync(
    `${projectRoot}/plugins/*/emotes/**/@(*.png|*.PNG)`
  );
  const imageData = (
    await Promise.all(
      [].concat(
        imagePaths.map(loadEmoteData(projectRoot)),
        pluginPaths.map(loadEmoteData(projectRoot))
      )
    )
  ).filter(i => i);
  return imageData;
};

export default loadAllEmoteData;
export { loadEmoteData };
