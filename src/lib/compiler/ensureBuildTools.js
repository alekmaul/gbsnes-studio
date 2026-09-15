import fs from "fs-extra";
import { buildToolsRoot } from "../../consts";
import copy from "../helpers/fsCopy";
import getTmp from "../helpers/getTmp";

const ensureBuildTools = async () => {
  const buildToolsPath = `${buildToolsRoot}/${process.platform}-${
    process.arch
  }`;

  const tmpPath = getTmp();
  // Same path (and the same "-v2" rename) as makeBuild.js's own copy of this
  // logic - both extract the same buildToolsPath and are meant to share one
  // cached copy. See the long comment there for why the rename is needed
  // (invalidates stale pre-fix extractions with broken executable
  // permissions on Linux/macOS, which a plain existence check can't tell
  // apart from a good one).
  const tmpBuildToolsPath = `${tmpPath}/_gbs-v2`;

  // Symlink build tools so that path doesn't contain any spaces
  // GBDKDIR doesn't work if path has spaces :-(
  try {
    await fs.fstat(tmpBuildToolsPath);
  } catch (e) {
    await copy(buildToolsPath, tmpBuildToolsPath, {
      overwrite: false,
      mode: 0o755
    });
  }

  return tmpBuildToolsPath;
};

export default ensureBuildTools;
