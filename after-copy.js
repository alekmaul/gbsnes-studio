const fs = require("fs-extra");
const Path = require("path");
const glob = require("glob").sync;

const disallowedFiles = [".DS_Store"];

function fileFilter(src, dest) {
  const filename = Path.basename(src);
  return disallowedFiles.indexOf(filename) === -1;
}

function afterCopy(buildPath, electronVersion, platform, arch, callback) {

  // Called from packagerConfig in forge.config.js
  // Copies correct build Tools for architecture + dynamically loaded js/json files.
  // The vendored PVSnesLib SNES toolchain is genuinely arm64-only on macOS
  // (built on GitHub's arm64-only macOS runners), so it lives under
  // buildTools/darwin-arm64/pvsneslib regardless of the packaged app's own
  // --arch (x64, cross-packaged - see consts.js's pvsneslibVendorDir for the
  // full story, duplicated here since this plain Node script, run directly
  // by electron-packager, doesn't go through the app's own babel/webpack
  // import graph). v3 (M14) removed the Game Boy engine/toolchain entirely,
  // including buildTools/darwin-x64/ (which only ever held GBDK's own real
  // x64 binaries) - so macOS no longer needs a second buildTools source
  // folder the way it did in the dual-target world.
  const buildToolsDirs =
    platform === "darwin"
      ? ["/buildTools/darwin-arm64"]
      : ["/buildTools/" + platform + "-" + arch];
  const copyPaths = [
    ...buildToolsDirs,
    "/appData/",
    "/src/lang",
    "/src/lib/events",
    "/src/assets"
  ];

  Promise.all(copyPaths.map((dir) => {
    return fs.copy(__dirname + dir, buildPath + dir, { filter: fileFilter })
  }))
    .then(() => {
      const dynamicChunks = glob(__dirname + "/.webpack/renderer/[0-9]");
      return Promise.all(dynamicChunks.map((dynamicChunk) => {
        const outputPath = buildPath + "/.webpack/renderer/main_window/" + Path.basename(dynamicChunk);
        return fs.copy(dynamicChunk, outputPath, { filter: fileFilter });
      }));
    })
    .then(() => callback())
    .catch(err => callback(err));
}

module.exports = afterCopy;
