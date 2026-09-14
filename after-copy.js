const fs = require("fs-extra");
const Path = require("path");

const disallowedFiles = [".DS_Store"];

function fileFilter(src, dest) {
  const filename = Path.basename(src);
  return disallowedFiles.indexOf(filename) === -1;
}

function afterCopy(buildPath, electronVersion, platform, arch, callback) {
  // Called from electronPackagerConfig in package.json
  // Copies correct build Tools for architecture. macOS needs two source
  // folders, not one: Electron 4 (this app's pinned version) never shipped
  // a native darwin-arm64 build, so the whole app is always packaged as x64
  // (see .github/workflows/build.yml), and GBDK's own (real, upstream-built)
  // x64 binaries under buildTools/darwin-x64/gbdk run fine there via
  // Rosetta - but the vendored PVSnesLib SNES toolchain is genuinely
  // arm64-only (built on GitHub's arm64-only macOS runners, not a prebuilt
  // upstream download like GBDK's) and lives separately under
  // buildTools/darwin-arm64/pvsneslib (see consts.js pvsneslibVendorDir for
  // the full story - duplicated here since this plain Node script, run
  // directly by electron-packager, doesn't go through the app's own
  // babel/webpack import graph). Both need to land in the packaged app,
  // each under its own real folder name.
  const dataDir = "/appData/";
  const toolsDirs =
    platform === "darwin"
      ? ["/buildTools/darwin-x64", "/buildTools/darwin-arm64"]
      : ["/buildTools/" + platform + "-" + arch];

  Promise.all(
    toolsDirs.map(toolsDir =>
      fs.copy(__dirname + toolsDir, buildPath + toolsDir, { filter: fileFilter })
    )
  )
    .then(() => {
      return fs.copy(__dirname + dataDir, buildPath + dataDir, {
        filter: fileFilter
      });
    })
    .then(() => callback())
    .catch(err => callback(err));
}

module.exports = afterCopy;
