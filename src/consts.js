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

// Electron 4 (this app's pinned version) never shipped a native
// darwin-arm64 build, so on macOS the whole app is always packaged and run
// as x64 - via Rosetta on Apple Silicon (see .github/workflows/build.yml).
// The vendored PVSnesLib SNES toolchain under buildTools/, though, is
// genuinely arm64-only: it's built by this project's own CI on GitHub's
// arm64-only macOS runners (real Intel macOS runners were retired in 2025),
// not a prebuilt upstream download like GBDK's own (real x64) binaries are.
// A genuine arm64 binary runs fine as a child process spawned from the
// Rosetta-translated x64 Electron process, so on darwin this always
// resolves to buildTools/darwin-arm64 regardless of what process.arch
// reports (which - under Rosetta - always says "x64", even on real Apple
// Silicon hardware). A real Intel Mac isn't supported for the SNES target
// until genuine x64 binaries are vendored alongside this.
const pvsneslibVendorDir = (platform = process.platform, arch = process.arch) =>
  path.join(
    buildToolsRoot,
    `${platform}-${platform === "darwin" ? "arm64" : arch}`,
    "pvsneslib"
  );

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
  pvsneslibVendorDir,
  MAX_ACTORS,
  MAX_TRIGGERS,
  MIDDLE_MOUSE
};
