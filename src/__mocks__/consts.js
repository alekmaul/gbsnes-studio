const path = require("path");

const rootDir = path.normalize(`${__dirname}/../../`);
const engineRoot = path.normalize(`${rootDir}/appData/src`);
const buildToolsRoot = path.normalize(`${rootDir}/buildTools`);
const snesEmulatorRoot = path.normalize(`${rootDir}/appData/snes-js-emulator`);
const projectTemplatesRoot = path.normalize(`${rootDir}/appData/templates`);
const localesRoot = path.normalize(`${rootDir}/src/lang`);
const eventsRoot = path.normalize(`${rootDir}/src/lib/events`);
const assetsRoot = path.normalize(`${rootDir}/src/assets`);
const pvsneslibVendorDir = (platform = process.platform, arch = process.arch) =>
  path.join(
    buildToolsRoot,
    `${platform}-${platform === "darwin" ? "arm64" : arch}`,
    "pvsneslib"
  );

const MIDDLE_MOUSE = 2;

export {
  engineRoot,
  buildToolsRoot,
  snesEmulatorRoot,
  projectTemplatesRoot,
  localesRoot,
  eventsRoot,
  assetsRoot,
  pvsneslibVendorDir,
  MIDDLE_MOUSE
};
