import path from "path";
import gbTarget from "./lib/compiler/targets/gb";

const isDist =
  __dirname.endsWith("/dist") ||
  __dirname.endsWith("/dist/windows") ||
  __dirname.endsWith("/dist/windows/help") ||
  __dirname.endsWith("\\dist") ||
  __dirname.endsWith("\\dist\\windows") ||
  __dirname.endsWith("\\dist\\windows\\help");

const rootDir = isDist
  ? __dirname
      .replace(/[\\/]dist[\\/]windows[\\/]help$/, "")
      .replace(/[\\/]dist[\\/]windows$/, "")
      .replace(/[\\/]dist$/, "")
  : path.normalize(`${__dirname}/../`);

const engineRoot = path.normalize(`${rootDir}/appData/src`);
const buildToolsRoot = path.normalize(`${rootDir}/buildTools`);
const emulatorRoot = path.normalize(`${rootDir}/appData/js-emulator`);
const snesEmulatorRoot = path.normalize(`${rootDir}/appData/snes-js-emulator`);
const projectTemplatesRoot = path.normalize(`${rootDir}/appData/templates`);

// Per-scene entity limits — the Game Boy values (targets/gb.js).
// The SNES data compiler (M6/M7) reads these from its own target descriptor.
const MAX_ACTORS = gbTarget.maxActors;
const MAX_TRIGGERS = gbTarget.maxTriggers;
const MIDDLE_MOUSE = 2;

export {
  engineRoot,
  buildToolsRoot,
  emulatorRoot,
  snesEmulatorRoot,
  projectTemplatesRoot,
  MAX_ACTORS,
  MAX_TRIGGERS,
  MIDDLE_MOUSE
};
