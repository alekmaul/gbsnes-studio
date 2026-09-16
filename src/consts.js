import path from "path";
import gbTarget from "./lib/compiler/targets/gb";

const isDist = __dirname.indexOf(".webpack") > -1;
const isCli = __dirname.indexOf("out/cli") > -1;

let rootDir = __dirname.substr(0, __dirname.lastIndexOf("node_modules"));
if (isDist) {
  rootDir = __dirname.substr(0, __dirname.lastIndexOf(".webpack")); 
} else if (isCli) {
  rootDir = __dirname.substr(0, __dirname.lastIndexOf("out/cli")); 
} else if (process.env.NODE_ENV === "test") {
  rootDir = path.normalize(`${__dirname}/../`);
}

const engineRoot = path.normalize(`${rootDir}/appData/src`);
const buildToolsRoot = path.normalize(`${rootDir}/buildTools`);
const emulatorRoot = path.normalize(`${rootDir}/appData/js-emulator`);
const snesEmulatorRoot = path.normalize(`${rootDir}/appData/snes-js-emulator`);
const projectTemplatesRoot = path.normalize(`${rootDir}/appData/templates`);
const localesRoot = path.normalize(`${rootDir}/src/lang`);
const eventsRoot = path.normalize(`${rootDir}/src/lib/events`);
const assetsRoot = path.normalize(`${rootDir}/src/assets`);

// Electron 4 (main branch's pinned version) never shipped a native
// darwin-arm64 build, so on macOS the whole app was always packaged and run
// as x64 - via Rosetta on Apple Silicon. The vendored PVSnesLib SNES
// toolchain under buildTools/, though, is genuinely arm64-only: it's built
// by this project's own CI on GitHub's arm64-only macOS runners (real Intel
// macOS runners were retired in 2025), not a prebuilt upstream download
// like GBDK's own (real x64) binaries are. A genuine arm64 binary runs fine
// as a child process spawned from a Rosetta-translated x64 Electron
// process, so on darwin this always resolves to buildTools/darwin-arm64
// regardless of what process.arch reports (which - under Rosetta - always
// says "x64", even on real Apple Silicon hardware). Ported from the
// equivalent fix on `main` (found there the same way: `file` on every
// vendored darwin binary showed genuine Mach-O arm64, not x64) - a real
// Intel Mac isn't supported for the SNES target until genuine x64 binaries
// are vendored alongside this.
const pvsneslibVendorDir = (platform = process.platform, arch = process.arch) =>
  path.join(
    buildToolsRoot,
    `${platform}-${platform === "darwin" ? "arm64" : arch}`,
    "pvsneslib"
  );

// Per-scene entity limits — the Game Boy values (targets/gb.js). Whichever
// target's own data compiler is running reads these from its own target
// descriptor instead once it exists (see M6/M7 for SNES).
const MAX_ACTORS = gbTarget.maxActors;
const MAX_ACTORS_SMALL = gbTarget.maxActorsSmall;
const MAX_TRIGGERS = gbTarget.maxTriggers;
const MAX_FRAMES = gbTarget.maxSpriteFrames;
const SCREEN_WIDTH = gbTarget.screenTileWidth;
const SCREEN_HEIGHT = gbTarget.screenTileHeight;
const MAX_ONSCREEN = gbTarget.maxOnscreenActors;

const MIDDLE_MOUSE = 2;

export const TOOL_SELECT = "select";
export const TOOL_ACTORS = "actors";
export const TOOL_COLLISIONS = "collisions";
export const TOOL_COLORS = "colors";
export const TOOL_SCENE = "scene";
export const TOOL_TRIGGERS = "triggers";
export const TOOL_ERASER = "eraser";

export const BRUSH_8PX = "8px";
export const BRUSH_16PX = "16px";
export const BRUSH_FILL = "fill";

export const SPRITE_TYPE_STATIC = "static";
export const SPRITE_TYPE_ACTOR = "actor";
export const SPRITE_TYPE_ACTOR_ANIMATED = "actor_animated";
export const SPRITE_TYPE_ANIMATED = "animated";

export const COLLISION_TOP = 0x1;
export const COLLISION_BOTTOM = 0x2;
export const COLLISION_LEFT = 0x4;
export const COLLISION_RIGHT = 0x8;
export const COLLISION_ALL = 0xF;
export const TILE_PROP_LADDER = 0x10;
export const TILE_PROPS = 0xF0;

export const DRAG_PLAYER = "DRAG_PLAYER";
export const DRAG_DESTINATION = "DRAG_DESTINATION";
export const DRAG_ACTOR = "DRAG_ACTOR";
export const DRAG_TRIGGER = "DRAG_TRIGGER";

export const DMG_PALETTE = {
  id: "dmg",
  name: "DMG (GB Default)",
  colors: [ "E8F8E0", "B0F088", "509878", "202850" ]
};

export const TMP_VAR_1 = "T0";
export const TMP_VAR_2 = "T1";

export {
  engineRoot,
  buildToolsRoot,
  emulatorRoot,
  snesEmulatorRoot,
  projectTemplatesRoot,
  localesRoot,
  eventsRoot,
  assetsRoot,
  pvsneslibVendorDir,
  MAX_ACTORS,
  MAX_ACTORS_SMALL,
  MAX_TRIGGERS,
  MAX_FRAMES,
  MAX_ONSCREEN,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  MIDDLE_MOUSE
};
