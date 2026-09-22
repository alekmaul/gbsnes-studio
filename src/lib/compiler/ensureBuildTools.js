import fs from "fs-extra";
import Path from "path";
import { buildToolsRoot } from "../../consts";
import copy, { pathExists } from "../helpers/fsCopy";
import getTmp from "../helpers/getTmp";
import dedupeByKey from "../helpers/dedupeByKey";

const ensureBuildTools = async () => {
  const buildToolsPath = `${buildToolsRoot}/${process.platform}-${
    process.arch
  }`;

  const tmpPath = getTmp();
  // Same path (and the same "-v3" rename) as makeBuild.js used to have its
  // own separate copy of this logic - both extracted the same
  // buildToolsPath into the same shared cache, redundantly, on every GB
  // build; makeBuild.js now just calls this function instead. See the long
  // comment history in CLAUDE.md for why the rename is needed (invalidates
  // stale pre-fix extractions with broken executable permissions on
  // Linux/macOS, which a plain existence check can't tell apart from a good
  // one).
  const tmpBuildToolsPath = `${tmpPath}/_gbs-v3`;
  // Written only after a copy fully completes - guards against a
  // partial/interrupted extraction (crashed mid-copy, or another build
  // still spawning it) looking like a valid one. This function previously
  // checked `fs.fstat(tmpBuildToolsPath)` - fstat takes a file descriptor,
  // not a path, so that call always threw and this function silently
  // re-copied the whole toolchain on *every single call*, not just the
  // first - wasteful, and (see dedupeByKey.js) a real source of the exact
  // Windows EPERM class GB Studio's own v4.2.1 fixed.
  const doneMarker = Path.join(tmpBuildToolsPath, ".extracted-ok");

  return dedupeByKey(tmpBuildToolsPath, async () => {
    if (await pathExists(doneMarker)) {
      return tmpBuildToolsPath;
    }
    await fs.remove(tmpBuildToolsPath);
    await copy(buildToolsPath, tmpBuildToolsPath, {
      overwrite: true,
      mode: 0o755
    });
    await fs.writeFile(doneMarker, "");
    return tmpBuildToolsPath;
  });
};

export default ensureBuildTools;
