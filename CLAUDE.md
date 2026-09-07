# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fork of GB Studio 1.2.2, rebranded **GBSNES Studio** — a visual retro game maker. It is an
Electron desktop app (the editor, written in React/Redux) plus a C game engine compiled with
GBDK. The working copy lives under a `gbsnes-studio` directory: this fork keeps the stock
Game Boy (GBDK) target fully working **and** adds a second SNES (PVSnesLib) build target
alongside it. The Game Boy path is the frozen reference — SNES work adds a parallel target,
it does not edit GB behaviour in place.

Branding: everything user-facing says **GBSNES Studio** — `productName`, `forge.config.js`
names, the splash/About windows, and every "GB Studio" string in `src/lang/*.json` (all
locales). The npm `name`, `executableName`, Squirrel/Store names and CI artifact names
are `gbsnes-studio` / `gbsnes_studio` / `gbsnesstudio`. Still `gbstudio`-flavoured (not renamed
on purpose): `appBundleId` (`dev.gbstudio.gbstudio`, a macOS identifier), the
`src/lib/helpers/gbstudio.js` module, and the `gbstudio.dev` doc/download URLs (point at the
upstream site). `updateChecker.js` points at the GitHub repo `alekmaul/gbsnes-studio`.

## Commands

```bash
yarn                      # install (Node LTS; CI runs `yarn --ignore-engines`)
npm start                 # run the Electron app (electron-forge, hot reload)
yarn test                 # Jest, all suites (roots: test/)
yarn test <path|name>     # single file/pattern, e.g. yarn test compileData
yarn test -t "compile"    # single test by name
yarn coverage             # jest --coverage --runInBand
yarn lint                 # eslint src (airbnb + react-app + prettier, babel-eslint parser)
yarn make:win | make:mac | make:linux   # package distributable
node src/lang/list_missing.js           # report missing translation keys
```

There is no build step for `src/` in dev — `electron-compile` transpiles on the fly via
`.compilerc` / `.babelrc`. Tests transpile through `babel-jest` with `.babelrc`.

**CI** is GitHub Actions (`.github/workflows/build.yml`) — replaced the inherited-from-upstream
CircleCI config (deleted; wrong branch names, Wine-based Windows builds). `test` runs
`yarn test` on Node 16 (Ubuntu); `build` is a `{windows-latest, macos-13, ubuntu-latest}`
matrix running `yarn make:{win,mac,linux}` natively per OS (each vendored PVSnesLib toolchain
runs on its own platform). `forge.config.js` skips `osxSign` when `process.env.CI` is set (no
Apple identity on CI). On a `v*` tag the `release` job attaches the per-platform builds to the
GitHub Release (`softprops/action-gh-release`). Lint is not gated (large inherited eslint debt).
Node-16 pin: the 2021 `yarn.lock` is never regenerated, so a clean CI resolve pulls a few
modern transitive deps that declare `engines.node >=18` (e.g. `node-releases` via browserslist).
`--ignore-engines` is on the CLI install, plus `YARN_IGNORE_ENGINES=true` in the workflow `env`
(inherited by the nested `yarn install` electron-packager runs while pruning the packaged app —
that one never saw the CLI flag) and a repo-root `.yarnrc` (`ignore-engines true`) for local dev.

## Two processes, one repo

- **Main process**: `src/index.js` (window lifecycle, `ipcMain`), `src/menu.js`,
  `src/lib/electron/**`, `src/windows/**` (`splash`, `project`, `help` HTML entry points).
- **Renderer**: `src/windows/projectRoot.js` mounts the React app. State is Redux
  (`src/store/configureStore.js`, `src/reducers/**`) with thunks in `src/actions/` and
  side-effecting middleware in `src/middleware/` (`buildGame`, `music`, `soundfx`, `electron`,
  `logger`). Long-running work (compiling a ROM, watching the project folder) happens in
  middleware, not components.

Project files (`*.gbsproj`, JSON) are loaded/normalized by `src/lib/project/**`
(`loadProjectData`, `migrateProject`, `watchProject`, `saveProjectData`). The Redux store
holds a **normalized** entity graph (`src/reducers/entitiesReducer.js`); `denormalizeProject`
rebuilds the plain project object that the compiler consumes.

## The compile pipeline (most important architecture)

Triggered by a `BUILD_GAME` action → `src/middleware/buildGame.js` →
`src/lib/compiler/buildProject.js`. Stages:

1. **`compileData.js`** — `precompile()` collects only the *used* assets (backgrounds, sprites,
   avatars, music, strings, variables) by walking every scene's event tree
   (`src/lib/helpers/eventSystem.js`). Then it lays all binary data into ROM banks via
   **`bankedData.js`** (`BankedData`, 16 KB banks, MBC1/MBC5 rules, `BANK_PTR {bank, offset}`
   where offset is a GB `0x4000`-window address). Emits C source: `bank_*.c`, `banks.h`,
   `data_ptrs.c/.h` (the pointer tables + `START_*` `#define`s the engine reads).
2. **Script compilation** — per entity, `compileEntityEvents.js` runs each event's `compile()`
   through a `ScriptBuilder` (`scriptBuilder.js`) that pushes **numeric opcodes + args** into a
   byte array. Opcode numbers come from `src/lib/events/scriptCommands.js` (`commandIndex()`);
   they must stay in sync with the dispatch table `script_cmds[]` in
   `appData/src/gb/src/ScriptRunner.c`. Placeholders like `__REPLACE:STRING_HI:<n>` and
   `goto: <label>` are patched after all data is banked (`banked.mutate(...)` in `compileData.js`,
   label resolution in `scriptBuilder.js`).
3. **`compileImages.js` + `ggbgfx.js`** — PNG → GB 2bpp tiles. Colour is a green-channel
   heuristic (`indexColour`); backgrounds share/merge tilesets to fit `16*12` tiles.
4. **`ejectBuild.js`** — wipes the output dir and copies the engine core from
   `appData/src/<projectType>` (`projectType` is hardcoded `"gb"`), then writes the generated
   C files into `src/data/` and `include/`.
5. **`compileMusic.js`** — runs `mod2gbt` (from `buildTools/`) on `.mod` files, re-parses the C
   it produces into raw pattern/order data, re-banks it, and rewrites `data_ptrs.c`'s
   `music_banks[]` / `music_tracks[]`.
6. **`makeBuild.js`** — symlinks `buildTools/<platform>-<arch>/gbdk` into a space-free tmp path
   (GBDK breaks on spaces), generates `make.bat` (`buildMakeBat.js`) or uses the `Makefile`,
   runs `lcc`, then patches the GB ROM header (title, checksums, optional CGB custom palette
   from settings) in `build/rom/game.gb`.
7. Web builds additionally copy `appData/js-emulator` (a JS Game Boy emulator) and template
   the `index.html`.

### Events are the extension point

Each file `src/lib/events/event*.js` exports `id`, `fields` (drives the auto-generated editor
form) and `compile(args, helpers)` (emits bytecode via the injected `ScriptBuilder` methods).
`src/lib/events/index.js` auto-loads them by glob and merges plugin events
(`src/lib/plugins/plugins.js`). Adding a scripting command means: new `event*.js`, new entry in
`scriptCommands.js`, new `Script_*_b` handler + `script_cmds[]` row in the engine, and (if it
carries data) handling in `scriptBuilder.js`.

## The SNES (PVSnesLib) target — work in progress

A second compile target is being brought up alongside Game Boy. It is selected by
`process.env.GBS_TARGET` or `project.settings.target` (`"gb"` default → stock behaviour);
`buildProject.js` `resolveTarget()` routes `"snes"` to `buildProjectSnes()` — eject the
`appData/src/snes` engine → `compileSnesData` writes `src/assets.{c,h}` → `compileSnesMusic`
rebuilds the soundbank from the project's `.mod` songs → `buildSnesRom`.
`settings.target` is editable from the app itself: Settings page → "Target Platform" (M9,
`src/containers/pages/SettingsPage.js`) — GB/SNES-color-only sections (GBC options, cartridge
type) hide when SNES is selected and a warning box lists current SNES gaps. No env var needed
for normal use; `GBS_TARGET` still overrides it for CLI/test convenience. A "SNES Options"
section (shown only when the target is SNES) now also exposes `settings.snesRegion`
(NTSC/PAL → header `COUNTRY`) and `settings.snesSramSize` (header `SRAMSIZE`, `1024 << N`
bytes) — `buildSnesRom.js` was already reading both with sane defaults, just no UI existed yet.
The World editor's camera-viewport rectangle (`src/components/world/EventHelper.js`, shown
over the scene background while editing a `Camera: Move To` event) is now target-aware too:
it was hardcoded to the GB screen size (160×144px / 20×18 tiles, in `EventHelper.css`) and now
reads `screenTileWidth`/`screenTileHeight` from `src/lib/compiler/targets/{gb,snes}.getTarget()`
via a `target` prop threaded down from `Scene.js`'s `settings.target` (Redux). This was the
*only* screen-size-hardcoded spot that actually draws a precise viewport rectangle — a sibling
CSS rule (`.EventHelper__OverlayPos`, for `OVERLAY_SHOW`/`MOVE_TO`) turned out to be dead/unused
(never referenced by any JSX `className`); the box that IS rendered for those events
(`.EventHelper__OverlayPos__Overlay`) is a fixed 256×256px oversized mask, not a precise bounds
indicator, so it was left as-is (already generously covers both screen sizes).
Following the user hitting it directly (an SNES scene's `Camera: Move To` X/Y fields still
capped at 12/14, GB's own 32-tile-scene approximation), found and fixed the actual M2-audit
item this was standing in for: `scriptBuilder.js`'s `cameraMoveTo` clamped the compiled X/Y to
`scene.width - 20` / `scene.height - 18` **unconditionally**, regardless of target, so even
disregarding the editor field, a compiled SNES ROM would still get its camera silently
clamped to GB-sized margins. Fixed by reading `getTarget(this.options.target).screenTileWidth/
screenTileHeight` instead of the literals (`target` undefined → `"gb"` → 20/18, so GB's compiled
bytes are provably unchanged - verified with a scoped test); `compileSnesData.js` now passes
`target: "snes"` in the `compileEntityEvents` options it builds. The editor's field bounds
(`src/lib/events/eventCameraMoveTo.js`) were separately widened from the hardcoded 12/14 to the
byte-arg ceiling (255) rather than made target-aware, since **no event field definition in this
codebase has access to project/scene context at definition time** (fields are static arrays,
`field.min`/`field.max` render straight into the number input) - real correctness now lives
in the compiler-side clamp above, which already accounts for the actual scene size.
A real `.gbsproj` (`test/projects/Test_Math`) now compiles to a bootable `.sfc` this way.
**Overlay row scaling (same class of bug, found later by the user).** `Overlay: Show` /
`Overlay: Move To` take a Y **tile row** (0 = full-screen overlay, 18 = just off the bottom
of the GB screen = hidden); the SNES BG3 overlay fills from that row to the bottom of the
screen, so an authored `18` on SNES stopped at row 18 and left a ~10-row strip covering the
lower screen ("the BG3 window still uses GB coordinates (144) to disappear instead of SNES
(224)"). Fixed in `scriptBuilder.js` `scaleOverlayRow(y)` — `round(y * getTarget(target).
screenTileHeight / 18)`, applied by both `overlayShow` and `overlayMoveTo` (`target` undefined
/ `"gb"` → ×18/18 → unchanged bytes, scoped test in `scriptBuilder.test.js`). Proportional
so row 0 stays full-screen and row 18 maps to row 28 = fully hidden; also fixes a latent
bleed-through where a "hidden" (row 18) overlay still showed under a dialogue box on SNES.
The editor field cap (`eventOverlay{Show,MoveTo}.js`, `y max: 18`) is left as-is — after
scaling it already spans full-screen…hidden on both targets.
**Overlay left d-pad movement dead (engine, user-found in the sample game).** `UIIsClosed()`
in `appData/src/snes/src/ui.c` gates `SceneHandleInput()` (game.c main loop); it treated
`ui_overlay` as a sticky boolean. `EVENT_OVERLAY_SHOW` sets it and only `EVENT_OVERLAY_HIDE`
clears it — `EVENT_OVERLAY_MOVE_TO` (slide the panel off-screen) does not. The stock sample's
Logo intro does `OVERLAY_SHOW` → `OVERLAY_MOVE_TO` away and never `OVERLAY_HIDE`, so from that
point on `UIIsClosed()` returned 0 and the player couldn't walk for the rest of the game
(`script_ptr` was 0 the whole time — not a stuck script; `SceneHandleInput` simply never ran).
Fixed to mirror GB (`win_pos_y == MENU_CLOSED_Y` counts as closed): an overlay whose current
**and** target row are `>= UI_SCREEN_ROWS` (28, the NTSC visible height in tiles) no longer
blocks input. Relies on the overlay-row scaling above so `OVERLAY_MOVE_TO(0,18)` lands exactly
on row 28. Verified in an offscreen SnesJs run: player stuck at the spawn tile before, walks
normally after (identical to a build that starts in that scene directly).
**Stray dark line at the screen bottom (same parked-overlay scenario, user-found).**
`ui_overlay_fill_from(row)` filled BG3 rows `row..31` with the fill tile. Rows 28-31 are past
the 224-line NTSC screen, but the SNES's +1-scanline quirk (and Mesen's capture) still shows a
sliver of row 28, so an overlay parked off the bottom (`OVERLAY_MOVE_TO` past row 28 — again
the Logo-intro case) painted a 1px full-width dark band along the bottom edge for the rest of
the game, its colour tracking the scene fade. Fixed: a parked position (`row >= UI_SCREEN_ROWS`)
now fills *nothing* — the overlay is hidden, rows 28-31 stay blank. A genuine on-screen curtain
still fills all the way down. Verified in Mesen: the stray line at screen y=230 is gone, a
full-screen stray-row scan is clean while walking all four directions, dialogue/menu box
unaffected.
**M9 editor asset feedback (done).** Two more editor spots were GB-hardcoded and are now
target-aware via `getTarget(settings.target)`: the **Backgrounds page size warnings**
(`src/components/assets/ImageViewer.js` → `src/lib/helpers/assetWarnings.js`) used a fixed
160×144 min / 256×256 max; they now read `screenTileWidth*8`×`screenTileHeight*8` (256×224 on
SNES) and `maxBackgroundWidth/Height` from the target. The `WARNING_BACKGROUND_TOO_SMALL/LARGE`
l10n strings gained `{width}`/`{height}` params (all 13 non-en locales updated). And the
**Scene info bar** (`src/components/world/Scene.js`): GB shows a per-scene sprite-frame VRAM
budget (`F: n/25`), SNES has a fixed OBJ sheet so it now shows distinct actor sprite *sheets*
instead (`S: n/8`, `SPRITE_SLOTS`; per-scene count, the project-wide cap is enforced by a
`compileSnesData` warning). New target fields: `maxBackgroundWidth/Height`, `maxSpriteFrames`
(gb 25 / snes null), `maxSpriteSheets` (gb null / snes 8) — `targets.test.js` guards them.
The rest of the "M9 gaps" in EVENTS.md turned out stale: GB Studio 1.2.2's editor already
renders raw full-colour PNGs everywhere (no DMG filter — the 4-shade conversion is
compiler-only) and the scene canvas is already sized from the background's tile dimensions.
Tests: `test/helpers/assetWarnings.test.js`.

**X / Y / L / R input (M12-cont., done — was the last deferred item).** The four input
opcodes (`IF_INPUT` / `AWAIT_INPUT` / `SET_INPUT_SCRIPT` / `REMOVE_INPUT_SCRIPT`) now carry a
**2-byte** little-endian button mask **on the SNES target only** — the extra byte holds
X / Y / L / R (`KEY_BITS` bits 8..11 in `compiler/helpers.js`). New target field
`inputMaskBytes` (gb 1 / snes 2, guarded by `targets.test.js`); `scriptBuilder.js`'s new
`inputMask()` helper reads it and the 4 input methods call it instead of `output.push(inputDec(…))`.
The **Game Boy engine, its byte-exact event tests and GB ROM output are byte-identical** — GB
still emits 1 byte. SNES side: `script_cmds.c` bumps those 4 opcodes' `args_len` by 1 (the *only*
place SNES arg lengths diverge from GB — `snesScriptCmds.test.js` now allows exactly that),
`SceneGbInputBits()` returns `u16` and packs all 12 buttons, `input_script_ptrs[]` →
`NUM_INPUT_SCRIPTS` (12), `await_input` → `u16`. Editor: `InputPicker.js` is now Redux-connected
and shows a third X/Y/L/R button row when `settings.target === "snes"`. The web player already
wired X/Y/L/R (fixed keys u/i/o/p) so no emulator-side change. Verified in Mesen (a scene with
`SET_INPUT_SCRIPT("x")` / `("r")` — both sub-scripts fired on the real presses, marker vars read
back 42 / 43 from WRAM). Tests: `scriptBuilder.test.js` (SNES 2-byte mask), `targets.test.js`,
`snesScriptCmds.test.js`.

- **`src/lib/compiler/targets/{gb,snes}.js`** — one descriptor per target, the single source
  of truth for every hardware-shaped constant (bank size, `minDataBank`, screen tiles, entity
  limits, …). `bankedData.js` and `consts.js` now read the Game Boy numbers from `targets/gb`;
  their values are unchanged, so all existing tests must still pass (`targets.test.js` guards this).
  `compileData.js` / `scriptBuilder.js` / `compileImages.js` are **not** target-aware yet — that
  lands in M6/M7 when there is a SNES data path to test it against.
- **`src/lib/compiler/snesgfx.js`** — the SNES counterpart of `ggbgfx.js` (M6 core). PNG →
  real extracted palette (≤16 colours, 8-bit RGB → 15-bit BGR555), SNES **4bpp planar** tiles
  (32 B/tile), tile dedup with H/V-flip matching, 16-bit tilemap (`tile | pal<<10 | prio<<13 |
  xflip<<14 | yflip<<15`). `imageToBGData(file)` for backgrounds; `imageToSpriteData(file)` for
  a sprite sheet's first 16×16 frame → 4 OBJ tiles. Pure helpers unit-tested; `decodeBGData()`
  inverts `imageToBGData` and `snesgfx.test.js` asserts a lossless round-trip.
  `targets/snes.js` `maxTilesetTiles` is the real 256-tile VRAM budget.
- **`src/lib/compiler/compileSnesData.js`** — the SNES data compiler (M7 phase 1). A
  denormalized project → `appData/src/snes/src/assets.{c,h}` in the engine's format: scene
  blobs, `event_ptrs[]` (script bytecode via the shared `compileEntityEvents` / `scriptBuilder`
  — opcode numbers identical to GB), `string_ptrs[]`, `bg_*_ptrs[]` (via `snesgfx.js`), and
  `START_*` defines. The only placeholders resolved here are the `__REPLACE:STRING_*` triples
  (→ a plain 16-bit `string_ptrs[]` index; no banked pointer, D4). `buildProject.js`
  `buildProjectSnes` runs it and writes the two files into the ejected engine tree before
  `buildSnesRom`. Runs `migrateProject` (idempotent) so legacy `EVENT_MATH_*` etc. compile.
  `src/lib/compiler/snesFixedAssets.js` provides the BG3 UI graphics + fallback sprite +
  palette shared with `gen-dummy-gfx.js`. **The UI font/frame/cursor are project assets, not
  built in** (user-found: the SNES box used a hardcoded `font8.pic` and a plain fill, no
  border or `>` cursor). `snesFixedAssets({ uiAssetDir })` now converts
  `assets/ui/{ascii,frame,cursor}.png` (the same files the GB target uses) to a BG3 2bpp tile
  blob: 224 glyphs (char 0x20..0xFF) + a solid fill (the `OVERLAY_SHOW` curtain,
  `UI_FILL_TILE`) + a 9-slice frame (`UI_FRAME_TILE0..+8`, drawn by `ui.c`'s new
  `ui_frame_box()`) + the menu cursor (`UI_CURSOR_TILE`), sharing one 4-colour palette (CGRAM
  16-19, mapped by luminance; BG3 index 0 stays transparent so an opaque box has ≤3 colours -
  a 4th snaps to nearest). `compileSnesData.js` `ensureSnesUiAssets()` backfills the three PNGs
  from `templates/gbhtml` if a project lacks them; `gen-dummy-gfx.js` uses that template dir.
  **Tile 0 (the space glyph) is forced fully transparent** - it doubles as `UI_BLANK` (every
  BG3 cell outside the box), and a non-transparent tile 0 showed through the transparent
  background of 2-colour scenes like the Logo/Title (they map their bg to BG1 index 0);
  `UI_CHAR(' ')` therefore draws the box-fill tile, not tile 0. VRAM: 235 2bpp tiles at
  `0x3000-0x375F`, clear of BG1 (`0x2000-0x2FFF`) and OBJ (`0x4000`).
  `test/data/compiler/snesFixedAssets.test.js` guards the blob shape.
  **Per-scene OBJ sheets (user-found: a 16-sheet project showed the player sprite for
  everything past the 8th).** The OBJ sheet used to be **one project-wide** 8 KB blob loaded
  at boot - 8 slots for the whole game. Now `compileSnesData.js` builds one 8 KB sheet **per
  scene** (`buildSceneSprites`): player always slot 0, that scene's own actor sheets 1..7,
  plus the fixed emotes (region 32-63) and only that scene's dialogue avatars (64-95). Deduped
  by content (a Logo + Title with no actors share one). Emitted as `src/assets_spr.asm` (one
  `superfree` section per blob - a single 816-tcc `.rodata` section is atomic and can't cross
  a 32 KB bank; `buildProject.js` writes the third file). The 8-palette CGRAM image is
  per-scene too and now bakes in the emote / avatar palettes at OBJ pal 1 / 2 (game.c's two
  `dmaCopyCGram` calls are gone). The scene blob gained a `[24]` table after `w,h`:
  `sprite_type[8]`, `sprite_frames[8]`, `sprite_pal[8]`; `SceneInit` DMAs `scene_spr_ptrs
  [scene_index]` / `scene_spr_pal_ptrs[scene_index]` and fills the now-**mutable** globals
  `sprite_{type,frames,pal}_for_slot[8]` + `sprite_slot_for_index` (= `scene_sprite_slot_ptrs
  [scene_index]`, for `PLAYER_SET_SPRITE`) from it. Per-scene ≤8 sheets covers the stock
  sample (Outside's 6, Cave's 4, …); a scene needing >8 still warns and overflows to slot 0.
  Verified in SnesJs: Cave's fire/sage/savepoint and House's seller/radio render their real
  sprites; dialogue + avatar + emote intact. Actor blob byte 4 = the **per-scene** slot;
  engine sets `frame_offset = slot*2`. Sub-scripts (`SET_INPUT_SCRIPT` / `SET_TIMER_SCRIPT`) use a `banked`
  shim → own `event_ptrs[]` slot; the engine now runs them for real too (M7-cont., see
  `appData/src/snes/README.md`), including a fix for `IF_INPUT`/`AWAIT_INPUT` comparing against
  raw PVSnesLib pad bits instead of the compiler's GB-layout button mask. **Actor sprite frames
  (M7-cont.).** Phase 1 (direction): a 3-frame `SPRITE_ACTOR` sheet's up/side frames go in two
  new 8-slot OBJ regions (`ACTOR_UP_TILE0=96`, `ACTOR_SIDE_TILE0=128`) appended after the
  actors/emotes/avatars regions - `placeTiles`'s fixed `16 + 2*slot` offset only stays
  collision-free for 8 slots per region (the `AVATAR_SLOT0` bug's cause), so a same-pattern new
  region beats widening slot 0-7. `SceneRenderActors` computes facing (`down`/`up`/`side`+flip)
  fresh every render call from `dir_x`/`dir_y` (mirroring GB's `SceneRenderActor_b`), so
  `EVENT_ACTOR_SET_DIRECTION` works with no extra opcode plumbing. **Phase 2 (walk-cycle
  animation).** A 6-frame `SPRITE_ACTOR_ANIMATED` sheet (down-a/down-b/up-a/up-b/side-a/side-b)
  walk-cycles its 2 poses per direction while moving; OBJ sheet grew 160→256 tiles (full first
  name page) with 3 more regions for the "B" poses (`ACTOR_DOWN_B_TILE0=160`, `_UP_B=192`,
  `_SIDE_B=224`). Per-actor `sprite_type` is now movement-aware (matches GB's `spriteTypeDec`):
  6-frame on a *non-moving* actor = `SPRITE_STATIC` `frames_len` 6 (manual/auto cycle of all 6 -
  a torch), not a walk cycle. Actor scene-blob entry grew 7→9 bytes (`anim_speed`, `animate`
  added); `compileSnesData.js` emits `sprite_frames_for_slot[]` (1/3/6) so `SceneInit` derives
  `frames_len`. `scene.c`'s `SceneAnimateActors` (ported from GB's frame-cycle loop) steps
  `actors[i].frame` on the /8 tick, gated by `anim_speed` (4 fastest..0 slowest, default 3),
  while `moving` or `animate`; a new `actors[i].anim_hold` counter bridges the 1-frame `moving`=0
  dips at tile boundaries (else a walking sprite stutters/resets); idle settles to pose 0.
  Verified in Mesen (real OAM tile/flip): player + a random-walk NPC both cycled A↔B correctly
  per direction, snapped to standing when idle; 3-/1-frame sheets provably unchanged
  (`frames_len` 1 → `SceneAnimateActors` skips; `SPRITE_ACTOR` render path byte-identical to
  phase 1).
  **N-frame `animated` sheets (user-found: the sample's 2-frame duck / 4-frame torch didn't
  animate).** `snesgfx.js` only recognised 3- and 6-frame sheets; 2/4/5-frame "animated"
  sheets read frame 0 only. Now `imageToSpriteData` keeps every frame for 2-6, `spriteType`
  `SPRITE_STATIC` (an auto-cycle, not a walk/direction sheet). `compileSnesData.js`
  `placeDirectionFrames` puts frame f into the f-th of `[downA, downB, upA, upB, sideA, sideB]`
  - the same regions the engine's `SPRITE_ACTOR_ANIMATED` and 6-frame-`SPRITE_STATIC` render
  paths already read by frame number - so `scene.c` only needed `frames_len_for` widened to
  `n ∈ {2,4,5,6}` (n==3 stays a directional `SPRITE_ACTOR`, frame 0). Verified in SnesJs: the
  duck's OAM tile alternates `2k` ↔ `160+2k` (frame 0 ↔ 1). Test: `snesgfx.test.js`.
  **Actor sprite Y offset (user-found: "the rock is not on the stair").** `SceneRenderActors`
  drew the 16×16 OBJ at `actors[i].y - scroll_y - 8`, putting every sprite a full tile too
  low. GB positions it so the feet sit at the bottom of the actor's tile (`pos.y = tile*8+8`,
  GB OAM shows at `pos - {8,16}`); SNES now matches with `- 16` (emote bubble `- 24` → `- 32`).
  **`can_step` blocked the player a tile early (user-found: "can't leave the shop").** It
  tested a **2×2** tile footprint - `col_solid(tx+2, …)` / `(…, ty+2)` two tiles ahead of the
  actor - so the player couldn't step onto a tile with a wall just past it (the sample's house
  door has a solid tile one row below the exit trigger, so the trigger never fired). Now
  matches GB exactly: footprint = the destination tile `(tx+dx, ty+dy)` and the one to its
  right (the 16px-wide-sprite fudge). Verified in SnesJs: player walks through the door and
  `SWITCH_SCENE` fires. Broad collision behaviour change but a strict GB match; all fixture
  ROMs still build + boot.
  **Per-sprite OBJ palettes (done).** Each used sprite slot draws its own 16-colour OBJ
  palette. The SNES has 8 OBJ palettes (CGRAM 128..255); palettes 1 and 2 stay reserved for
  the emote bubbles / dialogue avatars, so `compileSnesData.js` assigns actor sprite slots
  from `ACTOR_OBJ_PAL_POOL = [0,3,4,5,6,7]` (a 7th/8th distinct sheet reuses palette 0) and
  emits `sprite_pal_for_slot[8]`. `spr_pal` grew from one palette to the whole OBJ CGRAM image
  (8×32 B); `game.c`'s `oamInitGfxSet` uploads it wholesale, then its emote/avatar
  `dmaCopyCGram` calls reclaim palettes 1/2. `scene.c`'s `SceneRenderActors` passes
  `sprite_pal_for_slot[actors[i].frame_offset >> 1]` as the OAM palette (`frame_offset` is
  always `slot*2`, so no new struct field / `SceneInit` change / `PLAYER_SET_SPRITE` change -
  a slot swap picks up the new palette for free). Verified in Mesen (Test_ActorInvoke: player
  on OBJ pal 0, the signpost NPC on OBJ pal 3, real CGRAM contents distinct; emote pal 1 /
  avatar pal 2 intact after the wholesale upload).
  `test/data/compiler/compileSnesData.test.js`: 12 `test/projects/*` fixtures compile through
  `compileSnesData`; 6 (Test_Math, Test_CombinedMath, Test_ActorStoreDirection, Test_RelativePos,
  Test_SceneState, Test_ActorInvoke) build end-to-end to a bootable `.sfc` when the vendored
  toolchain is present, and boot + run in Mesen.
- **`src/lib/compiler/buildSnesRom.js`** — replaces `makeBuild.js` for SNES. Pure JS orchestration
  (no `make`/shell): generates `hdr.asm` from `devkitsnes/include/hdr.asm.in`, runs
  `816-tcc → 816-opt → wla-65816` per `.c` and `wla-65816` per `.asm`, builds `linkfile`
  (+ `pvsneslib/lib/LoROM_FastROM/*.obj`), `wlalink` → `build/rom/game.sfc`. LoROM + FastROM,
  SRAM 8 KB, auto header (no JS header patching). Runs `816-opt` with `-q` (mirrors the
  `snes_rules` edit) and its `filterLog` also strips ANSI colour codes and drops the pure
  banner noise (`816opt: (x) version …`, the wla/wlalink box rule lines) so "Build & Run" /
  "Export ROM" output stays legible — `spawnTool` skips any line `filterLog` empties.
- **`appData/src/snes/`** — the engine tree. Ported so far: `src/game.c` (M3 — Mode 1 BG,
  OAM player, d-pad, camera scroll; M5 — camera pan/lock/shake), `src/script_runner.c` +
  `src/script_cmds.c` (M4 — the bytecode VM), `src/scene.c` (M4b — scenes from `assets.c`
  `scenes[]`/`event_ptrs[]` blobs: palette, NPC actors, triggers, `SWITCH_SCENE`, A-button
  interaction; M4c — tile-locked movement, per-scene collision bitmap, `ACTOR_MOVE_TO` family,
  `IF_ACTOR_AT_POSITION`, `ACTOR_GET_POSITION`/`LOAD_VECTORS`, minimal NPC AI),
  `src/ui.c` + `src/fade.c` (M5 — `TEXT` dialogue box on BG3 with typewriter + `$NN$` vars,
  `FADE_IN`/`FADE_OUT` via `setBrightness`, `SWITCH_SCENE` fade handshake; M5b — `CHOICE` /
  `MENU` via `UIShowMenu`, `>` cursor + Up/Down + A/B; M5c — `ACTOR_EMOTE` bubble
  (`SceneStartEmote`, OBJ palette 1, images from `tools/emotes.png`); M5d — word-wrap,
  `TEXT_WITH_AVATAR` (OBJ palette 2, portrait per project via the sprite pipeline),
  `OVERLAY_SHOW`/`HIDE` (BG3 panel, row-targeted, independent of the dialogue box); M5e — box
  slide-in/out (`bgSetScroll` on BG3), 2-column `MENU` layout, `OVERLAY_MOVE_TO` (animates the
  covered row, blocks the script until it arrives)). M6 — `SceneInit` uploads the BG
  tiles/map/palette/size per scene from `assets.c` `bg_*_ptrs[]`; `gen-dummy-gfx.js` feeds a
  real background through `snesgfx.js`. `src/music.c` (M8) — `MUSIC_PLAY`/`MUSIC_STOP`/`SOUND_*`
  wired to PVSnesLib's snesmod driver (all `spc*` in `libc.obj` — nothing to vendor).
  **Sound effects layered over music (done).** `SOUND_PLAY_BEEP`/`_START_TONE`/`_PLAY_CRASH` play
  a short BRR sample through snesmod's dedicated BRR sound region — `spcAllocateSoundRegion(8)`
  (2 KB) in `MusicInit`, then `spcSetSoundEntry` + `spcPlaySound` per event — which mixes on top
  of the module instead of the old `spcStop`/session reload. Samples: `res/sfx_beep.brr` (square
  blip, beep+tone) + `res/sfx_crash.brr` (noise), two tiny generated waveforms
  (`appData/src/snes/tools/gen-sfx.js` synthesises `.wav`s and encodes with vendored `snesbrr`);
  `.brr` + `res/sfx.h` (byte lengths) + `src/res/sfx.asm` (`.incbin`, under `src/` for `make`)
  all committed. GB pitch 0-7 → BRR pitch 1-6; `SOUND_STOP_TONE` still a no-op (one-shot sample).
  Verified in Mesen: music voice held env ~2016 through a 10-effect burst on a separate voice.
  **M8 phase 2 (project music, done)** — `src/lib/compiler/mod2it.js` converts a 4-channel
  `M.K.` ProTracker `.mod` to the minimal Impulse Tracker `.it` snesmod's `smconv` accepts
  (one pass-through instrument per sample, 8-bit signed, IT packed patterns; Amiga slides →
  IT linear slides, a few PT effects dropped — documented lossy). `src/lib/compiler/compileSnesMusic.js`
  (run by `buildProjectSnes` after `compileSnesData`) runs `smconv -s -b 5` over
  `res/effectssfx.it` (always soundbank module 0) + one converted `.it` per project song
  (modules 1..N, in `getMusicIndex` order → `MUSIC_PLAY` track N loads `spcLoad(1+N)`), and
  writes `res/soundbank.{bnk,h}` + `src/res/soundbank.asm` + generated `res/soundbank_banks.h`.
  A soundbank > 32 KB is split by smconv into `SOUNDBANK__0/1/...` on consecutive banks (5,6,…);
  `soundbank_banks.h`'s `MUSIC_SET_BANKS()` macro `spcSetBank()`s each chunk reverse-order
  (`music.c` `MusicInit` calls it). A track that can't be read/converted falls back to the
  effects module (silent, warned) so later tracks keep their index. No project music → the
  committed proof-of-concept soundbank is kept untouched. `mod2it.js`'s `.incbin` path in the
  smconv `.asm` is rewritten from smconv's absolute path to tree-relative `res/soundbank.bnk`
  (eject/`make` safe). Verified in Mesen the phase-1 way: after a scene `MUSIC_PLAY`,
  `spc.dsp.voices[*].envVolume` ramps to ~2016 with active BRR decode (~200/300 frames), not
  silence. Tests: `test/data/compiler/compileSnesMusic.test.js` (`mod2it` always-on;
  full `.mod`→2-bank soundbank→`.sfc` toolchain-gated).
  `src/save.c` (M7-cont.) — `LOAD_DATA`/`SAVE_DATA`/`CLEAR_DATA`/`IF_SAVED_DATA` cartridge SRAM
  save game via PVSnesLib's `consoleCopySramWithOffset`/`consoleLoadSramWithOffset` (no raw SRAM
  pointer on this toolchain, unlike GB's `0xA000` window); saves a small header (exists flag,
  scene, player tile pos/facing) then `script_variables[]`, matching GB's exact save scope
  (player + variables only). Found a real bug via testing: checking the exists flag for
  truthiness instead of exact equality (`== 1`) misreported "save exists" on a fresh cartridge,
  since Mesen (realistically) fills a freshly-created `.srm` with random garbage, not zeros.
  `src/assets.{c,h}` is committed dummy data (`tools/gen-dummy-gfx.js`), replaced in M6.
  `src/gbs_types.h` mirrors GB `GameTypes.h` (`BANK_PTR` is a plain far pointer, D4).
  `test/data/compiler/snesScriptCmds.test.js` enforces that `script_cmds.c`'s opcode/args_len
  table matches `scriptCommands.js` **and** the GB `ScriptRunner.c` table.
- **816-tcc traps hit so far** (all worked around in `appData/src/snes/src/`): a far read of a
  *mixed-size struct field* mis-indexes (⇒ the opcode table is two parallel arrays built from
  the `SCRIPT_CMD_TABLE` X-macro, not `{fn, args_len}` structs); a **3+-term `&&`/`||` chain in
  a conditional** mis-links its branches so the false path falls into the block (⇒ one test per
  `if` — `actor_on_tile`, `in_box`, `col_solid`, `can_step`); `s8` params mangled in 3-arg
  calls (⇒ use `s16`/`int`); no pointer arithmetic across a bank boundary; **zero-init
  (`.bss`-style) globals are not reliably pre-zeroed** — only explicitly-initialized
  (`.data`-style) globals are safe to assume a known value at boot, so every `u8 foo;` (no
  initializer) needs an explicit reset in its module's `*Init()` (bit us in M5d: `UIInit()`
  reset 2 of 6 UI statics, the other 4 held boot garbage and silently disabled d-pad input); a
  function with a struct-by-value parameter assigned straight into a global (`g = param;`) can
  reference a `_locals` stack-frame symbol the compiler never defines when the function has no
  other local variable, so `wlalink` fails with "Unresolved reference to `__FnName_locals`" —
  assign the parameter to a genuine local first (`T t = param; g = t;`) to force the frame to be
  emitted (bit us in M7-cont.: `SceneSetTimerScript(u8, BANK_PTR)`).
- **Build the SNES tree standalone** (no app): `yarn jest buildSnesRom` runs `buildSnesRom.js`
  against the vendored toolchain and asserts a bootable ROM. There is no Node in the packaged
  environment historically — a Node 16 was added at `C:\Applis\nodejs16` (see Claude memory).
  A user's own "Eject Build" also has to compile with plain `make` (no Node/Electron at all) via
  `appData/src/snes/Makefile` + the vendored `devkitsnes/snes_rules` (M11 eject check) — this
  is a genuinely separate code path from `buildSnesRom.js` (which walks the whole ejected tree
  recursively for `.c`/`.asm` files; `snes_rules` only wildcard-scans `src/` and its first two
  subdirectory levels), so a file `buildSnesRom.js` happily finds anywhere can still be invisible
  to real `make`. Caught exactly this for `src/res/soundbank.asm` (the M8 phase 1 soundbank) -
  it lived in `res/` (a sibling of `src/`, matching neither `snes_rules`' patterns) and linked
  fine through the app but failed `make` with "Unresolved reference to SOUNDBANK__"; fixed by
  moving just the `.asm` to `src/res/soundbank.asm` (its `.incbin`/`.include` paths are resolved
  relative to the tool's working directory - the project root - not the `.asm` file's own
  location, so nothing else needed to move). Verified with a real `PVSNESLIB_HOME`-pointed
  `make` run (MSYS `make`/`sh` at `C:\svgexterne\...\ndsdev\msys\bin`, see Claude memory) against
  the *vendored* (not the external full) PVSnesLib copy, producing a ROM that boots in Mesen.
- **Toolchain** vendored (subset) under `buildTools/<platform>-<arch>/pvsneslib/` — PVSnesLib
  V4.7.0 `devkitsnes/{bin,tools,include,snes_rules}` + `pvsneslib/{include,lib}`, for
  `win32-x64`, `linux-x64` and `darwin-x64` (native binaries per platform; the unix ones carry
  a forced exec bit in the index since `core.fileMode` is `false` here). `smconv.spc` (the
  platform-independent SPC700 driver blob) travels in every `tools/`. Only 64-bit hosts (no
  `win32-ia32`). Decisions log + roadmap live in Claude memory (`snes-port-effort`).
- **`appData/snes-js-emulator/`** — M10 (Play button / web export), the SNES counterpart of
  `appData/js-emulator` (GameBoy-Online, the GB target's bundled JS emulator). Vendors
  [angelo-wf/SnesJs](https://github.com/angelo-wf/SnesJs) (MIT, pure JS, LoROM-only — matches
  this project's own D3 LoROM+FastROM decision) for the actual 65816/PPU/SPC700 emulation core;
  `js/main.js`, `index.html`, `css/style.css` are this project's own, wiring the vendored core to
  a `fetch("rom/game.sfc")` auto-boot instead of upstream's file-picker UI, and to the project's
  own Settings > Controls mapping (same `customControls` JSON shape as the GB template — X/Y/L/R
  aren't in that GB-era settings page so they're bound to fixed keys u/i/o/p, but the engine
  *does* read them now, so scripts using X/Y/L/R work in the web player).
  `buildProject.js`'s `buildProjectSnes` now accepts `buildType` and, for `"web"`,
  calls a `buildWebPlayer` helper shared with the GB path (extracted from what used to be
  GB-only inline code) that copies the emulator tree + built ROM into `build/web` and templates
  `index.html`'s placeholders — the "Play" button (`AppToolbar.js`, already target-agnostic) now
  works for an SNES project instead of silently failing to find a `build/web/index.html` that
  was never created. Verified by loading a real project's built web page in an offscreen Electron
  `BrowserWindow`: console log confirmed `Snes.loadRom` parsed the actual cartridge header
  ("Loaded LoROM rom ... Banks: 8; Sram size: $2000"), audio initialized, and ~93% of the 512×480
  canvas was non-black after a few seconds of emulation (real PPU output, not a blank/frozen
  frame). Not cycle-accurate (SnesJs's own limitation) — a quick in-app preview, not a reference
  emulator; Mesen remains the reference used to verify the engine itself.
  **Web-player polish (done).** The shell (`index.html`/`css`/`js/main.js`, all project-authored)
  now has: a **start-gate** overlay (Play button — boots + renders one frame, runs on click,
  which also gets audio past the browser autoplay policy on touch-only devices — the old version
  never resumed audio without a keypress); an **on-screen touch pad** (d-pad + A/B + Start/Select),
  auto-shown on `(pointer: coarse)`, toolbar-toggleable, multi-touch via per-pointer tracking +
  `setPointerCapture`; a toolbar (pause/resume, soft reset, pad toggle, fullscreen); auto-pause
  when the tab is hidden. **Cartridge SRAM persistence:** `main.js` mirrors `snes.cart.sram`
  (what `SAVE_DATA`/`LOAD_DATA` write) into `localStorage` (base64, keyed by `document.title`),
  restored after `loadRom`+`reset(true)`, flushed on a 5 s hash-gated poll + `pagehide`/
  `beforeunload` — so a saved game survives a reload. No full save-state (SnesJs doesn't
  serialize machine state). Verified with an offscreen Electron round-trip (poke `sram`, wait
  past the poll, reload → bytes restored; canvas 93% non-black after clicking Play).
  `test/data/compiler/snesWebPlayer.test.js` covers the template shape + the `buildType: "web"`
  export (toolchain-gated).
  **In-app play window / old-Chromium CSS (fixed).** The same shell runs in two very different
  browsers: a modern one (web export) and the app's own bundled Chromium (Electron 4 →
  Chromium 69, `src/index.js` `createPlay`). The first cut used `aspect-ratio`, `inset:` and
  flex `gap` — none of which Chromium 69 supports — so in-app the shell overflowed and the
  start-overlay's **Play button landed below the small (494×471, GB-sized) play window**: the
  game just showed the black boot frame with no visible way to start it (reported as "the
  emulator always gives a black screen; the ROM is fine in Mesen"). Fixes: `css/style.css`
  avoids all three (explicit `top/right/bottom/left`, `margin` instead of `gap`, no
  `aspect-ratio`); `js/main.js` `layoutScreen()` sizes `#screen` to the largest 512:480 box
  that fits the window (JS, re-run on `resize`); and `createPlay` opens a 560×600 window when
  `buildGame.js` passes `target: "snes"` on the `open-play` IPC (GB path unchanged). The
  Jest test now asserts the CSS stays free of those features and that `layoutScreen` exists.
- **Opcode audit (M11)** — the SNES README's "no opcode left as a meaningless Noop" claim was
  stale: re-checking `script_cmds.c` row-by-row against `scriptCommands.js` found 4 opcodes with
  a real GB implementation still `Script_Noop_b`: `PLAYER_SET_SPRITE`, `TEXT_SET_ANIM_SPEED`,
  `TEXT_MULTI`, `ACTOR_SET_FRAME_TO_VALUE` (two others, `RETURN_TO_TITLE`/`OVERLAY_SET_POSITION`,
  are genuinely `Noop` in the GB reference too - matching that is correct, not a gap). All 4 now
  real: `TEXT_SET_ANIM_SPEED` made the box slide-in/out and typewriter speed real runtime state
  (`ui.c`'s `ui_slide_in_speed`/`ui_slide_out_speed`/`ui_text_speed` + a shared frame-skip gate
  mirroring GB's `UIUpdate_b()` thresholds) instead of hardcoded constants; `TEXT_MULTI` (a
  compiler-internal opcode bracketing multi-page `TEXT` events to keep the box visually open
  across pages) just saves/restores those same two speeds, exactly like GB's own handler;
  `ACTOR_SET_FRAME_TO_VALUE` mirrors the already-real `ACTOR_SET_FRAME` reading a variable
  instead of a literal (equally inert today, since `frames_len` is hardcoded to 1 everywhere -
  no manual frame-cycling yet, matching the sprite-direction-frames Phase 1 scope). The
  architecturally real one is `PLAYER_SET_SPRITE`: GB streams the target sheet into VRAM at
  runtime from its full per-project bank; this engine has no such streaming, so
  `compileSnesData.js` now emits `sprite_slot_for_index[]` (project sprite index → pre-loaded OBJ
  slot, or `0xFF` if that sheet was never used by any actor/the player anywhere) and
  `sprite_type_for_slot[]`, and `Script_PlayerSetSprite_b` looks up the slot rather than actually
  streaming new tiles - a documented restriction (switching to a never-used sheet is a silent
  no-op), not a fix of GB's actual runtime-swap capability. Verified all 4 together in Mesen: a
  multi-page `TEXT` → `TEXT_SET_ANIM_SPEED` → another `TEXT` → `ACTOR_SET_FRAME_TO_VARIABLE` →
  `PLAYER_SET_SPRITE` → marker-variable sequence, advanced via a Lua script driving
  `emu.setInput({a=...}, 0)` to press A - the marker variable read back correctly from WRAM
  (proving no VM hang across all 4 opcodes) and the player's real PPU OAM tile (sprite 0, byte 2)
  showed the switched-to sheet's tile, not the original one.
  The follow-up doc from that audit is **`appData/src/snes/EVENTS.md`** (M11 step 3) — a per-event
  GB-vs-SNES support matrix (Full / Partial / Inert / same-as-GB) covering every scripting event
  plus the editor-side M9 gaps; linked from the SNES README. Keep it in sync when an opcode's
  runtime behaviour changes.
- **Perf profile (M11 step 1) — `appData/src/snes/PERF.md`.** Measured in Mesen against real
  stress ROMs: ROM (77% of 4 used banks, spills to empty banks / 128-bank max), WRAM (14%),
  VRAM (~58%, 256-tile BG cap is the only real limit), ARAM (snesmod-managed) all have headroom.
  The one soft spot is CPU: a typical scene holds locked 60fps, but even a 9-*static*-actor
  32×32 scene already burns ~75% of the active-frame budget in `SceneUpdate`+`UIUpdate`+
  `CameraUpdate` (816-tcc codegen is slow), so a scene with 6+ *simultaneously moving* actors
  drops the odd frame (~54fps, graceful). Method: compare the `time` main-loop tick counter
  (WRAM, from `game.sym`) against PPU `endFrame` events over ~15s, player walked via
  `emu.setInput`. One cheap safe fix applied (`SceneRenderActors` only walks used OAM slots);
  hand-asm optimisation of the render/actor hot path is deliberately deferred (high risk,
  low confidence) - see PERF.md's "future work".
- **`appData/templates/snesblank`** (M11) — a "Blank Project (SNES)" option in the New Project
  screen (`Splash.jsx`), alongside the existing `blank`/`gbhtml` (both GB) templates. Reuses the
  `blank` template's assets as-is (a PNG background/sprite sheet's pixels are target-agnostic;
  `snesgfx.js` converts them the same way regardless) — only `project.gbsproj`'s `settings`
  differ (`target: "snes"`, `snesRegion`/`snesSramSize` defaults) plus `playerSpriteSheetId`
  pointed at the template's 3-frame `actor` sheet instead of the 6-frame `actor_animated` one,
  so a new SNES project's player shows real directional facing immediately (M7-cont. phase 1)
  rather than defaulting to a sheet that's still frame-0-only on this target. Covered by
  `test/data/project/snesTemplate.test.js` (new, permanent — no test coverage existed for
  `createProject`/templates at all before this): scaffolds via the real `createProject()`,
  confirms `migrateProject` doesn't choke on it, and drives it into `compileSnesData` far enough
  to hit the expected "no scenes yet" error (proving the template's asset/settings shape is
  otherwise sound) rather than some earlier, unexpected failure.
- **`appData/templates/sneshtml`** — a "Sample Project (SNES)" option, the SNES version of the
  `gbhtml` sample game (8 scenes / 8 backgrounds / 16 sprite sheets: Outside, Cave, House,
  Underground, Title Screen, Menu, …). A verbatim copy of `gbhtml` with `settings.target: "snes"`
  + region/SRAM defaults; every event the sample uses is on the SNES support list and it
  compiles + links to a bootable `.sfc` (the `snesTemplate.test.js` `sneshtml` describe covers
  both the `compileSnesData` pass and a toolchain-gated end-to-end build). All 8 backgrounds
  are now SNES-sized: the 5 room scenes (cave/house/logo/menu/titlescreen) were hand-redrawn
  160×144 → 256×224, and the 3 scrolling scenes (outside/stars/underground, already 256×256)
  were recoloured off the 4 flat DMG greens to a per-scene palette (a straight 1:1 colour LUT,
  so tile dedup / collision are byte-unchanged — the mapping lived in a throwaway script, not
  committed). Still 4 colours per image; the art is simple but no longer reads as Game Boy.

### SNES port — state & what's left (as of 2026-09-06)

The port is **functional end to end**: create an SNES project in the app → script it (dialogue,
menus, actors, camera, SRAM save, music) → Build ROM → Play (bundled JS emulator, with touch
controls + saved-game persistence). GB non-regression suite stays green. Milestones M0–M8 done;
M9 done (the editor is data-driven — full-colour previews, target-aware scene geometry / asset
warnings / sprite budget; X/Y/L/R input now built too); M10 done; M11 code-side done.
**M12 (playing the sample game for real, user-driven):**
the stock 8-scene sample now plays start-to-finish on SNES — UI graphics from the project's
own `assets/ui` PNGs, per-scene sprite sheets (16-sheet projects), N-frame `animated` sprites,
GB-matching collision + sprite Y offset, off-screen overlay no longer freezing the player, and
all 8 sample backgrounds now SNES-sized (5 room scenes redrawn at 256×224, 3 scrolling scenes
recoloured off the DMG greens).

Real remaining **code** gaps, most impactful first:
1. **≤8 sprite sheets + ≤6 distinct OBJ palettes _per scene_** — sheets are loaded per-scene
   now (not project-wide), so this only bites a single scene with 9+ distinct actor sheets;
   the extras fall back to slot 0 / palette 0 (emote+avatar hold 2 of the 8 OBJ palettes).
2. **No full save-state in the web player** — SRAM (saved games) persists across reloads now,
   but a mid-play emulator snapshot would need SnesJs machine-state serialization it doesn't have.
3. **Only two built-in sound effects** (a beep + a noise burst) — GB Studio 1.2.2 has no
   per-project SFX assets, so there's nothing to convert; a richer set would just be more
   committed BRR samples.

Done since (M12, playing the sample end to end): **UI graphics from the project's `assets/ui`
PNGs** (font + 9-slice frame + menu cursor, was a hardcoded font + plain fill). **Per-scene
sprite sheets** (`buildSceneSprites` + `src/assets_spr.asm`; a 16-sheet project no longer
shows the player sprite for the overflow). **N-frame `animated` sprites** (2/4/5-frame ducks
and torches cycle). **`can_step` collision** now matches GB (was a 2×2 footprint blocking the
player a tile early). **Actor sprite Y offset** `-8`→`-16` (feet on the tile, matching GB).
**Off-screen overlay no longer blocks d-pad movement** + overlay row scaled GB→SNES + **no
stray dark line at the screen bottom** from the parked overlay's fill tiles. **In-app
Play black screen** (old-Chromium CSS + window size). **All 8 sample backgrounds SNES-sized**
(5 room scenes redrawn at 256×224 + scenes resized/collision re-strided; 3 scrolling scenes
recoloured off the DMG greens, 1:1 LUT so collision is unchanged). **X / Y / L / R input**
(SNES-only 2-byte button mask on the 4 input opcodes; GB output byte-identical — see the M9
section above).
Before M12: **Sound effects layered over music**, **M9 editor asset feedback**, **M10
web-player polish**, **Per-sprite OBJ palettes**, **Project music (M8 phase 2)**.

Not code: a tagged release (trivial), a full demo game (art/music/level design), and the
roadmap's "GB→SNES asset conversion assistant" (dubious value now — assets are data-driven; it
would reduce to a compile-time warning if a background exceeds 15 colours per palette region).

## The engine (`appData/src/gb/`)

Plain C for GBDK. `game.c` is the main loop (`SceneInit`/`SceneUpdate`, fade, stage switch).
`ScriptRunner.c` is the bytecode VM. `*_b.c` files are the banked halves of a module
(`Scene_b.c`, `UI_b.c`, `ScriptRunner_b.c`) reached through `BankManager.c` /
`PUSH_BANK`/`POP_BANK`. `MusicManager.c` + `gbt_player.s` play tracks. `include/game.h` holds
screen/actor constants and the palette macros that `makeBuild.js` string-replaces.
This whole tree is what a PVSnesLib port replaces (parallel `appData/src/snes/`), keeping the
opcode numbers and the `data_ptrs` contract stable so the JS compiler barely changes.

## Tests

Jest under `test/`, mirroring `src/lib` (`test/events/*` one per event, `test/data/compiler/*`,
`test/helpers/*`, `test/migrate/*`, `test/reducers/*`). Fixture projects in `test/projects/`.
Event tests assert the exact opcode byte sequence a `compile()` produces, so changing an
opcode or arg order is a breaking change caught here. `test/compile.test.js` and
`test/sum.test.js` are empty stubs.

## Conventions

- ES modules everywhere in `src/`; `import`/`export`. Class properties + async/await enabled by
  Babel plugins.
- eslint rules relax airbnb noticeably (`no-plusplus`, `no-bitwise`, `no-await-in-loop`,
  `no-underscore-dangle` all off) — bitwise/loop-heavy compiler code is idiomatic here.
- 8-bit/16-bit split helpers: `src/lib/helpers/8bit.js` (`hi`, `lo`, `decHex`, `decHex16`).
- Asset path resolution goes through `src/lib/helpers/gbstudio.js` `assetFilename()`.
- Localization: `src/lib/helpers/l10n.js`, strings in `src/lang/`.

## Note

A Codex config exists at `~/.codex/config.toml`. To import its user-level items (MCP servers,
slash commands, subagents, skills, instructions) into Claude Code, reply `/import` to scan and
list what's importable, then `/import --yes=<digest>` to apply. Do not read that file directly.
