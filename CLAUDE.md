# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**GB2SNES Studio** — a visual retro game maker for the Super Nintendo, built with PVSnesLib. It
is an Electron desktop app (the editor: React/Redux Toolkit, webpack + TypeScript) plus a C
game engine (`appData/src/snes/`) cross-compiled with the PVSnesLib toolchain (816-tcc/
wla-65816/wlalink). The working copy lives under a `gbsnes-studio` directory (see *History*
below for why). SNES is the only compile target this app builds for — there is no Game Boy
engine, toolchain, or target-selection concept left anywhere in the tree.

Branding: **GB2SNES Studio** (v4, renamed from "SNES Studio" — that name turned out to already
be used by another, unrelated project) is the display name a user actually sees: the splash
screen, the About window, the app toolbar's window title, `src/*.html`'s `<title>`s, and every
locale string in `src/lang/*.json` (all locales — the name isn't translated, it's embedded
verbatim in every language's sentences). This rename was deliberately scoped to display text
only — nothing else changed. `productName`, `forge.config.js` names, the npm `name`,
`executableName`, Squirrel/Store names and CI artifact names are still `SNES Studio` /
`snes-studio` / `snes_studio` / `snesstudio` (not yet renamed — a separate decision from the
display brand, left alone since it touches installer/CI naming rather than anything a user
reads). `src/hooks/notarize.js`'s packaged-app path (`"SNES Studio.app"` etc.) and
`src/bin/snes-studio-cli.ts`'s own usage text correctly still say `SNES Studio`/`snes-studio` -
they reference the *actual* packaged/binary names, not display text, so they must keep matching
whatever `productName`/the CLI's own filename really are until (if ever) those are renamed too.
`menu.js`'s `openAbout()` sets `product_name: "GB2SNES Studio"` explicitly for exactly this
reason - without it, the About window would fall back to `package.json`'s own unrenamed name.
Still `gbstudio`-flavoured (not renamed on purpose, unrelated to the "SNES Studio"→"GB2SNES
Studio" rename above): the `src/lib/helpers/gbstudio.js` module, and the `gbstudio.dev` doc/
download URLs (point at the upstream site). `appBundleId` (`forge.config.js` +
`src/hooks/notarize.js`, which needs its own matching copy) **was** `dev.gbstudio.gbstudio` but
is now `dev.gb2snes.gb2snesstudio` (user-asked, reversing the earlier "left alone" decision) -
a macOS app identity (CFBundleIdentifier), not literally the same kind of "display text" the
GB2SNES Studio rename covered, so changing it has one real, narrow consequence: any existing
macOS install built under the old ID is treated as a different app afterward (loses window
position/zoom prefs, `.gbsproj` Launch Services file-type association needs re-registering).
Low-risk here since CI doesn't actually sign/notarize yet (`forge.config.js` skips `osxSign`
without an Apple identity - see below), so there's no notarization ticket pinned to the old ID
to break. `updateChecker.js` points at the GitHub repo `alekmaul/gbsnes-studio` to *check*
the latest release version (`github.repos.getLatestRelease`) — but the "Download"
button in both the update-available dialog (`updateChecker.js`) and the
project-from-a-newer-version dialog (`migrateWarning.js`) opens
`https://portabledev.itch.io/gbsnes-studio`, not a GitHub releases page: GitHub is the version
source of truth, itch.io is where a user actually gets the binary. Neither the git repo name
nor the itch.io URL changed as part of the GB2SNES Studio rename (explicitly out of scope).
**This was broken for a long time and nobody had noticed (user-found, v4): `updateChecker.js`'s
real code had `owner: "chrismaltby", repo: "gb-studio"` - checking the *upstream* GB Studio
project's own releases, nothing to do with this fork at all - and both its own Download button
and `migrateWarning.js`'s matching button opened `gbstudio.dev/download` (upstream's page), not
itch.io.** Confirmed via `git log -p --follow` that this isn't a mistake introduced recently:
`main`/v1 once had this correctly pointed at `alekmaul`/`gbsnes-studio` and itch.io (commits
"Point the 'Download' update prompts at our own releases" and "...at itch.io instead of GitHub
releases"), but `v2`'s M1 milestone ("import GB Studio 2.0.0-beta5 sources" - a wholesale fresh
vendor import, not a merge, per this file's own *History* section) silently brought in
upstream's own unmodified `updateChecker.js`/`migrateWarning.js`, discarding that fix - and it
was never re-applied through `v2` → `v3` → `v4`. The paragraph above describing the "correct"
behavior was itself wrong, describing intent that had silently stopped being true for three
whole generations. Fixed: both files now check/link `alekmaul/gbsnes-studio` and
`portabledev.itch.io/gbsnes-studio` again, matching what this paragraph always claimed. Worth
remembering as its own case of the "fresh vendor import can silently drop a fork-specific fix
that nothing catches" pattern - this one wasn't caught by any test (network-dependent, nothing
exercises it), only by a user directly reading the source.
Icons/artwork under `src/assets/app/` are GBSNES-branded: `icon/app_icon.{png,ico,icns}` (a
GB/SNES hybrid handheld), `icon/gbsproj.{png,ico,icns}` (a "SNES Studio Project" cartridge,
the `.gbsproj` file-type icon) and `dmg/background.{png,tiff}` (the macOS installer window).
The `.ico`/`.icns` are regenerated from the 1024×1024 `.png` with Pillow (`Image.save(…,
format="ICO"|"ICNS")`) — no ImageMagick on this box; Python 3 + Pillow is at `C:\python3`.
`forge.config.js` `icon: "…/app_icon"` lets electron-forge pick `.icns`/`.ico`/`.png` per OS.

## History

Three generations, each on its own branch:

- **`main` (v1, `v1.1.x`)** — a fork of GB Studio 1.2.2. Dual-target: kept the stock Game Boy
  (GBDK) engine fully working and added a second SNES (PVSnesLib) build target alongside it,
  never editing GB behaviour in place. Frozen since `v2` started.
- **`v2` (`v2.0.0`)** — rebuilt on **GB Studio 2.0.0-beta5** instead of 1.2.2 (webpack + TS
  replacing `electron-compile`, Redux Toolkit replacing hand-written reducers/actions/
  middleware, GBDK 2020, a genre-based GB engine). Still dual-target, same GB-frozen-reference
  strategy as v1: the current `v1.1.4` SNES implementation was used as a *behavioural
  reference* to rebuild the SNES target feature-by-feature on the new base, not code copied
  verbatim, and not a git merge/rebase of the upstream divergence. Tagged and released.
- **`v3` (this branch)** — the Game Boy engine, toolchain, and every target-selection
  abstraction were removed entirely, leaving the SNES-only product this file now describes.

Both rebuilds are tracked as milestones (v2: M0 audit → M13 tag; v3: M14 GB removal → M18
tag) in a roadmap artifact (not this file) — ask to have it re-shared if the link is lost, or
check Claude's memory (`gbsnes-v2-migration`) for the URL and full narrative.
`MIGRATION_V2_AUDIT.md` (repo root) has the detailed 1.2.2→2.0.0-beta5 file/architecture diff
from `v2`'s M0.

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

`npm start` runs the app through webpack (`ts-loader`, `webpack.rules.js`) via
`@electron-forge/plugin-webpack` — separate configs for main (`webpack.main.config.js`),
renderer (`webpack.renderer.config.js`) and the CLI (`webpack.cli.config.js`). Tests instead
transpile through `babel-jest` with `.babelrc` (Jest doesn't run through webpack).

**CI** is GitHub Actions (`.github/workflows/build.yml`) — replaced the inherited-from-upstream
CircleCI config (deleted; wrong branch names, Wine-based Windows builds). `test` runs
`yarn test` on Node 16 (Ubuntu). The three desktop builds are separate jobs chained strictly
**Windows → macOS → Linux** (`needs`), each `yarn make:{win,mac,linux}` on its own OS (each
vendored PVSnesLib toolchain runs natively). macOS uses `macos-15` (arm64 — GitHub retired the
last Intel image `macos-13` in 2025); `yarn make:mac` still cross-packages x64 via
electron-packager `--arch=x64` (downloads x64 Electron, repackages the pure-JS app — no native
addon needs host-arch compilation). `forge.config.js` skips `osxSign` when `process.env.CI` is
set (no Apple identity on CI). **macOS can't block the release**: `build-macos` is
`continue-on-error` + `timeout-minutes: 120`, and `build-linux` runs `if: always() &&
needs.build-windows.result == 'success'` (so a macOS runner hiccup delays Linux by at most
GitHub's queue give-up, never fails the run). The repo is public → macOS runner minutes free.
`release` (`needs: [build-windows, build-macos, build-linux]`, `if: always() && …windows &&
linux succeeded`) fires on Windows + Linux alone and attaches the macOS `.zip` only if that job
produced one. On a `v*` tag `release` attaches the artifacts to the GitHub Release
(`softprops/action-gh-release`, `fail_on_unmatched_files: false`). Lint is not gated (large
inherited eslint debt).
Node-16 pin: the 2021 `yarn.lock` is never regenerated, so a clean CI resolve pulls a few
modern transitive deps that declare `engines.node >=18` (e.g. `node-releases` via browserslist).
`--ignore-engines` is on the CLI install, plus `YARN_IGNORE_ENGINES=true` in the workflow `env`
(inherited by the nested `yarn install` electron-packager runs while pruning the packaged app —
that one never saw the CLI flag) and a repo-root `.yarnrc` (`ignore-engines true`) for local dev.

## Two processes, one repo

- **Main process**: `src/main.ts` (window lifecycle, `ipcMain`), `src/menu.js`,
  `src/lib/electron/**`, `src/splash.html`/`src/project.html`/`src/preferences.html` entry
  points.
- **Renderer**: `src/ProjectRoot.js` mounts the React app. State is Redux Toolkit
  (`src/store/configureStore.ts`, `src/store/features/<domain>/<domain>State.ts` slices) with
  side-effecting middleware alongside each slice (`src/store/features/buildGame/
  buildGameMiddleware.ts`, `music`, `soundfx`, `engine`, …). Long-running work (compiling a
  ROM, watching the project folder) happens in middleware, not components.

Project files (`*.gbsproj`, JSON) are loaded/normalized by `src/lib/project/**`
(`loadProjectData`, `migrateProject`, `watchProject`, `saveProjectData`). The Redux store
holds a **normalized** entity graph (`src/store/features/entities/entitiesState.ts`);
`denormalizeProject` rebuilds the plain project object that the compiler consumes.

## The compile pipeline (most important architecture)

Triggered by the `buildGame/build` action → `buildGameMiddleware.ts` (`src/store/features/
buildGame/`) → `src/lib/compiler/buildProject.js`, the single entry point (no target
selection — SNES is the only path). Stages:

1. **`ejectBuild.js`** — wipes the output dir and copies the engine core from
   `appData/src/snes`, then writes the generated C files into `src/data/` and `include/`.
2. **`compileSnesData.js`** — a denormalized project → `appData/src/snes/src/assets.{c,h}` +
   `src/data/*` in the engine's format: scene blobs, `event_ptrs[]` (script bytecode, see
   below), `string_ptrs[]`, `bg_*_ptrs[]` (via `snesgfx.js`), `START_*` defines. Per entity,
   `compileEntityEvents.js` runs each event's `compile()` through a `ScriptBuilder`
   (`scriptBuilder.js`) that pushes **numeric opcodes + args** into a byte array — opcode
   numbers come from `src/lib/events/scriptCommands.js` (`commandIndex()`) and must stay in
   sync with the dispatch table `script_cmds[]` in `appData/src/snes/src/script_cmds.c`
   (enforced by `test/data/compiler/snesScriptCmds.test.js`). Placeholders like
   `__REPLACE:STRING_HI:<n>` and `goto: <label>` are patched after banking
   (`banked.mutate(...)`, label resolution in `scriptBuilder.js`). `snesgfx.js` converts PNGs
   to real extracted-palette 4bpp planar tiles (not a green-channel heuristic — SNES has no
   2bpp/monochrome mode). Graphic assets are emitted as 65816 source (`src/data/*_data.as`),
   not C, so a project isn't capped at one 32 KB `.rodata` section — see the file's own header
   comment for the full scheme.
3. **`compileSnesMusic.js`** — converts each project `.mod` to Impulse Tracker (`mod2it.js`)
   and runs `smconv` to rebuild the snesmod soundbank (`res/soundbank.{bnk,h}`).
4. **`buildSnesRom.js`** — pure JS orchestration (no `make`/shell): generates `hdr.asm`, runs
   `816-tcc → 816-opt → wla-65816` per `.c` and `wla-65816` per `.asm`, links with `wlalink` →
   `build/rom/game.sfc`. LoROM + FastROM, SRAM 8 KB, auto header (no JS header patching).
5. Web builds additionally copy `appData/snes-js-emulator` (a JS SNES emulator, `SnesJs`) and
   template the `index.html`.

A user's own "Eject Build" compiles with plain `make` (no Node/Electron) via
`appData/src/snes/Makefile` + the vendored `devkitsnes/snes_rules` — a genuinely separate code
path from `buildSnesRom.js` (different file-discovery rules), so a file the JS build finds
anywhere can still be invisible to real `make`; keep new source files under `src/`'s first two
levels.

### Events are the extension point

Each file `src/lib/events/event*.js` exports `id`, `fields` (drives the auto-generated editor
form) and `compile(args, helpers)` (emits bytecode via the injected `ScriptBuilder` methods).
`src/lib/events/index.js` auto-loads them by glob and merges plugin events
(`src/lib/plugins/plugins.js`). Adding a scripting command means: new `event*.js`, new entry in
`scriptCommands.js`, new `Script_*_b` handler + `script_cmds[]` row in `script_cmds.c`, and (if
it carries data) handling in `scriptBuilder.js`.

## The engine (`appData/src/snes/`)

The only engine and only compile target — `buildProject.js` always ejects `appData/src/snes`,
runs `compileSnesData`/`compileSnesMusic`/`buildSnesRom` (see *The compile pipeline* above).
Settings page → "SNES Options" (`src/containers/pages/SettingsPage.tsx`) exposes
`settings.snesRegion` (NTSC/PAL → header `COUNTRY`), `settings.snesSramSize` (header
`SRAMSIZE`, `1024 << N` bytes) and `settings.snesRomBanks` (LoROM bank count). The World
editor's camera-viewport rectangle (`src/components/world/EventHelper.js`, shown over the
scene background while editing a `Camera: Move To` event) reads `screenTileWidth`/
`screenTileHeight` straight from `src/lib/compiler/targets` (the single SNES descriptor).

*Historical note:* through `v2`, this engine was one of two build targets (Game Boy being the
other), selected by `project.settings.target`/`GBS_TARGET` and read via a
`getTarget(id)`/`{gb, snes}` lookup with an implicit `"gb"` fallback. `v3` (M14) removed the
Game Boy target entirely and collapsed that lookup into the single descriptor referenced
above — the narrative below predates that collapse, so `target`/`getTarget(...)`/
`settings.target` mentions describe what the code *was* at the time of that specific fix, not
what exists today; the underlying engine behaviour they document is still accurate.

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
**Scene flashed visible for a frame before its opening curtain (user-found, Logo intro).**
`SceneInit` did `setBrightness(FadeLevel())` (un-blank) *before* `run_script()` set the scene
script going — so the bare BG1 (the "YOUR LOGO" art) rendered at full brightness for the frame
between `SceneInit` and the next `UIFlush` that pushed the init script's `OVERLAY_SHOW` curtain
to VRAM. Fixed by leaving the screen force-blanked in `SceneInit` (it already `setScreenOff`s
for the VRAM DMAs) and setting `scene_unblank_pending`; `game.c`'s main loop clears it and calls
`setBrightness(FadeLevel())` on the *next* frame, right after that `UIFlush`. Costs one extra
force-blanked frame on a no-fade scene load (imperceptible); a `SWITCH_SCENE` fade-in is
unchanged (it ramps from black via `FadeUpdate` regardless). Verified in Mesen frame-by-frame:
old build showed the full logo at ~f20 then the curtain; new build is clean black → curtain →
`OVERLAY_MOVE_TO` wipe → logo.
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

**Settings > Controls, SNES pad (M9-cont., user-found: "in SNES mode I don't see the X/Y/L/R
controls and the pad is the Game Boy one").** `CustomControlsPicker.js` is target-aware: a
SNES project gets a fourth column of key-binding rows for **X / Y / L / R** and the preview
widget is a new `SNESControlsPreview` (L/R shoulders + X/Y/A/B diamond + Select/Start) instead
of `GBControlsPreview`. New settings keys `customControlsX/Y/L/R` (defaults `i`/`u`/`o`/`p`,
shown as placeholders); `keyMap`/`defaultValues` carry them for every target but only SNES
renders the column. `buildProject.js`'s web-player `customControls` blob now includes
`x`/`y`/`l`/`r`, and the SNES `main.js` gained a `DEFAULT_KEYS` fallback covering all 12
buttons (an un-customised SNES project used to have no keyboard bindings at all bar the fixed
X/Y/L/R). Touch pad (`index.html` + `css/style.css`) grew the L/R shoulders and X/Y face
buttons. GB target unchanged (`GBControlsPreview`, 8 buttons). No new tests (no component
tests exist); `snesWebPlayer.test.js` still green.

**Dialogue text box editor stuck at the GB's char-per-line width on SNES (user-found: "la zone
de texte est resté sur la limite de la GB").** `eventTextDialogue.js`'s `text`/`avatarId` fields
pre-wrap authored dialogue in the editor (`updateFn`/`postUpdate`, via `trimlines()`) so what you
type roughly matches the in-game box - hardcoded to the GB's own box width (18 chars/line, 16
with an avatar portrait) regardless of target. The SNES box is 256px/32 tiles wide (vs the GB's
160px/20) and its engine (`ui.c`'s real runtime `ui_wrap()`) already wraps correctly against its
own real width (`TXT_COLS` 28, minus 4 tiles of `xoff` when an avatar is shown) - but `ui_wrap()`
only ever *adds* line breaks at overflow, never removes ones the editor already baked in, so the
editor's GB-width pre-wrap directly forced a SNES box into unnecessarily many, needlessly short
lines. New target fields `maxTextLineChars`/`maxTextLineCharsWithAvatar` (gb 18/16 - unchanged
literals; snes 27/23, derived straight from `ui.c`'s `TXT_COLS - 1 [- xoff]`), guarded by
`targets.test.js`. Static `fields` arrays have no project context at definition time (see the
`eventCameraMoveTo.js` note above) - but `updateFn`/`postUpdate` are plain functions invoked
fresh on every edit, so `settings.target` is threaded into them as a new call argument instead,
via a normal prop chain: `ScriptEditor.js` and `ScriptEventBlock.js` each read `target` from
their own `mapStateToProps` (both already Redux-connected) and pass it down through
`ActionMini`/`ScriptEventField`/`ScriptEventInput` to the `updateFn(string, field, args, target)`
/ `postUpdate(args, target)` call sites. Tests: `eventTextDialogue.test.js` (wrap width differs
by target, `undefined` target still falls back to gb).

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
  `targets/snes.js` `maxTilesetTiles` is the real tile-index-field ceiling (1024 — see the
  "Fixed VRAM layout" entry below for why it isn't a VRAM-size number).
  **`imageToSpriteData` now warns on a >16-colour sprite sheet, matching `imageToBGData`**
  (asked by the user while discussing the `snesFixedAssets.js` palette bug above: "why
  transform sprite/background palettes at all?"). Backgrounds already warned and pointed at
  the fix ("re-export as an indexed PNG with ≤16 colours"); sprites silently snapped overflow
  colours to the nearest kept one with no diagnostic. Both now collect every distinct colour
  first (previously sprites stopped collecting at 16, hiding the true count), then truncate to
  `maxColors` (first-seen order) and warn if truncated. Tests: `snesgfx.test.js` (two new
  cases, synthetic 20-colour fixtures via `pngjs`).
- **`src/lib/compiler/compileSnesData.js`** — the SNES data compiler (M7 phase 1). A
  denormalized project → `appData/src/snes/src/assets.{c,h}` + `src/data/*` in the engine's
  format: scene blobs, `event_ptrs[]` (script bytecode via the shared `compileEntityEvents` /
  `scriptBuilder` — opcode numbers identical to GB), `string_ptrs[]`, `bg_*_ptrs[]` (via
  `snesgfx.js`), and `START_*` defines. The only placeholders resolved here are the
  `__REPLACE:STRING_*` triples (→ a plain 16-bit `string_ptrs[]` index; no banked pointer, D4).
  **Graphic assets are 65816 source, not C.** `assets.c` (one atomic 816-tcc `.rodata` section,
  capped at a 32 KB LoROM bank) holds only the pointer tables + `bg_*_len[]` + scene blobs +
  script bytecode + strings; every background, the UI font, each per-scene OBJ tile sheet and
  each OBJ palette is emitted as its own `src/data/<name>_data.as` — one `.section
  "rodata_<name>" superfree` with `<name>_tiles` / `_pal` / `_map` labels (`.db`, 32 B/line;
  no map for the font). `src/data/data.asm` (`.include "hdr.asm"` + one `.include
  "src/data/<name>_data.as"` per file) is the file the build actually assembles — `.as` files
  are pulled in, never compiled directly (neither `buildSnesRom.js` nor `snes_rules` scans
  `*.as`). wlalink then spreads the sections across banks, so total graphic data can exceed
  32 KB. The C engine references the asm labels via the `extern` arrays in `assets.h`
  (816-tcc emits a plain `bg0_tiles` symbol reference — the label must match exactly, no dot).
  `buildProject.js` `buildProjectSnes` runs the compiler, removes any stale `assets_spr.asm`,
  and writes `assets.{c,h}` + `src/data/*` into the ejected engine tree before `buildSnesRom`. Runs `migrateProject` (idempotent) so legacy `EVENT_MATH_*` etc. compile.
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
  **A stray anti-aliased pixel could evict the font's real ink colour from the palette**
  (user-found: "ascii.png's palette in-game doesn't match `assets/ui`"). The 3-colour BG3
  palette is shared across `ascii.png` + `frame.png` + `cursor.png`; the old code picked the
  middle slot by pure luminance rank ("2nd-lightest colour"), so a single soft edge pixel on
  the tiny `frame.png`/`cursor.png` (24×24 / 8×8 - one anti-aliased pixel from a resize/resave
  is enough) could rank ahead of the font's actual, heavily-used ink colour and win the slot;
  every "ink" pixel then snapped to that near-invisible stray colour instead. Fixed by picking
  the middle slot by **pixel count** among the non-extreme colours (lightest/darkest are still
  kept as anchors regardless of count - they're the box interior / outline, which can
  legitimately be rare on a small `frame.png`/`cursor.png`), not by luminance adjacency.
  Verified: rebuilding the stock sample's palette now keeps `(212,168,56)` (2960 px, the real
  gold ink) instead of `(188,168,172)` (an 18-px artefact split across `frame.png`/`cursor.png`).
  `test/data/compiler/snesFixedAssets.test.js` guards the blob shape + this regression (a
  synthetic fixture built with `pngjs`, a transitive dep of `get-pixels` - same
  not-in-`package.json`-but-relied-on pattern this module already uses for `get-pixels` itself).
  **Emote bubbles rendered in the wrong colours (user-found: "la palette des emotes n'est pas de
  la bonne couleur").** `snesFixedAssets.js`'s local `palBytes()` helper takes already-5-bit
  (0..31) components - written for the hand-authored `SPR_PALETTE` literals, which are genuinely
  5-bit - but `emoteColors` (scanned straight from `emotes.png`'s raw 8-bit pixels via
  `get-pixels`) was passed in unconverted. `(x & 31)` on an 8-bit value takes its *low* 5 bits,
  not a scaled-down top-5-bits like `snesgfx.js`'s `rgbToBGR555` (`(x >> 3) & 0x1f`) - a
  completely different number for almost any colour (e.g. `(224,248,208)` decoded back to
  `(0,192,128)` instead of ~`(224,248,208)`). Fixed by scaling `emoteColors` down (`>> 3`) right
  before the `palBytes()` call; `SPR_PALETTE`'s own (already-correct) path is untouched. Test:
  `snesFixedAssets.test.js` decodes the real `emotes.png`'s palette and checks its actual
  colours survive - fails against the pre-fix code with exactly the garbled values above.
  **`emotes.png` was never actually a project asset (same bug report, user's follow-up: "the
  colour still doesn't match `assets/ui/emotes.png` in `sneshtml`").** The scaling fix above was
  real but incomplete - `snesFixedAssets.js`'s `buildSpriteSheet()` always loaded emote graphics
  from a fixed `appData/src/snes/tools/emotes.png`, never from the project's own
  `assets/ui/emotes.png`, so editing that project file (what the user was actually doing) had no
  effect on the compiled game at all. Unlike `ascii.png`/`frame.png`/`cursor.png` (already
  project assets, read from `uiAssetDir`) and unlike the Game Boy target - `compileData.js`
  reads `assets/ui/emotes.png` there via `ensureProjectAsset` - the SNES path had no equivalent.
  Fixed: `compileSnesData.js`'s `UI_FILES` backfill list now includes `emotes.png` (so an older
  project without one gets the stock sample's copy, same as the other three), and
  `snesFixedAssets({ uiAssetDir })` derives the emotes path as `uiAssetDir/emotes.png`, falling
  back to the old fixed tools copy only when no `uiAssetDir` is given (`gen-dummy-gfx.js`'s
  committed dummy data stays byte-identical). Test: `snesFixedAssets.test.js` builds a synthetic
  project `assets/ui/emotes.png` with a colour absent from the tools copy and confirms it - not
  the tools copy's colours - ends up in the compiled palette.
  **Per-scene OBJ sheets (user-found: a 16-sheet project showed the player sprite for
  everything past the 8th).** The OBJ sheet used to be **one project-wide** 8 KB blob loaded
  at boot - 8 slots for the whole game. Now `compileSnesData.js` builds one 8 KB sheet **per
  scene** (`buildSceneSprites`): player always slot 0, that scene's own actor sheets 1..7,
  plus the fixed emotes (region 32-63) and only that scene's dialogue avatars (64-95). Deduped
  by content (a Logo + Title with no actors share one). Emitted as `src/data/scene_spr_*_data.as`
  (one `superfree` section per blob, `.include`d from `src/data/data.asm` — see the
  `compileSnesData.js` bullet; this is the general "graphic assets are 65816 source" scheme, not
  sprite-specific). The 8-palette CGRAM image is
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
  **Talk / push only worked from the left and top (user-found: "on the right of a character,
  hit A, nothing happens", "same for the rock").** `SceneTryInteract` computed the facing tile
  as `SceneActorTileX/Y(0) + dir` - but `SceneActorTileX/Y` is the *top-left* of the player's
  16×16 (2×2 tile) sprite, so facing **right or down** it pointed at the player's own far edge,
  a tile short of the target. `in_box(ntx,nty,ax,ay,2,2)` (the target's own 2×2 footprint) then
  missed. Fixed by adding 1 to `ntx`/`nty` when `dir_x`/`dir_y` is positive (the sprite is two
  tiles wide/tall), mirroring GB's `DIV_8(pos)+dir` with the wider sprite. Verified in Mesen:
  a scene with one NPC, player pressing A from each of the four sides - all four now run the
  actor's script (talk box appears); before, right/below worked and left/above didn't. The
  trigger-A-press check in the same function picks up the same corrected `ntx/nty`.
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
  **A 7th/8th sheet no longer clobbers the palette it shares (user-found: "npc001.png
  overwrites the palette shared with the player").** `ACTOR_OBJ_PAL_POOL` has only 6 entries,
  so once a scene has 7+ distinct sprite sheets, `writePal()` used to write the straggler's
  palette bytes straight over whatever the first claimant (always the player, since it's
  always `sceneSpriteIds[…][0]`) had written to the same CGRAM bytes - last write wins, so the
  player would render in the 7th sheet's colours instead of its own. Fixed with a real merge
  in `buildSceneSprites` (`mergeSpriteIntoPalette`): the first sprite to claim an OBJ palette
  register keeps its own 0-based colour indices untouched; a later sprite forced onto the same
  register reuses a colour it already shares with the claimant, otherwise appends its own into
  a free slot, and has its own tile data re-indexed to match (`snesgfx.js`'s `indicesFromTile`/
  `tileFromIndices` round-trip a tile to/from raw indices for this). Colour 0 is skipped on
  both sides - hardware-transparent for any OBJ sprite regardless of what's stored there, never
  worth a slot. Only once the *combined* colour count of everyone sharing a register exceeds 16
  does the overflow snap to the nearest already-placed colour, with a warning (mirrors the
  plain per-sprite `imageToSpriteData` 16-colour overflow above). `imageToSpriteData` now also
  returns `colors` (the raw 8-bit list, same order as its palette) so a caller can do this kind
  of cross-sprite merge without re-scanning the PNG. Verified against the real "Sample Project
  (SNES)": Outside's 7th sheet (`npc001.png`) used to leave OBJ pal 0 with only its own ~2
  colours (the player's gone); now pal 0 holds 9 populated colour entries (both sheets' full
  palettes), no overflow warning. New test: `compileSnesData.test.js` ("a 7th sheet sharing pal
  0 gets its colours merged in, not overwritten") - builds two solid-colour synthetic sprites,
  confirms both colours are present in the merged CGRAM bytes *and* that each sprite's own tile
  data resolves to its own colour (not the other's); fails against the pre-fix code (the
  player's colour is simply missing from the palette).
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
  **"Build ROM" failed with "PVSnesLib toolchain not found" in a real packaged/installed build**
  (user-found right after downloading the `v1.1.0` Windows release - the toolchain genuinely
  ships inside `app.asar`, so the error was flatly wrong). Root cause: `resolvePvsHome()` (and
  three other checks - two more in this file, one in `compileSnesMusic.js`) used fs-extra's
  `fs.pathExists()`, which is built on Node's `fs.access`/`fs.accessSync` - and those two
  functions are specifically **not** part of the set Electron's `asar` support makes transparent
  for paths inside `app.asar` (`fs.stat`/`fs.lstat`/`fs.readdir`/`fs.readFile`/
  `fs.createReadStream` are). So `pathExists()` unconditionally reports "doesn't exist" for
  anything packed inside the app, regardless of whether it's actually there - a 100%-reproducible
  failure in every packaged build, not an intermittent CI/packaging issue. Confirmed directly: a
  small probe run inside a real (non-dev) Electron process against a real packaged `app.asar`
  showed `fs.existsSync`/`fs.lstat` succeeding on the toolchain path while `fs.access` failed with
  the exact "not found" error the user saw. The Game Boy target was never affected - its own
  toolchain lookup (`ensureBuildTools.js` → the shared `fsCopy.js` `copy()` helper) only ever uses
  `fs.lstat`/`fs.readdir`/`fs.createReadStream`, never `fs.access`, so it already worked from
  inside `app.asar` by what turned out to be a lucky implementation detail, not a deliberate
  choice. Fixed by adding `pathExists()` to `fsCopy.js` itself (`fs.lstat` wrapped in try/catch -
  the same pattern `copyFile()` in that file already uses) and switching all 4 call sites to it;
  `fs.pathExists`/`fs.access` no longer appear anywhere in `src/`. Test: `test/helpers/
  fsCopy.test.js` (plain-filesystem true/false correctness only - jest runs under plain Node, so
  the asar-transparency difference itself isn't reproducible there; that part was verified against
  a real packaged build instead, not in the test suite).
  **The `1.1.2` fix above was only half the story (same-day follow-up, user-found: "spawn
  ...\smconv.exe ENOENT" building the soundbank).** Fixing the existence check let a packaged
  build get as far as actually *running* a vendored tool for the first time - and every single
  one of them (`816-tcc`, `wla-65816`, `wlalink`, `816-opt`, `smconv`) is spawned as a real OS
  process via `child_process`. Nothing inside `app.asar` is a real file on disk, so
  `child_process.spawn()` on an asar-internal path always fails with `ENOENT`, full stop -
  Electron's `asar` support patches *reading* (`stat`/`lstat`/`readdir`/`readFile`/
  `createReadStream`), never process creation, and there's no patch that could fix this (the OS
  itself needs a real file to exec). `resolvePvsHome()` returned the raw `vendored` path
  unconditionally whenever it had no spaces - true for a typical packaged install path - so every
  tool path built from it (they're all `Path.join(pvsHome, ...)`) pointed straight into
  `app.asar`. Fixed: detect `vendored.indexOf(".asar") !== -1` and, when true, extract the whole
  toolchain to a real temp folder first (reusing the existing `copy()` helper already used for
  the has-a-space case) - skipping the cheap symlink attempt that case also uses, since a symlink
  into `app.asar` doesn't produce a real file either (confirmed - see below). The extraction
  happens once and is reused across builds (checks whether the temp destination already exists
  before repeating it), so only the first SNES build in a session pays the (real, ~tens-of-MB)
  copy cost. Verified with the same real-Electron-process methodology as the `1.1.2` fix: spawning
  `smconv.exe` straight from a real packaged `app.asar` reproduces the exact ENOENT (`status:
  null`, the error string); spawning the identical file after extracting it to a real temp path
  succeeds (`status: 1, stdout` - a normal no-args usage exit, not a launch failure).
  **A same-shaped worry about the Game Boy target, raised and then retracted.** While
  investigating the SNES bug above it looked like `makeBuild.js`'s toolchain setup might have the
  identical problem: it tries `fs.ensureSymlink(buildToolsPath, tmpBuildToolsPath)` first, falling
  back to a real `copy()` only if that throws - and a symlink/junction *pointing into* `app.asar`
  really is created without error (confirmed with `fs.symlinkSync` directly), so naively that
  fallback looks like it'd never trigger. But the user confirmed a real packaged GB build
  actually works, which meant the symlink branch must not be the one really running. Re-reading
  the exact code: it's `fs.unlink(tmpBuildToolsPath)` **immediately before** `ensureSymlink`,
  both inside the same `try`. `fs.unlink` on a path that doesn't exist yet (first build - nothing
  has been copied there yet) rejects with `ENOENT`; on a path that already exists as a real
  directory (every later build, since a previous run's `copy()` put a real directory there, not
  a symlink) it rejects too (`unlink` is for files, not directories). Either way the `catch` fires
  *before* `ensureSymlink` ever runs, landing on `copy()` - which, like SNES's own `copy()` helper,
  only uses `readdir`/`lstat`/`createReadStream` (all asar-transparent), so it genuinely extracts
  the toolchain to a real directory every time. The symlink attempt is effectively unreachable in
  practice, not resilient - but the practical result is the same: GB was never broken, and this
  needed no fix. Correcting the record since an earlier, less faithful probe (skipping the
  preceding failed `unlink`) wrongly suggested otherwise.
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
  2-column `MENU` layout, `OVERLAY_MOVE_TO` (animates the covered row, blocks the script until
  it arrives)). **The dialogue/menu box is content-sized** (user-found: a 2-option menu drew as
  a near-empty 8-row slab). `ui_set_box(content_rows)` anchors the box to its bottom edge (row
  `BOX_ROW0 + BOX_ROWS`, the screen bottom) and grows it upward to `content_rows + 2` (borders),
  clamped `[BOX_ROWS_MIN 4, BOX_ROWS 8]`; `box_row0` / `box_rows` are dynamic, `TXT_ROW0` /
  `TXT_ROWS` became `(box_row0 + 1)` / `(box_rows - 2)` macros. `ui_begin_text` sizes to the
  wrapped-line count, `UIShowMenu` to the option rows (1-col: one per option; 2-col: ≤
  `MENU_ROWS_PER_COL`). **The slide is a redraw, not a BG3 scroll** (user-found: the box flashed
  at the *top* of the screen while sliding). BG3 is 256px with only 4 rows of off-screen margin
  below the box - not enough to hide a taller box by scrolling, and scrolling further wraps the
  32-row map so the box reappears up top. So `ui_frame_box` now draws the frame shifted down by
  `ui_slide_off` rows (`box_rows` = fully below the screen → `0` = in place), redrawn each slide
  tick; BG3 vscroll stays 0. Rows below the box are clipped, rows above blanked. The partial
  UIFlush DMA / close-path clear cover the full `BOX_ROW0..BOX_MAP_ROWS(32)` the sliding box can
  touch. Menu options + cursor are drawn only once the slide finishes (drawing them earlier just
  gets wiped as the frame rises over them). M6 — `SceneInit` uploads the BG
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
  **v4 follow-up (user-asked: "musics can be only mod or can be also it?")**: a project track
  can now also be a `.it` file directly - `loadMusicData.js`'s asset glob picks up `*.it`/`*.IT`
  alongside `*.mod`/`*.MOD`, and `compileSnesMusic.js`'s `convertTrack` passes a `.it` track to
  `smconv` byte-for-byte instead of running it through `mod2it.js` (that converter only knows
  how to *re-derive* IT from a 4-channel `.mod`; it isn't a general IT normaliser, so an `.it`
  input skips it entirely). **Not done**: the in-editor music preview player
  (`src/lib/vendor/scriptracker/`, `musicMiddleware.ts`) declares `Module.Types.IT` in
  `module.js` but its loader dispatch (`scriptracker.js` `loadRaw`'s switch) only implements
  `mod`/`s3m`/`xm` - there's no `it_module.js` at all, unlike the sibling
  `mod_module.js`/`s3m_module.js`/`xm_module.js`. An `.it` track builds into the ROM correctly
  but the editor's own "Play" preview button silently no-ops for it (falls through to `default:
  return;`) - writing a real IT-format parser for this vendored library would be a substantial,
  separate undertaking, deliberately not attempted here.
  **Done (user asked for it once the build-side fixes above landed):** `src/lib/vendor/
  scriptracker/it_module.js`, a real IT loader matching the sibling loaders' style, wired into
  `scriptracker.js`'s `loadRaw` (`case "it": this.module = new ItModule(data);`). Byte offsets
  are cross-checked against smconv's own real upstream source (`itloader.cpp`), not just the
  IT spec, since that's the parser a project `.it` ultimately has to satisfy to build at all -
  same fetch-the-real-source discipline as the crash fix above. Two shapes smconv itself can't
  handle are handled fine here, since the preview never touches smconv: a sample-direct/
  "old"-mode `.it` (`InstrumentCount` 0) gets one synthetic pass-through instrument per sample
  (same technique the existing S3M loader already uses, since S3M never had an instrument
  concept either); a compressed sample is left silent (empty `sample.sample`) rather than
  decoded (IT214 decompression isn't implemented) or crashed on. Effect-letter mapping reuses
  the existing `Effects.*` objects by closest available slot - this player's `VOLUME_SLIDE`/
  `SET_VOLUME_AND_SLIDE` handlers are themselves a GB-era "GBT" reinterpretation specific to
  `mod_module.js`'s own authoring convention (Game Boy APU envelope curves, not standard
  tracker volume slide math - see that file's own hardcoded 15-waveform GB instrument table,
  a legacy carryover this SNES-only app no longer needs but hasn't been asked to remove), so
  IT's `D`/`N` (real volume/channel-volume slide) land on the same slot for lack of a better
  one, documented inline rather than silently assumed correct. Found and fixed one real format
  detail by cross-referencing `itloader.cpp` directly: IT's envelope `FLG` byte (bit0 Enabled,
  bit1 Loop, bit2 Sustain) does **not** line up with the generic `Envelope.EnvelopeType` bits
  (bit0 ON, bit1 SUSTAIN, bit2 LOOP) - bits 1 and 2 are swapped between the two, remapped
  explicitly rather than copied through. Verified against three real files: `modToIt()`'s own
  output (31 real instruments/samples, real non-silent decoded PCM, sample-key-map resolves
  correctly), PVSnesLib's own `pollen8.it` example (17 instruments, all with real audio data),
  and the user's own now-fixed `ITRulz_Outside.it` (32 instruments, all non-empty) - all parse
  without crashing and produce genuine audio data. Tests: `test/lib/vendor/scriptracker/
  it_module.test.js` (a real `modToIt()`-produced `.it`; a hand-built minimal sample-direct
  fixture exercising pattern unpacking + note/instrument resolution; a compressed-sample
  fixture confirming silent-not-crashed; a zero pattern-pointer fixture confirming the
  "blank pattern" shorthand doesn't crash).
  **The preview still played nothing even once `it_module.js` parsed correctly (same user,
  immediate follow-up: "no, it is not working, no sound").** Root cause was in the *shared*
  playback engine, not the IT loader - `scriptracker.js`'s note-trigger code (and the
  `ARPEGGIO` effect in `effects.js`) computed pitch via a direct array lookup,
  `this.notePeriodsGB[note]`, where `notePeriodsGB` is a hardcoded **72-entry** table (its own
  comment: "C3 to B8", a 6-octave span) - a GB Studio-specific table that `mod_module.js`'s own
  loader is deliberately tuned to stay inside (its own 72-entry Amiga-period table is a 1:1
  parallel array, confirmed by checking the actual numbers: `notePeriodsGB[12]` is almost
  exactly double `notePeriodsGB[0]`'s equivalent frequency - a real, intentional equal-tempered
  correspondence, not coincidence). A **real, externally-composed song** has no reason to stay
  inside that narrow 6-octave window: checking the user's own re-exported `ITRulz_Outside.it`
  directly, its notes span raw values 61-79 - more than half (33 of 61 note triggers) read
  `notePeriodsGB[72+]` = `undefined`, cascading to `NaN` pitch and permanent silence on that
  channel; the in-range notes (61-71) sat at the very top edge of the table and would have
  played back implausibly high-pitched even where defined. This isn't a defect specific to IT -
  MOD/S3M/XM content composed outside GB Studio's own narrow authoring convention would hit the
  identical wall (the code even carries a `//replace with gb lookup` comment, suggesting the
  original author already knew this was a stopgap). User-chosen fix (offered a smaller
  "leave it" option first, given this touches playback shared by every format and can't be
  verified by ear in this environment): added `ScripTracker.prototype.getPeriodForNote(note)`,
  replacing both direct-lookup call sites (`scriptracker.js`'s note trigger, `effects.js`'s
  `ARPEGGIO`). For any **in-range** note (0-71) it returns the table's own value completely
  unchanged - zero behaviour change for anything that already played correctly, GB Studio's own
  `.mod` content included. Beyond the table, it extrapolates using the *exact same*
  equal-tempered relationship the table's own values already follow (confirmed empirically
  above), anchored to the table's real last entry (no seam at the boundary) and expressed on
  the same GB-period scale (`2048 - (131072*1.8)/freq`, the inverse of the
  `freq=(131072*1.8)/(2048-period)` formula used pervasively throughout `effects.js` -
  PORTA_UP/DOWN, VIBRATO, TONE_PORTA all read/write `registers.period` on this exact scale, so
  a note originating from the extrapolated path stays fully compatible with every other pitch
  effect). Tests: `test/lib/vendor/scriptracker/scriptracker.test.js` - every in-range note
  returns the table's own value byte-for-byte; a note past the table's end (the real 79 from
  the regression) returns a finite, non-NaN value; the boundary is continuous (no pitch jump
  between index 71 and 72, a full 12-semitone step is almost exactly a frequency doubling);
  pitch rises monotonically well past the old ceiling (tested through note 96).
  **Audible but too high, by two octaves total - found across two rounds (same user: "ok, i can
  hear audio but notes are too high" → first guess "about 1 octave" → after that fix landed,
  "arg, still one octave too high i think", confirmed-reloaded).** The pitch engine fix above
  made every note *finite*, but `it_module.js`'s own raw-IT-note -> generic-pattern-note
  mapping (`noteByte + 1`) still assumed the generic note scheme was a real, absolute pitch
  reference matching IT's own octave numbering - it isn't (confirmed investigating this very
  bug: `notePeriodsGB`'s achievable frequency range, ~118-7149 Hz via `getPeriodForNote`, never
  even reaches the standard 8363 Hz tracker C-5 reference, so there's no principled formula -
  C5Speed-based or otherwise - to derive the right offset purely from note names; the table's
  own "C3 to B8" comment isn't a real absolute reference either). Asked the user how far off by
  ear rather than guess blind. Their first answer (1 octave) was real and correct as far as it
  went - applying a `-12` shift measurably changed the sound (confirmed by asking explicitly:
  "reloaded, it's better but still ~1 octave too high") - it just wasn't the *whole* gap, so the
  true total was `-24` (2 octaves), confirmed once that residual itself also measured as almost
  exactly 1 octave. Landed on a single named constant, `NOTE_OCTAVE_SHIFT = 24`, subtracted from
  the raw note before the existing `+1`: an empirically-confirmed correction (found by
  iterating with the user's own ears, since this environment can't play or judge audio itself),
  documented as such rather than presented as derived. Clamped at the low end
  (`Math.max(1, generic)`) so a very low raw note (now shifted further down) can't go negative
  into `getPeriodForNote`'s untested range or - worse - land on exactly 0, which would silently
  collide with the shared "no note" sentinel and drop a real note instead of just playing it
  low. Verified across all three states: the real `ITRulz_Outside.it`'s note range moved from
  61-79 (half past the table, the original "no sound" bug) → unshifted-but-finite 61-79 (loud
  but 2 octaves too high) → 49-67 with `-12` (audibly better, confirmed, but still 1 octave
  short) → a fully in-range 37-55 with `-24` (comfortably mid-table, no clamping triggered for
  this file). Tests: `it_module.test.js`'s `decodeNote` describe block (the exact `-24`
  arithmetic; note-off/cut unaffected by the shift; low-note clamping doesn't collide with the
  empty-note sentinel).
  **Still too high at `-24` (same user: "arg, still one octave too high i think").** Rather than
  guess a fourth time, confirmed two things first: (1) ruled out an instrument/timbre bug - the
  user confirmed the *sound itself* was right, only pitch was off, so the shift direction/
  mechanism was correct, just not the magnitude; (2) discovered the file's own sample names are
  literally "Chans. 1&2 - 25% Duty" / "Channel 3 - Waveform 1" etc. - the exact names
  `mod_module.js` hardcodes for its own GB-APU waveform instruments - confirming this file really
  is GB Studio-authored content exported to `.it`, not generic external tracker content, which
  matters for which pitch convention should apply. Tried to derive the exact offset
  mathematically from `mod2it.js`'s own proven `PT_PERIODS[0]=856 -> IT note 48` anchor, cross-
  referenced against `notePeriodsGB` - landed on `-36` and believed it rigorously derived, but
  the derivation had a real bug: it compared `notePeriodsGB[p]` (the GB-pulse-register table
  `getPeriodForNote` reads) against `mod_module.js`'s *separate* `notePeriods[p]` (an Amiga
  period table) as if they were the same values at the same index - they aren't even close
  (index 0: `notePeriodsGB[0]=44` implies ~118 Hz by the GB formula; `notePeriods[0]=1712`
  implies ~2072 Hz by the standard Amiga formula - not an octave apart, unrelated). The real
  conclusion this led to: `notePeriods` is not a real pitch reference either - it's an arbitrary
  lookup key matching whatever period GB Studio's own `.mod` export tool happened to write for
  "GB note i", with no inherent acoustic meaning preserved. There is no formula here, from either
  direction tried (C5Speed-anchored real-pitch math, or cross-referencing the Amiga tables) -
  `NOTE_OCTAVE_SHIFT` is documented in its own comment as purely empirical, not derived, to avoid
  a future reader (or session) trusting a justification that looks rigorous but isn't. Landed on
  `36` (another full octave down from `24`, since every round so far had said "too high" in the
  same direction, never overshot to "too low") - **confirmed correct by the user** ("perect!")
  on the very next try. Four rounds total to converge (`0` → `-12` → `-24` → `-36`), each a real,
  consistent step in the same direction - not noise. If a future session needs to retune this
  (e.g. a differently-authored `.it` sounds off again): don't re-attempt a mathematical
  derivation, both honest attempts here failed for this table (`notePeriodsGB` has no real
  acoustic meaning at any index, confirmed above) - iterate by ear with the user again, or add a
  way to A/B against the known-correct real ROM/smconv playback directly.
  **`smconv` crashes outright on a compressed `.it` sample, it does not fail cleanly
  (user-found: a real downloaded `.it` dropped into a project crashed "Build ROM" with
  `exit 3221225477` = `0xC0000005` = `STATUS_ACCESS_VIOLATION` on Windows).** The paragraph
  above was wrong to assume `smconv` "gets the final say" safely - fetching its real upstream
  source (`pvsneslib/tools/smconv/itloader.cpp`, `Sample::LoadData`) directly (not trusting a
  web-search summary, after this session had already been burned once by a wrong summarized
  claim about `oamSet`/`oamSetEx`) showed a genuine, upstream-acknowledged gap: a *compressed*
  IT sample (the default export setting in most modern trackers) prints "unsupported compressed
  samples" but then falls through **without ever allocating** the sample's PCM buffer (the
  `new s8[]`/`new s16[]` call only happens in the uncompressed branch) - every later use of that
  sample dereferences a null pointer. Worse, `smconv` builds the *whole* soundbank (effects +
  every project song) in one invocation, so one bad `.it` crashes every other, valid track's
  build too. Fixed with a pre-flight check, `src/lib/compiler/itValidate.js`: parses just the
  fixed IT header + the sample pointer table (ordNum/insNum/smpNum at 0x20/0x22/0x24, pointer
  tables starting at `0xc0 + ordNum`, matching `mod2it.js`'s own already-tested header layout)
  and reads each sample's Flags byte (offset 18 inside its 80-byte "IMPS" block; bit 3 = the
  same `Compressed = !!(Flags & 8)` check `itloader.cpp` itself uses). `compileSnesMusic.js`'s
  `convertTrack` calls it before ever writing a `.it` track to the work dir smconv reads from;
  a compressed sample is a hard stop - `convertTrack` throws a normal `Error` naming the
  track and telling the user to re-export without sample compression, failing the whole build
  loudly instead of crashing it (deliberately **not** the existing silent "falls back to the
  effects module, warns" treatment a merely-missing or unconvertable `.mod` track gets - a
  build that silently drops a track's music is a worse outcome here than one that stops and
  says exactly why). `mod2it.js`'s own output is never at risk (it only ever emits
  uncompressed 8-bit PCM, by construction) and is never run through this check. Two further
  "print-and-continue" gaps found in the same audit (`it2spc.cpp`): an over-32KB-module falls
  through the same dangerous way (not yet guarded against - no confirmed crash yet, lower
  priority) and an over-8-channel module `return`s cleanly on its own (self-protecting, left
  alone). Verified: a synthetic `.it` built by flipping one sample's compression bit on an
  otherwise-valid `modToIt()` output makes a real toolchain `buildProject()` run reject with
  that exact error instead of crashing (`compileSnesMusic.test.js`), and `itValidate.js` itself
  is unit-tested (clean file → no problems; compressed sample(s) → reported by number;
  malformed/truncated/wrong-magic → throws). Confirmed directly against the user's own
  `ITRulz_Outside.it` fixture: 28 of its 31 samples were compressed - exactly what would have
  crashed `smconv`, now reported as a clean, named build error instead (the user re-exported it
  without compression once this was reported, confirmed by re-checking the same fixture).
  **A second, distinct `.it` failure mode (same user, immediate follow-up: "I have no playback
  within the builded rom" after re-exporting without compression).** Re-exporting without
  compression fixed the crash but the track was still silent in-game - confirmed for real in
  Mesen: with the fixed `ITRulz_Outside.it` wired to the project's actual start scene (not
  `scenes[0]` - `settings.startSceneId` must be resolved, scene array order doesn't match boot
  order), every SPC voice stayed at `envVolume` 0 the whole time the track "played", while the
  exact same pipeline playing PVSnesLib's own known-working example
  (`pvsneslib/snes-examples/audio/music/res/pollen8.it`) showed real voices ramping up
  (confirmed via `emu.getState()`'s flat `"spc.dsp.voices[N].envVolume"` string keys - Mesen's
  Lua `getState()` table is flat, not nested, despite the dotted-looking key names). Root cause,
  confirmed from `smconv`'s real upstream source (`it2spc.cpp`): the user's file has
  `InstrumentCount == 0` (saved in "old"/sample-direct IT mode - samples triggered directly by
  number, no instrument layer - vs. `pollen8.it`'s `InstrumentCount == SampleCount == 17`, one
  instrument per sample, matching what `mod2it.js` itself always emits). `smconv` builds the
  compiled module's per-instrument pointer table 1:1 from the source file's own
  `InstrumentCount` (`Instruments.push_back(...)` once per source instrument); with 0
  instruments, every one of the table's `max_instruments` (64) slots is written as the
  "no instrument" placeholder (`i < Instruments.size() ? ... : 0xFF`) - there is nothing for any
  pattern cell to ever resolve to, so the module builds and links at a plausible size with no
  error or warning, and is simply silent forever. `itValidate.js` now also flags
  `insNum === 0 && smpNum > 0` with a message naming the real cause and the fix (re-export with
  instruments enabled - e.g. OpenMPT's "Song > Convert to Instruments"), using the same hard
  stop as the compression check. Verified: a synthetic header-only `.it` with `InstrumentCount
  0` is rejected before ever reaching `smconv` (`compileSnesMusic.test.js`), and `itValidate.js`
  has direct unit coverage for both the no-instrument and has-instrument cases.
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
  `src/assets.{c,h}` + `src/data/*` are committed dummy data (`tools/gen-dummy-gfx.js`), replaced per build.
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
  The graphic-asset split (`src/data/data.asm` + `src/data/*_data.as`) was checked the same way:
  `data.asm` sits at `src/data/` (matches `snes_rules`' `$(SRC)/*/*.asm`), its `.include` paths
  are root-relative (`src/data/bg0_data.as`), and the `.as` files are never scanned as sources -
  a full `make` of an ejected 8-background sneshtml links and boots. `appData/src/snes/src/data/`
  holds the committed dummy `.as`/`data.asm` (like `assets.c`); `.gitignore` only excludes the
  `.obj`/`.ps`/`.dbg` a standalone `make` drops there.
- **Toolchain** vendored (subset) under `buildTools/<platform>-<arch>/pvsneslib/` — PVSnesLib
  V4.7.0 `devkitsnes/{bin,tools,include,snes_rules}` + `pvsneslib/{include,lib}`, for
  `win32-x64`, `linux-x64` and `darwin-x64` (native binaries per platform; the unix ones carry
  a forced exec bit in the index since `core.fileMode` is `false` here). `smconv.spc` (the
  platform-independent SPC700 driver blob) travels in every `tools/`. Only 64-bit hosts (no
  `win32-ia32`). **`devkitsnes/{bin,tools}` is trimmed to just what's actually invoked** (user
  audit + cleanup): `816-tcc`/`wla-65816`/`wlalink` (`bin/`) + `816-opt`/`smconv`+`smconv.spc`
  (`tools/`) — matches exactly what `buildSnesRom.js` and `compileSnesMusic.js` spawn, plus
  `snesromusage` (kept as a manual ROM/RAM profiling tool, see `PERF.md`, not build-automated).
  Removed: `wla-spc700` (this project never assembles its own SPC700 code - it uses the
  prebuilt `smconv.spc` driver), `gfx2snes`/`gfx4snes`/`tmx2snes`/`bin2txt`/`constify`/
  `snestools`/`fnt4snes`/`mp44snes` (PVSnesLib's own PNG/BMP/TMX/font/video asset pipeline -
  this project converts every asset itself in JS, `snes_rules` never has a `.bmp`/`.tmx`/`.wav`
  to feed them), `snesbrr` (only ever run ad-hoc by `tools/gen-sfx.js` to regenerate the
  already-committed `.brr` sound effects, never part of an actual build). Confirmed unused by
  grepping every JS build path (`buildSnesRom.js`, `compileSnesMusic.js`) and every `snes_rules`
  rule for each tool name; the full suite (429 tests, including the toolchain-gated end-to-end
  ROM builds) stays green with them gone. Decisions log + roadmap live in Claude memory
  (`snes-port-effort`).
- **`appData/snes-js-emulator/`** — M10 (Play button / web export), the SNES counterpart of
  `appData/js-emulator` (GameBoy-Online, the GB target's bundled JS emulator). Vendors
  [angelo-wf/SnesJs](https://github.com/angelo-wf/SnesJs) (MIT, pure JS, LoROM-only — matches
  this project's own D3 LoROM+FastROM decision) for the actual 65816/PPU/SPC700 emulation core;
  `js/main.js`, `index.html`, `css/style.css` are this project's own, wiring the vendored core to
  a `fetch("rom/game.sfc")` auto-boot instead of upstream's file-picker UI, and to the project's
  own Settings > Controls mapping. The `customControls` JSON `buildProject.js` templates in now
  carries `x`/`y`/`l`/`r` too (the Settings page grew an X/Y/L/R column + a SNES pad preview for
  SNES projects — see `CustomControlsPicker.js`), and `main.js` has a `DEFAULT_KEYS` fallback for
  every button a project leaves unset (the GB fallback keys for the 8 shared buttons, plus
  `i`/`u`/`o`/`p` for X/Y/L/R — matching the Settings-page placeholders) — before, an
  un-customised SNES project had *no* keyboard bindings at all except the then-fixed X/Y/L/R.
  The on-screen touch pad gained the L/R shoulders and the X/Y face buttons.
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
  VRAM (~58%, 256-tile BG cap is the only real limit — superseded, see the "Fixed VRAM layout"
  entry below: BG1 is now unified at a fixed address with a 1024-tile ceiling), ARAM
  (snesmod-managed) all have headroom.
  The one soft spot is CPU: a typical scene holds locked 60fps, but even a 9-*static*-actor
  32×32 scene already burns ~75% of the active-frame budget in `SceneUpdate`+`UIUpdate`+
  `CameraUpdate` (816-tcc codegen is slow), so a scene with 6+ *simultaneously moving* actors
  drops the odd frame (~54fps, graceful). Method: compare the `time` main-loop tick counter
  (WRAM, from `game.sym`) against PPU `endFrame` events over ~15s, player walked via
  `emu.setInput`. One cheap safe fix applied (`SceneRenderActors` only walks used OAM slots);
  hand-asm optimisation of the render/actor hot path is deliberately deferred (high risk,
  low confidence) - see PERF.md's "future work".
  **Movement/collision hot-path cleanup (2026-09-11, still plain C).** The ~10% moving-actor
  slowdown traced to `npc_blocking()` (`scene.c`) - an O(actor count) scan every stepping actor
  runs - being called by potentially *every* actor on the same frame, since `SceneUpdateAi()`
  gated all of them on one shared 64-frame tick: an O(N²) spike concentrated on exactly the
  frames that could drop. Fixed three ways, all mechanical: `actor_try_move()` computes the
  destination tile once and passes it to both `npc_blocking()`/`can_step()` instead of each
  re-deriving it via `SceneActorTileX/Y()` (816-tcc does no CSE, so that was 2 redundant real
  function calls per move attempt); `npc_blocking()`'s inner scan inlines
  `SceneActorTileX/Y(j)` instead of calling them; and `SceneUpdateAi()` now stripes actors by
  index parity across the 64-frame ticks (odd on `time==0/128`, even on `64/192`) instead of
  touching all of them every tick - **porting the GB engine's own already-shipped design**
  (`Scene_b.c` already does exactly this striping; the SNES port had just never replicated it,
  so it touched every actor twice as often as GB with no spread). No collision behaviour change
  (identical `tx`/`ty` math, just not recomputed). Verified: the fixture build suite still
  compiles/links, and a Mesen run of the retargeted sample (spawned directly in Outside)
  confirmed normal 4-direction player movement/collision and that the scene's `randomWalk`
  actor still moves over time. Not yet re-profiled with fps numbers - see PERF.md.
  **`OVERLAY_MOVE_TO` slide was needlessly slow and coarse (user-found: "le slide... est très
  lent et pas très joli", the sample's Logo intro).** `ui_update_overlay()` (`ui.c`) advances the
  BG3 curtain one tile row per tick, but did so by calling `ui_overlay_fill_from()` - rewriting
  **all 32 rows** of the dialogue-box tilemap (1024 WRAM writes in 816-tcc-generated C) and
  forcing a full 2 KB VRAM DMA on every tick, even though at most one row's fill state actually
  changes per step. Root cause is architectural, not just this one call site: unlike the Game Boy
  engine, which slides its equivalent window layer by writing a hardware Y-scroll register per
  pixel (`UI_b.c` `UIUpdate_b()`, `WY_REG = win_pos_y`, effectively free), this BG3 layer also
  hosts the dialogue/menu box at a fixed screen position, so a real hardware vscroll wasn't used
  here - the curtain is redrawn by software instead, at 8px/tick coarseness. Applied the
  low-risk fix: new `ui_overlay_step(old_row, new_row)` touches only the row(s) that actually
  changed (almost always exactly 1, up to ~5 rows at the one hidden/visible boundary crossing -
  see `ui_overlay_fill_from`'s own `UI_SCREEN_ROWS` comment), and `UIFlush()` DMAs only that
  narrow range instead of the whole map; the box's own existing fixed-range DMA
  (`BOX_ROW0..BOX_MAP_ROWS`) still always runs too, so a same-tick box change is never missed.
  No behaviour/timing change - same tick cadence, same final content. A real hardware BG3 vscroll
  (matching GB's smooth per-pixel slide) was proposed as a further step and declined for now: it
  would need the box's own draw position to compensate for the shared layer's scroll offset so it
  stays visually fixed while the curtain moves - a bigger, riskier change than this mechanical
  one. Verified in Mesen, reading both WRAM (`ui_map`) and the *actual* VRAM BG3 tilemap: every
  row settles to the intended content one frame after its transition, including the
  hidden-boundary crossing (rows 28-31 confirmed blank in real VRAM, not just the WRAM buffer -
  the original "stray dark line" bug a related fix predates was not reintroduced). Also directly
  observed, mid-verification, the CPU-budget tightness `PERF.md` already documents: a couple of
  ticks were caught by the Lua script mid-write (some columns of a row already rewritten, the
  rest still holding the old value, settled correctly the very next frame) - even a ~32-write
  tick can occasionally straddle a frame boundary on this build. Test: none (C engine change, no
  JS surface) - the full jest suite plus the toolchain-gated `sneshtml` end-to-end build (real
  816-tcc/wla-65816/wlalink) all stayed green. See `PERF.md`'s "Done" section for the full writeup.
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

### SNES engine — current state and known gaps

The engine is **functional end to end**: create a project in the app → script it (dialogue,
menus, actors, camera, SRAM save, music) → Build ROM → Play (bundled JS emulator, with touch
controls + saved-game persistence). `appData/src/snes/EVENTS.md` is the authoritative,
per-event support matrix (kept in sync with the opcode table by convention — update it
whenever an opcode's runtime behaviour changes) and its own "Not yet implemented" section
lists the real remaining gaps (a Projectiles subsystem, per-actor `On Update` scripts, runtime
Engine Field writes — each already has its own explanatory comment in `script_cmds.c`).
`appData/src/snes/PERF.md` has the ROM/RAM/CPU budget profile. Detailed build-up history
(M0–M13 on `v2`, M14–M18 on `v3`) lives in the roadmap artifact and Claude's memory
(`gbsnes-v2-migration`), not duplicated here.

**Custom-palette editor removed (user-driven).** The GB-heritage "Custom Palettes" feature
(menu entry, page, per-scene/actor palette pickers, the "Colorize" paint tool, the
`palettes`/`paletteIds`/`paletteId`/`tileColors` project fields, `customColorsEnabled` and
the four `default*PaletteId(s)` settings) had no purpose on this target — `snesgfx.js` already
extracts each background/sprite's real palette straight from its PNG, with no user-editable
overlay involved anywhere in the SNES compile path. Removed wholesale, along with the World
editor's scene/sprite preview quantization (`ColorizedImage`, `SpriteSheetCanvas.worker`'s
GB-green-channel recolour pass) that ran every preview through a 4-shade GB heuristic before
display — previews now show each PNG's real colours directly. The two runtime palette-swap
script events (`Palette: Set Background` / `Set UI`) are gone from the picker too; their
opcodes stay reserved, still-Noop rows in `script_cmds.c` so nothing downstream renumbers.
See `appData/src/snes/EVENTS.md` for the updated matrix rows.

**Priority tile painting moved to its own tool, matching GB Studio 3.2.1's real UI (user-asked,
pointing directly at B's actual "Palette" page: an icon behind Collisions that hosts palette
*or* priority painting).** The underlying feature (data, compiler, engine) already shipped
whole in `v4`'s M7 - `TILE_PROP_PRIORITY` (`consts.js`), `compileSnesData.js`'s per-scene
priority-tilemap override, `scene.c`'s DMA of it, the real `BG_TIL_PRIO` bit - this was purely
an editor UI gap: priority was buried as the 7th swatch inside the Collisions brush, not its
own page the way B's real `TOOL_COLORS`/`BrushToolbar.tsx` presents it. Checked B's actual
source (`gb-studio-3.2.1`, not just the audit's memory of it) rather than guess the naming:
`TOOL_COLORS = "colors"` (key shortcut `z`), `PaintIcon` for the `ToolPicker` button, a
`PriorityTileIcon` (a diamond with a vertical bar) for the priority toggle itself - all ported
verbatim (same tool id/shortcut/icons), but the *page* is scoped way down from B's real one:
B's `showPalettes` section also renders 8 clickable `PaletteBlock` swatches (`selectedPalette`,
a whole separate piece of state) for its real multi-palette editing - none of that applies
here (no `Palette` entity exists on this fork, see the removal note above), so our
`showPriority` section is just the one diamond-icon toggle, nothing else. It still writes
through the *existing* `selectedTileType`/`paintCollision` mechanism the Collisions tool
already uses (not B's unrelated `selectedPalette` one) - `TILE_PROP_PRIORITY` was always just
another bit in the same collision byte, so the new tool only had to stop sharing a toolbar with
collision-flag painting, not change how a painted tile is stored. `editorState.ts`'s `setTool`
reducer now arms `selectedTileType` to a tool-appropriate default on switch (`TILE_PROP_PRIORITY`
entering "colors", `COLLISION_ALL` entering "collisions") - without this a stale
`TILE_PROP_PRIORITY` left over from the Colors tool would silently make the Collisions brush
paint priority bits instead of whatever collision swatch it visually shows selected, since the
paint logic in `SceneCursor.js` only looks at the bit pattern of `selectedTileType`, not which
tool is active. `Scene.js`'s `showCollisions`/`showEntities` and `World.js`'s `showConnections`
all gained `TOOL_COLORS` alongside their existing `TOOL_COLLISIONS` checks - without this the
priority overlay (gold corner markers, already implemented in `SceneCollisions.js`) would stay
invisible while using the new tool unless the project's own "show collisions" setting happened
to also be on, making the tool unusable blind. The old 7th "priority" swatch is removed from
`BrushToolbar.js`'s `tileTypes` (and its now-dead `.BrushToolbar__Tile--priority` CSS deleted)
to match B's real list, which never included it there either. Verified: full test suite
(150 suites, 698 tests, no existing coverage touches these UI files so none needed updating),
a real `npm start` webpack + `fork-ts-checker` build with no TS errors (confirms
`editorState.ts`/`ToolPicker.tsx`).

**Movement Speed dropdown now shows real pixels/frame per option (user-asked: "like in GB
3.2.0, add to Speed dropdown list the PPF concerned for each speed").** `MovementSpeedSelect.tsx`
(shared by `ActorEditor.tsx`, `WorldEditor.tsx`'s player speed, and the `movementSpeed` script
field) now shows e.g. "Speed 3 (4 PPF)" in the dropdown menu via `formatOptionLabel`, matching
B's own `OptionLabelWithInfo` pattern but with this fork's real numbers, not B's - B's picker is
real sub-pixel movement (0.5/1/2/3/4 px/frame, matching its literal labels); this fork's is
still the index-based `MOVEMENT_SPEED_LOOKUP = [0, 1, 2, 4, 8]` (`src/lib/compiler/helpers.js`,
left as-is per an earlier M4 decision not to add a sub-pixel accumulator), so "Speed 3"/"Speed 4"
are arbitrary tier names that **don't** match their real px/frame (4 and 8, not 3 and 4) - this
is exactly the gap the PPF label now closes. Index 0 ("Speed ½") shows 0.5, not 0: the engine's
`move_speed==0` isn't "stationary", it's "advance 1px every other frame" (`scene.c`
`SceneUpdateActors`, `if ((time & 1) == 0) { x += dir_x; ... }`), an averaged 0.5 px/frame -
shown to match what the actor actually does, not the raw byte `moveSpeedDec` emits for index 0.
No new `Select` component needed - our fork's `Select.tsx` (a styled `react-windowed-select`)
already passes through `formatOptionLabel` like any react-select consumer.

**Shoot Em Up genre: 4 reported issues investigated (user: "player can't move / scrolling is
really slow / can't send projectiles / enemies are not moving nor sending projectiles"), then
a user follow-up ("I still can't move, it is still slow") after the first two fixes below
landed - that follow-up led to the real root cause.**

First pass found 2 real, narrow fixes (both still correct and still needed) using a synthetic
test fixture:
- `Update_Shmup`'s perpendicular-dodge check (`scene.c`) was a 3-term `&&` chain - the same
  816-tcc miscompile class already fixed 4 times elsewhere in this file (`actor_on_tile`,
  `in_box`, `col_solid`, `can_step`): a 3+-term `&&`/`||` chain in a conditional mis-links its
  false-branch target. Rewritten as nested single-condition `if`s with explicit
  `can_up`/`can_down`/`can_left`/`can_right` flags.
- `shooter_scroll_speed`'s default/max (see the Engine Fields section above) were ported from
  B's raw numbers without accounting for B's 16.4 fixed-point position scale (B's `16` =
  1px/frame; this engine's `1` = 1 whole px/frame - correctly ported *in isolation* but
  genuinely slower in absolute terms than a shooter wants). Landed on default `2` after a first
  overcorrection (mechanically copying B's raw `16`, giving an absurd 960px/s) was caught and
  reverted.

Those two fixes tested green in isolation - but didn't touch the user's actual symptom at all,
because both are inside `Update_Shmup`, and `Update_Shmup` never got a chance to run in the
real project: `SceneHandleInput()` refuses to call it while `script_ptr` is non-zero (a script
is running), and the scene's own init script was stuck forever, never reaching `EVENT_END`.

**The real root cause, found by rebuilding the user's actual project** (not just a synthetic
fixture - the user's own report "I still can't move" after the first two fixes already landed
was the signal this needed the real `.gbsproj`, downloaded test ROM notwithstanding): Space
Battle's own scene-init script does a real, authored `Actor: Move Relative` on the player
(4 tiles, blocking) - and **every one of its 15 enemy ships has its own `updateScript`** doing
a repeating bob/weave `Move Relative` on itself via a shared custom event. Two things combined
to break this:
1. **A real project-authoring gap, not an engine bug**: each enemy's `Move Relative` call site
   (inside the custom event "Enemy Ship Movement Vertical/Diagonal/…") refers to its actor
   parameter by the literal string `"0"` (the parameter's declared id, e.g. `actors: {"0": {id:
   "0", name: "Enemy Ship"}}`) - but none of the 15 `EVENT_CALL_CUSTOM_EVENT` call sites in the
   `.gbsproj` actually pass an `actors` binding for that parameter. With nothing bound,
   `getActorIndex("0", scene)` (`src/lib/events/helpers.js`) can't find a real actor with id
   `"0"` either, so `findIndex` returns `-1`, and `-1 + 1 = 0` - the exact same fallback that
   correctly resolves `"$self$"` to the player for a scene-level script. Every enemy's own bob
   script was unintentionally moving the *player*, not itself.
2. **The real, confirmed engine bug this fork needed to fix**: `update_script.h`'s own design
   note already flagged Camera Shake's `shake_time` and Await Input's `await_input` as unsafe
   to use inside an On Update script, because they're shared globals `UpdateScriptsProcess()`
   never swaps per-context - but missed that `ACTOR_MOVE_TO`/`ACTOR_MOVE_RELATIVE` have the
   *exact same* hazard: `BEGIN_MOVE` (`script_cmds.c`) writes `actor_move_dest_x/y` and
   `actor_move_settings` (plus, implicitly, which actor `script_actor` names) - none of which
   were part of `UPDATE_CTX` or swapped around the per-context loop. The moment *any* On Update
   context's own `Move Relative` ran, it stomped whichever move the foreground (or another
   context) already had in flight, by overwriting these shared globals. Concretely here: the
   scene-init script's own blocking move on the player got its destination silently replaced by
   whatever an enemy's bob script computed next (confirmed in Mesen: `actor_move_dest_x` jumped
   from a sane `40` to `696`, matching one enemy's own resting x position) - the arrival check
   (`SceneUpdateActors`) then never saw "arrived" again, `script_action_complete` never came back
   to `1`, and the scene's own init script - which the player's gameplay controls live
   downstream of - hung forever. This is why "player can't move" and "scrolling is slow" are
   the *same* bug, not two: the player genuinely never left the scene's own opening cutscene the
   whole time, so `Update_Shmup` (containing both of the fixes above) was simply never reached,
   and the tiny creeping position change the user saw was the stuck move's own abandoned-partial
   step (`move_speed` had just been set to 0 for that one cutscene move), not the real auto-scroll.
   **Fixed properly** (not just documented as a limitation, since "a bobbing enemy" is a very
   natural thing to want in an On Update script): `UPDATE_CTX` (`update_script.c`) gained its own
   `move_settings`/`move_dest_x`/`move_dest_y`, swapped in/out exactly like `wait_time` already
   was; the foreground's own copies are now saved/restored around the whole per-context loop the
   same way `fg_wait_time` already is. The arrival-check/aim logic itself (`SceneUpdateActors`'s
   old inline block) was extracted into a shared `u8 ActorMoveAim(void)` (`scene.c`, declared in
   `scene.h` so `update_script.c` can call it) - called once for the foreground (unchanged
   behaviour, same call site) and once per active context, right after that context's own move
   state is swapped in and its `ScriptRunnerUpdate()` turn runs (same ordering the foreground
   already gets: aim-check follows the opcode dispatch, so a move started this very turn takes
   its first step this same turn). Verified in Mesen against the real project: `actor_move_dest_x`
   stays at the real `40` (not `696`), the scene's own init script's `script_ptr` reaches
   `0,0,0` (really finishes) within the expected ~60-frame window instead of never, and
   `Update_Shmup` then runs for real - `dir_y` responds to a held Up press and the camera scrolls.
   **Known remaining gap, not hit by this project**: the stepping loop's `is_cmd` exception
   (lets a *hidden* actor still finish a scripted move - the earlier "Hide then Move Relative"
   fix elsewhere in this file) only covers the foreground's own `script_actor`, not a per-context
   mover - an On Update script hiding then moving *itself* would still hit that older bug. Not
   fixed here (no project exercises it yet); would need threading "which actors are currently
   being aimed by *any* active context" through the stepping loop, not just the foreground's one.
   The project-authoring half (unbound custom-event actor parameters) is the user's own fix to
   make - rebind "Enemy Ship" to `$self$`/the calling actor at each of the 15 On Update call
   sites - but no longer catastrophic once rebound correctly, since a *correctly*-self-targeting
   concurrent Move Relative now works too (per-context move state, same fix).
   *Correction, caught and retracted mid-conversation (not reflected in the paragraph above,
   which otherwise stands as written)*: this was itself a mistake - an unbound actor parameter
   does **not** need a project-side rebind at all. Re-checking `compileEntityEvents.js`/
   `eventCallCustomEvent.js` directly showed the unbound-parameter fallback already resolves to
   literal `"$self$"`, and for a custom event called from an actor's own script (updateScript or
   plain `script`), the compile-time `entity` context *is* that actor - so `$self$` already
   correctly targets the calling actor, not the player, with zero authoring changes needed.
   Verified empirically for this exact scene: each ship's own `Move Relative` genuinely targeted
   its own position. No project-side rebind was ever actually required for these 15 call sites -
   the per-context move-state engine fix above was the whole story. Independently reconfirmed
   byte-exact in a later, unrelated investigation (a real "Path to Sample Town" turnip-stomp
   scene's own unbound custom-event actor parameter, inside a plain actor `script` this time -
   see the `PlayerContactUpdate()` entry further down) - every reference correctly compiled to
   that specific actor's own real engine index, never the player's.
   A **separate, smaller finding along the way, left for follow-up, not fixed**: this scene's
   own background (`leaving_earth.png`) is 255 tiles wide, this engine's SC_64x64 addressing
   realistic ceiling - and `Update_Shmup` was observed running at well under 1:1 per real frame
   against it (confirmed by direct instrumentation: call-count stayed far below frame-count),
   independent of the bug above. This likely explains why the auto-scroll, even once genuinely
   running, still measured closer to ~1px/frame than the engine field's real `2` - a CPU/
   VRAM-streaming cost tied to the oversized background, the same class of gap the background-
   streaming work (Phase 1/2, see the roadmap artifact) exists to eventually close, not something
   attempted here.
   Also found, not a bug: `Launch Projectile`'s compiled wire format and runtime behaviour are
   both correct - a scene-init script's call matched its authored args exactly in WRAM, moved,
   and deactivated on schedule. The `PROJECTILE` struct's real stride is **14 bytes/slot** (13
   real fields + 1 trailing pad, not 12 or 13 - confirmed from the gap between the `projectiles`
   symbol and the next one in a `.sym` file), worth remembering for any future Mesen debugging
   of this subsystem.

**Shoot Em Up follow-up: enemies stopped moving/shooting after one pass, and a real
~5x slowdown once they didn't (both user-found, real project `sntst01`, 15 enemy ships,
not a synthetic fixture).** Two independent bugs plus one real perf cost, found by actually
building the project and instrumenting Mesen (a flat per-actor WRAM snapshot - `x`/`y`/
`update_ctx`/`moving` - read every frame), not by reasoning from the JSON alone.

1. **"Projectile sprite sheet not loaded in this scene" warned for every single enemy.**
   `compileSnesData.js`'s `scanRuntimeSpriteIds` (feeds a scene's own 8-slot OBJ pool,
   consumed by `scriptBuilder.js`'s `_projectileSpriteSlot`) scanned `actor.script`/
   `startScript`/`hit1-3Script` but never `actor.updateScript` - exactly where a real
   enemy's `EVENT_LAUNCH_PROJECTILE` call lives (the "On Update" tab is the natural place
   to author a repeating attack). Every projectile silently fell back to OBJ slot 0 (the
   player's own sheet) instead of its real graphic. Fixed: added `updateScript` to that
   scan, same as every other actor script field. Test: `compileSnesData.test.js` ("EVENT_
   LAUNCH_PROJECTILE inside an Actor's On Update script gets a real slot").
2. **Enemies stopped moving and shooting after exactly one bob/shoot cycle.** Traced via a
   live WRAM actor snapshot: `update_ctx` for most enemies read back `0xFF`
   (`UPDATE_CTX_NONE`) well before the test window ended - their On Update script had
   *genuinely finished*, matching `update_script.c`'s own documented, correct-per-GB-Studio-
   3.x runtime behaviour ("a completed update script doesn't auto-relaunch on its own" -
   confirmed directly against the real `gb-studio-3.2.1` reference checkout's
   `vm.c`/`script_terminate`: a script context really does terminate for good once `VM_STEP`
   returns false, no runtime auto-relaunch anywhere). The real missing piece was one level
   up: B's compiler (`compileData.js`) passes `loop: entityScriptField === "updateScript"`
   into `compileEntityEvents`, which wraps the script in a label + a one-frame yield
   (`idle()`) + an unconditional jump back to that label *instead of* the normal
   terminator - the loop lives in the compiled bytecode, not the runtime. This fork's own
   `compileEntityEvents.js` already had the **identical** mechanism ported in wholesale
   (`loop`/`labelDefine`/`nextFrameAwait`/`labelGoto`) - it was simply never passed
   `loop: true` from anywhere, so it had never been exercised. Fixed in two parts:
   `compileSnesData.js`'s `updateScriptIdx` now calls `compile(..., true)` for the loop
   flag; and the existing-but-dead loop code's own condition was *also* wrong and would
   have silently no-opped even with `loop: true` passed - it checked `input.length > 1`
   (raw top-level JSON event count) for both the label and the jump, but the single most
   common authoring shape for an update script is exactly one `EVENT_CALL_CUSTOM_EVENT`
   (reusing one enemy-behaviour script across many actors) - `input.length === 1`, so it
   would never have looped in practice. Fixed to match B's real condition exactly:
   `input.length > 0` for the label, `input.length > 0 && output.length > 1` (byte count,
   not event count) for the jump. Tests: `compileEntityEvents.test.js` (byte-exact: a
   single-event `loop: true` script now compiles to `[event bytes, NEXT_FRAME, JUMP 0 0,
   END]`; an empty script still doesn't loop; `loop: false` is unaffected).
3. **Once (1) and (2) together let all 15 enemies genuinely run their update script forever,
   a real, severe CPU cost appeared: ~0.2 ticks/real-frame (~12 fps) measured over 1000+
   frames, not just at scene start.** A Mesen bisection (temporarily no-op'd
   `UpdateScriptsProcess()` in `scene.c`'s `SceneUpdate`) isolated the *entire* drop to that
   one function - disabling it alone brought the ratio to a locked 1.0. Root cause: its
   per-context state swap (in `update_script.c`, run twice - once in, once out - for every
   *active* context, 15 times a frame here) unconditionally copied all `SCRIPT_STACK_SIZE`
   (8) `stack`/`start_stack` slots regardless of the script's real call depth - and nothing
   anywhere ever reads a slot at or past the current `stack_ptr` (only `Script_StackPush_b`/
   `StackPop_b` - Actor Invoke/sub-scripts - touch it at all; a plain custom-event call
   inlines at compile time instead and never pushes, so these particular scripts never use
   the stack beyond depth 0). Fixed: all 4 copy loops in `UpdateScriptsProcess` (foreground
   save/restore, per-context swap in/out) now bound by the real depth (`stack_ptr`) instead
   of the fixed `SCRIPT_STACK_SIZE`. Measured improvement: ratio 0.2 -> ~0.33 (a real ~65%
   relative gain) - a genuine win, but **not a full fix**: the remaining gap is the sheer
   cost of actually running 15 concurrent scripted VM contexts' own opcodes
   (`ScriptRunnerUpdate`/`ActorMoveAim`) every frame through 816-tcc's slow codegen, a
   stress shape this engine had never been exercised against before (every prior profiling
   pass in `PERF.md`'s history used AI-driven NPCs, not persistent per-actor scripts, and
   never more than ~9 actors). Flagged, not silently called "fixed" - a project leaning this
   hard on concurrently-active On Update scripts (15 of the 16-context pool, all genuinely
   busy every frame) may still want fewer simultaneously-active enemies, or a future
   dedicated profiling pass (same bisection method, applied inside `ScriptRunnerUpdate`/the
   hot opcode handlers themselves) if this specific shape becomes common. No test added for
   the perf change itself (matches this file's own established pattern - verified via a real
   Mesen tick-ratio measurement against the real project, not a unit test).

**Same-day follow-up: with bugs 1/2 above fixed, a new real project (`snes02`, 15 ships,
different from `sntst01`) immediately hit the real consequence (user-found: "player can't
shoot and enemies are not with projectile shapes and can't fire").** Investigated with the
same real-Mesen-state methodology as every finding above, plus two new verification
techniques this session: `emu.takeScreenshot()` (a real PNG capture, not inferred from
memory) and directly decoding the actual VRAM tile bytes + in-game CGRAM palette for a
rendering sprite, to settle a visual claim with certainty instead of eyeballing a screenshot.

- **"Enemies are not with projectile shapes" - investigated, not reproduced.** Decoded the
  real VRAM tile data an active enemy projectile's OAM entry actually pointed at, plus the
  real CGRAM palette bytes for its OBJ palette slot, and rendered both exactly as the PPU
  would - they match `bullet_left.png`'s own small round shape and green palette, not the
  enemy ship's graphic. (A first visual read of a zoomed screenshot crop looked ship-shaped
  and seemed to confirm a bug - directly decoding the real tile/palette bytes instead of
  trusting that visual impression is what caught the mistake; worth remembering as a
  methodology note, not just a one-off correction.) Likely just hard to see at 16x16 and slow
  (speed 1) against a starfield, not a rendering bug - not fixed, since nothing to fix was found.
- **"Player can't shoot" - real, root-caused.** `MAX_PROJECTILES` (4) is one small pool shared
  by every projectile source, enemy or player, with a plain first-come-first-served linear
  scan for a free slot. `EVENT_LAUNCH_PROJECTILE`'s wire format has never carried a lifetime
  (`scene.c`'s `PROJECTILE` struct comment: ttl 0 relies entirely on leaving the *scene* -
  2040px away at 255 tiles wide here - to despawn). Before the loop fix above, enemies died
  out after one pass and rarely filled the pool; now that all 15 fire forever, the pool fills
  almost immediately with enemy bullets and never meaningfully drains, so the player's own
  `LAUNCH_PROJECTILE` call finds no free slot and silently does nothing - confirmed directly:
  every active pool slot sampled, across every checkpoint, held an enemy bullet
  (`dir_x=-1`, matching their authored "left" direction), never the player's.
  **Fix** (asked the user directly via `AskUserQuestion` - three real options existed: give
  enemy bullets a lifetime, reserve a slot for the player, or just raise the pool size; user
  picked the first): `Script_LaunchProjectile_b` (`script_cmds.c`) now passes a fixed
  `LAUNCH_PROJECTILE_TTL` (180 frames = 3s, chosen the same way `WEAPON_ATTACK_TTL` already
  was - a flat frame count, not distance-based) to `ProjectileSpawn` instead of `0`, applying
  uniformly to every `LAUNCH_PROJECTILE` call regardless of who fires it (simplest
  implementation, matches `WEAPON_ATTACK_TTL`'s own existing precedent exactly, no wire-format
  change needed since ttl was never author-exposed to begin with). Verified in Mesen over a
  ~900-frame real-project run: the pool genuinely cycles now (sampled with fewer than 4 active
  slots at times, impossible before), and repeated player press attempts (one every 20 frames)
  succeeded 11 times in a row once the scene settled past its own intro + the initial
  all-15-enemies-starting-at-once swarm (~frame 680 onward in this specific real project) -
  not a 100%-every-single-press guarantee (a dense early swarm can still momentarily fill 4
  slots), but a real, working fix for the reported "can't shoot at all" state. No JS-level test
  added - this is a pure C-engine runtime constant with no compiler/wire-format surface to test
  (confirmed no `Projectiles`/`WeaponAttack` JS test file exists in `test/events/` at all);
  verified the same way the perf fix just above was, a real Mesen measurement against the real
  project.

**Fixed VRAM layout + BG1 tile budget raised 256→1024 (2026-10-06, user-driven).** Prompted by
an exploratory question ("why do we limit max tiles to 256 tiles per map?"); investigating it
surfaced that BG1's tilemap address (and therefore the budget) silently depended on whether a
scene routed through the Map Engine or the hand-rolled streaming path (`0x0000` either way in
practice, but by two different, unrelated code paths computing the same address, not a single
source of truth) — the user then gave an explicit, precise directive (citing a sibling project's
`gfxs.h` as the pattern to follow) to make every VRAM region's address **fixed and identical**
regardless of routing: OBJ gfx `0x0000`, BG1 gfx `0x2000`, BG3 gfx `0x6000`, BG1 map `0x6800`,
BG3 map `0x7800`. Addresses were checked against real PVSnesLib register-alignment constraints
before implementing, not guessed — read directly from the vendored asm
(`pvsneslib/source/sprites.asm`, `backgrounds.asm`): `BGxNBA` only needs 4KB/`0x1000`-word
alignment, but the OBJ tile-base register needs coarser 16KB/`0x2000`-word alignment, which is
why OBJ and BG1 gfx can't simply swap. New shared constants in `scene.h`
(`OBJ_GFX_VRAM`/`BG1_GFX_VRAM`/`BG1_MAP_VRAM`) replace the scattered hex literals previously
duplicated across `game.c`/`scene.c`. **A real bug this move would otherwise have introduced,
self-caught via code audit, not user-reported**: `scene.c`'s hand-rolled `StreamColumn()` (used
by a wide+parallax scene's background streaming — the Map Engine can't coexist with parallax's
HDMA, see the Map Engine entry elsewhere in this file) computed its destination VRAM word with
no base offset, implicitly relying on the tilemap living at the old `0x0000`. Once the tilemap
moved to `0x6800`, this would have silently streamed background columns straight into OBJ's new
`0x0000` region instead — fixed by adding `BG1_MAP_VRAM +` to the destination computation;
verified in Mesen by walking the real "Parallax Example" scene across its entire width with
clean rendering throughout (and no corruption of OBJ's graphics mid-walk). Once BG1's address
was fixed and no longer shared contested space with OBJ, the user asked to raise
`maxTilesetTiles` 256→1024: the real ceiling turns out to be the tilemap cell format itself (a
16-bit word, `tile | pal<<10 | prio<<13 | xflip<<14 | yflip<<15` — only a 10-bit tile-index
field), not a VRAM-size choice, so 1024 is the true hardware maximum, not an arbitrary bump.
Verified with a dedicated stress test: a synthetic hash-based noise PNG (guaranteed not to
tile-dedup, unlike a hand-drawn background) built near the new 1024-tile ceiling compiled and
linked with no VRAM collision against the now-adjacent BG3 region. `PERF.md`'s VRAM table was
rewritten to the new fixed addresses; while updating it, also caught and fixed a stale,
unrelated figure — BG3 font size was documented as `~0x307` words (775) but the real committed
`UI_FONT_SIZE` is `3760` bytes = `1880` words (`~0x758`) — corrected. Tests:
`targets.test.js`'s `maxTilesetTiles` expectation updated to 1024.

**`!S0!`-`!S5!` inline typewriter-speed codes in dialogue text (2026-10-06, user-asked, after a
scoping question: "what do you need to change to implement it").** GB Studio 3.x's real
authoring convention lets a dialogue string switch typewriter speed mid-sentence via
`!S0!`-`!S5!` tokens; this fork's `trimlines.js` already recognised the tokens for line-wrap
math (excluding them from character-count limits — `commandRegex`, tested already) but nothing
ever compiled them to anything — a literal `!S3!` reached the ROM's string table unchanged and
rendered as 4 garbage glyphs. Implemented end-to-end, following the project's existing
`$NN$`/`#NN#` runtime variable-substitution mechanism (`ui_subst()` in `ui.c`) as the template
for a second inline-control-code mechanism: `trimlines.js` gained `encodeTextSpeedCodes(text)`,
called from `scriptBuilder.js`'s `textDialogue()` immediately after `trimlines()` (ordering
matters — `trimlines()` still needs the literal `"!Sx!"` text present to correctly exclude it
from line-wrap math; encoding to raw bytes first would break that). Each match becomes 2 raw
bytes: a `0x01` sentinel (`UI_SPEED_CODE`, new in `ui.c`) followed by `speed + 1` — the `+1` so
a `!S0!` code never embeds a literal `0x00`, which `ui_subst()`'s C-string-style scanning would
otherwise read as the string terminator. Engine side: `ui_wrap()` skips the 2-byte code in both
its per-character column-counting loop and its inner word-length-scanning loop (mirroring how it
already must skip past `$NN$`/`#NN#`); `ui_reveal_char()` loops past any run of speed codes
before revealing the next real character, writing each one straight to the existing
`ui_text_speed` static — the same variable the pre-existing `TEXT_SET_ANIM_SPEED` opcode already
writes, so the inline code is simply a second way to set it, with no new runtime state. Verified
two ways: a byte-level ScriptBuilder test (`scriptBuilder.test.js`) asserting the exact compiled
string contents for `"Hi!S3!there"`; and two real Mesen runs of a toolchain-built ROM reading
real WRAM — first with `!S0!` (byte-exact proof the sentinel/value decode correctly, though
`ui_speed_tick()`'s own thresholds make speeds 0-2 visually indistinguishable, all ticking every
frame), then re-run with `!S5!` for a genuinely observable effect: the dialogue
`"AAAAAAAAAA!S5!BBBBBBBBBB"` revealed its ten A's in 15 frames (default speed) then its ten B's
in 63 frames — matching `ui_speed_tick(5)`'s real 1-in-8-frame throttle almost exactly — with a
clean mid-reveal screenshot showing no garbage characters from the control bytes. Tests:
`trimlines.test.js` (5 cases: basic encode, speed-0 never emits a literal 0x00, speed-5 encodes
as byte 6, multiple codes in one string, text with no codes unchanged), `scriptBuilder.test.js`
(byte-exact compiled output).

*Correction to the paragraph above*: it described `#NN#` as part of "the project's existing
`$NN$`/`#NN#` runtime variable-substitution mechanism" - at the time this was written, only
`$NN$` actually had a runtime decoder; `#NN#` was real only at compile time (the compiler
resolved the syntax, `trimlines.js` excluded it from line-wrap math) with no corresponding
`ui.c` handling, so it printed as literal `#00#` text in-game. Found and fixed the same day
while writing `docs/dialogue-variables.md` (see below) - the paragraph above is left as written
since the `!Sx!` work itself didn't depend on `#NN#` being real, but this note avoids it being
read as still describing `#NN#`'s state afterward.

**`docs/dialogue-variables.md` added, and the `#NN#` gap it surfaced fixed (2026-10-07,
user-asked, inspired by [gbstudio.dev's own dialogue-variables page](https://www.gbstudio.dev/docs/scripting/dialogue-variables)).**
Writing the new page (linked from Scripting Events' Text section) meant checking every
variable/text code actually implemented on this fork, not assuming GB Studio's real syntax
carried over unchanged - it doesn't: this fork implements GB Studio 3.x's plain `$NN$`/`#NN#`/
`!Sx!` convention, not 4.x's newer `%D$`/`%c$`/`%t$`/`%f$`/`!Font`/`!Instant`/`!Wait`/`!Cursor`
set (none of which exist here - no GBVM, no multi-font support). Verifying `#NN#` specifically
(the editor-facing form of `$0$`/`$L0$`/`$T0$`/`$V0$`'s "as a character, not digits" sibling -
`replaceVariables()` in `scriptBuilder.js` already resolved all 8 forms, `$NN$`/`#NN#`, to
their final 2-digit global index) surfaced the real gap described in the correction above:
`ui_subst()` had no `'#'` branch at all, only `'$'`. Fixed by adding a parallel branch,
mirroring the `$` one's structure (`ui.c`): decode the 2-digit index, then write
`script_variables[vi]` into `ui_text` as one raw byte instead of up to 3 decimal-digit
characters. Embedding a raw `0` byte here is safe (unlike `!Sx!`'s `+1` offset trick) because
nothing downstream of `ui_subst()` scans `ui_text` for a null terminator - `ui_wrap()`/
`ui_reveal_char()` both bound their loops by the explicit `ui_len` set at the end of
`ui_subst()`, confirmed by reading both functions before relying on this. Documented, not
fixed: a substituted value below `0x20` has no real glyph - `UI_CHAR`'s `c - 0x20` wraps
(unsigned underflow) into the font region's non-printable tiles (the box-frame 9-slice and
cursor, stored immediately after the 224 real glyphs) instead of blanking or erroring, so an
out-of-range variable renders visual corruption, not nothing; matches the general "author's
responsibility to keep the value sensible" character of this feature in the real GB Studio
reference too, so left as-is rather than adding a runtime clamp nothing asked for. Verified
with the project's own established real-ROM-plus-Mesen methodology: a throwaway project (`Set
Variable 0 = 65` → `Display Text "Char:#0#!"`) built through the real toolchain and run in
Mesen - WRAM `ui_text` read back the exact bytes `Char:A!` (`0x41` where `#0#` was authored,
matching 65's ASCII value), and a screenshot confirmed the box visibly renders `Char:A!` with
no corruption. No JS-level test added - pure `ui.c` runtime change, no compiler/wire-format
surface (the compiler-side `#NN#` → `#NN#`-resolved-index behavior already had coverage before
this fix, in `scriptBuilder.test.js`/`trimlines.test.js`, and didn't change).

**Named animation states / metasprite editor ("Path A"/"Path B"), attempted and fully reverted
(2026-10-07 through 2026-10-09).** A multi-day effort tried to give sprite sheets named,
per-state animations (`SpriteState`/`SpriteSheet.animSpeed`/`defaultSpriteType`, a grouped
"ANIMATIONS" tree + "Animation Settings" panel) and, further, a real GB Studio 3.2-style
metasprite editor (`SpriteSheet.animationStates` → `AnimationState` → `AnimationType`-derived
`SubState` → `Frame` → `MetaspriteTile`, click-to-place tile composition, a `compileSnesSprites.ts`
compiler emitting real PVSnesLib `t_metasprite` records - never wired into the build). Several
UI passes tried to reconcile the new panels' layout with the existing editor and never actually
matched GB Studio 3.2's real page (overlapping panels, wrong positioning, a "big garbage" layout
after one attempt) - user-rejected as not matching intent across multiple rounds, and finally
asked for all of it removed: "it is not working, you don't understand what I want."

Reverted in full: the `src/components/sprites/` directory, `compileSnesSprites.ts` and its
test, the Path A editor panels (`SpriteAnimationSettingsPanel.tsx`, and
`SpriteAnimationsPanel.tsx` restored to its pre-Path-A flat, ungrouped form, then removed
entirely - see the follow-up paragraph below), `SpritesPage.js` restored to its pre-Path-A
shape, the `SpriteAnimationState`/`SpriteSubState`/`SpriteFrame`/`MetaspriteTile` types and
their 7 reducers in `entitiesState.ts`, `SpriteSheet.animSpeed`/`defaultSpriteType` (both the
type fields and their `compileSnesData.js`/engine wiring - the scene blob's per-slot OBJ table
is back to `[24]` bytes, `sprite_anim_speed_for_slot` is gone from `scene.c`/`scene.h`/
`script_cmds.c`), and the associated l10n keys/tests. The pre-existing, actually-shipped
mechanism this reverts *to* - `SpriteSheet.type` (static/animated/actor/actor_animated) +
`numFrames`, compiled by `compileSnesData.js` into the per-scene sprite tables
`SceneAnimateActors` (`scene.c`) auto-cycles - is untouched and still exactly as documented
elsewhere in this file. Also untouched: `SpriteState`/`states` (the "Set Sprite State"
scripting event's own data, `eventPlayerSetState.js`/`eventActorSetState.js`/
`SpriteStateSelect.js`) - a real, older, unrelated feature that happened to share the word
"state" with Path A's unrelated per-sheet-default feature.

Not reverted (unrelated real fixes that landed in the same commits as this work):
`PlayerContactUpdate()`'s actor-script fallback fix (below) and the VRAM/dialogue-code work
documented elsewhere in this file.

**Follow-up, same week (user-found: "tu as laissé la partie frames et la partie animation
dans la view sprites" - the Sprites page still showed a Frames panel and a flat Animations
list after the revert above).** Those two panels (`SpriteFramesPanel.tsx`/`.css`, the flat,
ungrouped `SpriteAnimationsPanel.tsx`) and the `getSpriteAnimations()` helper
(`spriteAnimations.js`) actually **predate** Path A/B entirely (confirmed via `git log
--follow`: commits `6a46373`/`68ca733`/`89e0608`, all well before `b4bc399`) - they were kept
in the first revert pass on the reasoning that they're part of "the already-shipped
mechanism," not Path A/B's own addition. Checking the real GB Studio 2.0.0-beta5 reference
checkout directly (`SpritesPage.js`, `entitiesTypes.ts`, `loadSpriteData.js`) showed this
reasoning was too generous: GB Studio 2.0.0-beta5 itself has **no** Frames/Animations UI at
all - its own `SpritesPage.js` is exactly `ImageViewer` + `FilesSidebar`, nothing else; sprite
type/frame-count there is purely file-derived data with no named-animation surface in the
editor whatsoever. So this fork's own Frames/Animations panels, however old, are themselves a
later *addition* beyond the real GB Studio baseline - and the user's explicit, literal
instruction from the first revert ("only list, edit button as in V1.1.9") excludes them too.
`SpritesPage.js` is now restored to the exact 2.0.0-beta5/v1.1.9 shape (confirmed byte-for-byte
against the real 2.0.0-beta5 checkout) - just `ImageViewer` + `FilesSidebar`.
`SpriteFramesPanel.tsx`/`.css`, `SpriteAnimationsPanel.tsx`, `spriteAnimations.js`, and
`test/helpers/spriteAnimations.test.js` are deleted outright (a first attempt was blocked by
Claude Code's own auto-mode permission classifier, "Irreversible Local Destruction" - not a
project policy, just a sandbox guard that needed the user's explicit go-ahead to clear). The
`.FilesSidebar__StatesDock` CSS rule and the `FIELD_FRAMES_FOR`/`FIELD_ANIMATIONS`/
`FIELD_IDLE`/`FIELD_IDLE_DIR`/`FIELD_MOVING_DIR` l10n keys, both dead once those files are gone,
are removed too.

A future attempt at named/richer sprite animations should start fresh, not resume from this
history.

**`PlayerContactUpdate()` only fired the scene's own playerHit1/2/3Script, never the touched
actor's own script - silently breaking real GB Studio sample content (user-found: "turnip in
sample town scene are not using collision", pointed at a real GB Studio 3.2.1 "Path to Sample
Town" sample scene, `C:\temp\s0910_2`).** The turnip's whole stomp/hurt/defeat/counter logic
(bounce the player if hit from above, else hurt and reposition them, decrement a counter,
eventually hide the turnip) is authored entirely inside each Turnip actor's own plain `script`
field (`collisionGroup: "1"`, calling a shared "Turnip Collisions" custom event) - with the
scene's own `playerHit1Script` left completely empty, exactly how this official sample is
really authored. `PlayerContactUpdate()`'s own code comment already documented the relevant
trade-off it made: "B's `actors_handle_player_collision()` fires `script_p_hit1/2/3` + the
actor's own script... this engine only ever runs one script at a time project-wide... picking
one [the scene script] consistently... beats trying to fire two" - but picking *only* the scene
script meant any project (like this one) that authors the touched actor's *own* script instead
had that content silently dead, with no error or warning anywhere.

The user's own first lead - an animation-type mismatch (GB: `Fixed Direction`, 2-frame
Idle + 1-frame Explode across two named states; SNES: this engine's own flat 3-frame sheet,
auto-detected as `actor`/Multi Direction) - was checked and ruled out: `s0910_2.gbsproj`'s 3
Turnip actors already carry the existing per-actor `spriteType: "static"` override
(`ActorEditor.tsx`'s own Sprite Type field), correctly forcing the engine's existing
non-directional rendering regardless of the sheet's own 3-frame `actor` type - confirmed via
`spriteTypeForActor`/`spriteTypeDec` in `compileSnesData.js`. Not a perfect match for GB's real
2-state (Idle/Explode) breakdown - this engine has no per-state frame sub-range concept at all -
but not broken, and not the cause of this bug.

The real root cause, found by reading `scene.c` directly rather than continuing to reason about
the animation-type lead: `SceneTryInteract()` (the A-press interact) explicitly skips any actor
with `collision_group` set, by its own design (its own comment: "never A-press-interactable,
only contact-triggered") - and `PlayerContactUpdate()`, the function meant to be that contact
trigger, never actually ran the touched actor's own script at all, only
`event_ptrs[player_hit_idx[...]]` (the scene-level script). Confirmed the compiler side was
never at fault first, byte-exact: compiled the real project (`compileSnesData` on the real
`s0910_2.gbsproj`) and decoded the Turnip actors' own compiled `script` bytes directly - every
`actorId: "0"` reference inside the inlined "Turnip Collisions" custom event (left unbound at
the call site, so `eventCallCustomEvent.js` substitutes `"$self$"`) correctly resolved to each
turnip's own real engine actor index (2, 4, 5 for Turnip 1/2/3 respectively, matching their
real position in `scene.actors`+1 for the player slot) - not the player, not each other. A
second, independent, byte-exact confirmation of the same already-corrected understanding from
the earlier Shmup "unbound custom-event actor parameter" investigation (see that entry's own
retraction note above) - `eventCallCustomEvent.js`'s real `|| "$self$"` fallback correctly
resolves to whichever actor's script is actually being compiled, including a plain top-level
`script` field, not just an `updateScript`.

Fixed by mirroring this file's own existing, architecturally identical precedent one function
below - `projectile_fire_hit_script()` (a projectile with a matching `collision_group` hitting
an actor already runs *that actor's own* `script`/`hit1/2/3Script`, never a scene-level
fallback) - exactly the shape `PlayerContactUpdate()` should have used for the mirror case
(the player's own body touching an actor). `PlayerContactUpdate()` now tries the scene script
first (`event_ptrs[idx].ptr[0] != 0` - the same "a compiled script is never truly empty,
`EVENT_END` is a real byte" check `SceneTryInteract()`'s own actor-script gate already uses),
and falls back to the touched actor's own `events_ptr` only when that scene script is empty -
purely additive: a scene that already authors `playerHit1/2/3Script` keeps exactly the same
behaviour (its script isn't empty, so the fallback never triggers); only the previously-broken,
empty-scene-script case gains real behaviour.

Verified three ways: `yarn jest buildSnesRom` (the engine tree still compiles/links against
the real vendored toolchain) and the full JS suite stayed green (151 suites, 738/741) with no
JS-level change at all (pure C); then a real A/B Mesen run against a minimal synthetic repro
(cloned `test/projects/Test_Math`'s fixture shape, one actor with `collisionGroup: "1"`
standing on the player's own start tile, its `script` setting `script_variables[0] = 42`, scene
`playerHit1Script` left empty - the exact bug shape) - built through the real toolchain
(`buildProject()`), read via `emu.read(addr, emu.memType.snesMemory, false)` against the real
`game.sym` address for `script_variables` (per
[[mesen-snesmemory-addressing-correction]]): **before** the fix, `script_variables[0]` read
back `0` (unchanged - the actor's script genuinely never ran); **after** the fix (the same ROM
rebuilt with no other changes), it read back `42`. The negative-control half (`git stash` to
temporarily remove just this fix, rebuild, re-run, confirm it reverts to `0`, then `git stash
pop`) is what makes this a real A/B result rather than a single data point that could have had
some other explanation. No JS/compiler test added - pure C engine runtime change with no
compiler/wire-format surface, verified the same real-ROM-plus-Mesen way every other engine-only
fix in this file's history has been.

**New event: `EVENT_MOSAIC` (Screen: Mosaic), user-requested, SNES-exclusive hardware
pixelisation.** Modeled on Fade In/Out's own architecture end to end (`eventMosaic.js` →
`scriptBuilder.js`'s `mosaicSet` → `Script_MosaicSet_b` → a new `mosaic.c`/`.h` pair mirroring
`fade.c`'s frame-ticked ramp), not on the file layout the request described (`eventTypes.js`,
a per-event React component, a `compileEntityEvents.js` switch/case) - this fork's real
architecture auto-loads one `src/lib/events/event*.js` per command, keyed by its own `id`, with
no central registry or per-event component to touch (see "Events are the extension point"
above); fields render generically from the `fields` array, and `compileEntityEvents.js` already
dispatches to `events[command].compile()` with no changes needed there at all.

Writes `REG_MOSAIC` (0x2106: bits 7-4 = block size 0-15, bits 0-3 = per-background enable -
bit0 BG1, bit1 BG2, bit2 BG3, bit3 BG4, confirmed from PVSnesLib's own `background.h`) directly,
rather than calling PVSnesLib's existing `setMosaicEffect(mode, bgNumbers)` (`videos.asm`,
checked against the real source in the full PVSnesLib checkout at
`snesdev/pvsneslib/pvsneslib/source/videos.asm`, not just the header comment): that helper
blocks the CPU for the entire ramp (16 fixed steps x 3 vblanks each via `WaitForThreeVBlanks`,
always the full 0..15 range) - fine for a one-off effect, but it would stall this engine's
cooperative script VM and every other actor/animation for 48+ frames, and has no way to target
a partial size or a configurable step rate the way the event's own `size`/`speed` fields ask
for. `mosaic.c` is a from-scratch, non-blocking module instead, structurally identical to
`fade.c` (`mosaic_size`/`mosaic_target`/`mosaic_step_frames`/`mosaic_tick`/`mosaic_active`
mirror `fade_level`/`fade_target`/etc. exactly) - `MosaicUpdate()` is called once/frame from
`game.c`'s main loop right after `FadeUpdate()`, ramping `mosaic_size` toward `mosaic_target`
by 1 every `speed` frames (0 = every frame) and writing `REG_MOSAIC` on each step.

Only **BG1** and **BG3** are offered as targets (two checkboxes, both default-checked) - BG2 is
unused by this engine (`game.c` disables it) and BG4 doesn't exist in Mode 1, so neither bit
would do anything. **Sprites/OBJ have no hardware mosaic at all on the SNES** - the register
only ever divides BG layers - so the request's optional third "Sprites" checkbox was dropped
rather than added as a control with no real effect; `mosaic.h`'s own comment states this
explicitly for the next person who wonders why it's missing.

New `wait` checkbox (`FIELD_WAIT_UNTIL_FINISHED`, reused as-is - already exists for Sound: Play
Effect's identical concept) gives Mosaic a choice Fade doesn't have: `wait = true` blocks the
script until the ramp reaches `size` (`mosaic_script_wait = 1; script_action_complete = 0;`
exactly like `Script_FadeIn_b`/`Script_FadeOut_b`); `wait = false` starts the ramp and lets the
script continue immediately in the same tick (`script_continue = 1`, matching every other
non-blocking opcode's own convention, e.g. `Script_ActorSetAnimate_b`) while `MosaicUpdate()`
keeps ticking across subsequent frames regardless of what the script does next - the same
decoupled-from-the-VM relationship `IsFading()`/`FadeUpdate()` already have with the main loop.

New opcode `MOSAIC_SET` appended at the very end of `scriptCommands.js` (index 0x79) - appending
rather than inserting mid-list keeps every earlier opcode's index unchanged, matching how
`ACTOR_START_UPDATE` was added before it. `SCRIPT_CMD_COUNT` (`script_runner.h`) bumped
121 -> 122; `script_cmd_args[7]`'s existing size already covers this opcode's 4 argument bytes
(`size`, `bgMask`, `speed`, `wait`) with no change needed. Verified: `yarn jest buildSnesRom`
(the real engine, including the new `mosaic.c`/`.h`, compiles and links against the real
vendored toolchain to a bootable ROM), the full JS suite green (150 suites, byte-exact
`scriptBuilder.test.js`/`eventMosaic.test.js` coverage of both the blocking and non-blocking
wire format, `snesScriptCmds.test.js`'s opcode-table contract unaffected by the new row), and a
real `npm start` build with no TS errors. Not yet Mesen-verified on real hardware timing (no
project in this repo exercises it yet) - the byte format and the blocking/non-blocking split
are exercised by tests the same way every other opcode's wire format is, but the visual ramp
itself (and the one architectural assumption carried over from Fade without re-deriving it -
that writing a PPU register once per frame outside the vblank-gated block in `game.c`'s main
loop, the same spot `FadeUpdate()` already does this from, is safe here too) has not been
confirmed against a real running ROM the way this file's engine-only fixes normally are.

**Editor bug: "Add Trigger" silently did nothing on any scene except the very first thing
created in a given session (user-found: clicked the Trigger tool, saw the `+` cursor, no
console error visible at first - a follow-up report caught the real error: `TypeError: Cannot
assign to read only property 'triggers' of object '#<Object>'` at `addTriggerToScene`).**
Root-caused with a real reproduction, not by reading code alone - the existing
`entitiesState.test.ts` coverage for `addActor`/`addTrigger` all hand-roll their `state` as a
plain object literal, so `reducer()` only ever runs *once*, against a state Immer never froze;
that masks this bug completely, since it only exists once a *real* dispatch's own output
(immer's `autoFreeze` deep-freezes everything `produce()` returns) is fed into a *second*
dispatch. Confirmed with a minimal, isolated `createSlice`/`createEntityAdapter` reproduction
(not the full `entitiesState.ts`) before touching any real code, to rule out a project-specific
cause first: `addActor`/`addTrigger` looked up their target scene via
`localSceneSelectors.selectById(state, id)` - one of `createEntityAdapter`'s generated
selectors, wrapped by RTK's own `createDraftSafeSelector`, which calls immer's `current(state)`
whenever `state` is a draft, specifically so reselect's memoization has a *stable* value to
compare against rather than a live, mutating proxy. `current()` returns a plain, **frozen**
snapshot, not the live draft - fine for *reading*, but `addActorToScene`/`addTriggerToScene`
assign straight into `scene.actors`/`scene.triggers` (`scene.triggers = [...].concat(...)`),
which needs a live, mutable draft. The result: adding an actor/trigger to a scene that was
created in an *earlier*, separate dispatch (i.e. any scene except the special case where
`addScene` itself immediately populates `defaults.actors`/`defaults.triggers` on the exact same
`fixedScene` object within its own single dispatch) threw this exact error - confirmed via a
`console.log(isDraft(scene), Object.isFrozen(scene))` probe in an isolated repro:
`isDraft` false, `isFrozen` true, the instant `getSelectors()` was introduced into an otherwise-
identical minimal test that passed without it. Audited every other `local*Selectors.selectById`
call site in the file for the same pattern (about 20 of them) - all the others only *read* the
selected value and feed it into the entity adapter's own `updateOne`/`upsertOne` (e.g.
`moveActor`'s `scenesAdapter.updateOne(state.scenes, { id, changes: {...} })`), which is the
correct, Immer-safe way to mutate and was never affected; only these two direct-assignment call
sites were broken. Fixed by reading `state.scenes.entities[id]` directly in both
`addActor`/`addTrigger` instead of through the selector - bypasses `createDraftSafeSelector`'s
unwrapping entirely, so the live draft is what gets mutated. Tests: two new cases in
`entitiesState.test.ts` chain two *real* `reducer()` calls (`addScene` then `addTrigger`/
`addActor`) specifically to exercise the cross-dispatch freeze a hand-rolled `state` fixture
can't reach - added right next to the existing (still-passing, still correct, just
insufficient on their own) single-dispatch tests, not replacing them. Full suite green (150
suites, 711 passing), a real `npm start` build with no TS errors.

**React warning: "Can't perform a state update on an unmounted component" in `SceneInfo`
(user-found: dragging the player start marker to a different scene in the World editor).**
`SceneInfo.js`'s `debouncedRecalculateCounts` (a 100ms `lodash/debounce` around
`recalculateCounts`, which ends in `this.setState(...)`) was never cancelled in
`componentWillUnmount` - only the separate tooltip `setTimeout` was. Moving the player's start
position re-focuses the World editor onto a different scene, unmounting the old scene's
`SceneInfo`; if that unmount landed inside the pending 100ms debounce window, the scheduled
`setState` fired against a component React had already torn down. Fixed by also calling
`this.debouncedRecalculateCounts.cancel()` in `componentWillUnmount`, the standard fix for this
very common React + lodash-debounce pattern. Audited every other `lodash/debounce` user in
`src/components`/`src/containers` for the same gap: `ScriptEditor.js`'s `debouncedLoadMore` had
the identical bug (also fixed, same one-line `.cancel()` addition) - `SpriteSheetCanvas.js`'s
`debouncedDraw` only posts to a Web Worker and already un-registers its response listener on
unmount (no local `setState` involved, so a late-firing draw is a harmless no-op), and
`AppToolbar.tsx`/`WorldPage.tsx`'s debounced callbacks only `dispatch()` to Redux (fine to call
after unmount - Redux doesn't care about component lifecycle) - neither needed a change.

**Three unrelated console warnings in the World editor (user-found: clicking a scene in the
`sneshtml`/`snesgbs2` sample project).** All three were real, pre-existing latent bugs, not
caused by anything in this session - just never surfaced before because they're warnings, not
crashes.
- `Tabs.tsx`'s `TabBar` mapped its tab buttons with no `key` prop at all (`tabKeys.map((tab,
  index) => <Tab ...>)`), triggering React's generic "Each child in a list should have a
  unique key prop" warning for every `Tabs`/`TabBar` instance that renders more than one tab
  (the sidebar's World/Settings-style tab switcher). Fixed with `key={tab}` - `tab` is itself
  a string from `Object.keys(values)`, already guaranteed unique.
- `ScriptEditor.js`'s own `propTypes` declared `pasteCustomEvents: PropTypes.string.isRequired`
  - a copy-paste leftover (everything around it is a real dispatch-bound function) - while the
  component calls it as a plain function (`pasteCustomEvents()`) and `mapDispatchToProps` wires
  it to `clipboardActions.pasteCustomEvents`, a real action creator. Fixed to
  `PropTypes.func.isRequired`, matching every sibling prop in the same block.
- `ScriptEventForm.js`'s `engineFields` prop was declared `PropTypes.objectOf(EngineFieldShape)`
  but is both used as an array (`engineFields.find(...)`) and sourced from `state.engine.fields`
  (`EngineFieldSchema[]` in `engineState.ts`) - genuinely an array the whole way through, not an
  object. Fixed to `PropTypes.arrayOf(EngineFieldShape)`, matching `defaultProps.engineFields:
  []` (which was already correct - only the type declaration was wrong).

**Not fixed, not ours to fix**: a fourth warning in the same report ("`componentWillReceiveProps`
has been renamed..." for `DragSource(ScriptEditorEvent)`/`DropTarget(DragSource(ScriptEditorEvent))`)
comes from `react-dnd`'s own internal HOC implementation at the pinned `2.6.0` version (2017-era,
predates the lifecycle rename) - confirmed by grepping this project's own `ScriptEditorEvent.js`
for the method name (no match). Fixing it for real means upgrading `react-dnd` across several
major versions (a real API rewrite, not a drop-in bump) - out of scope for a warning-only,
dev-mode-only issue.

**Engine bug: Turnip actors in a real GB Studio 3.2.1 sample ("Path to Sample Town") walked
straight through collision tiles despite their own On Update "bob" (`Move Relative`) having
"Use Collisions" checked (user-found: "les actors turnip ne sont pas bloqués par les tiles à
collisions comme le tile en pixel tile 59,13").** Confirmed directly against the real
`snesgbs2` template's own project JSON before touching any code: every one of the Turnip's
`Move Relative` calls (inside its "Turnip Movement" custom event) is authored with
`"useCollisions": true` - this wasn't a project-authoring gap, the engine was just silently
ignoring a real, user-checked setting. Root cause: `useCollisions` has compiled to a real
wire-format byte since v2 (2.0.0-beta5) - `eventActorMoveRelative.js`'s own checkbox field,
threaded through `scriptBuilder.js`'s `actorMoveRelative`/`actorMoveTo`/`actorMoveToVariables`
exactly as documented - but `script_cmds.c`'s shared `BEGIN_MOVE` macro (used by all three
opcodes' handlers) unconditionally OR'd `ACTOR_NOCLIP` into `actor_move_settings`, regardless
of what that byte said. `actor_try_move`'s own NOCLIP branch (`if (actor_move_settings &
ACTOR_NOCLIP) { ...; return; }`) short-circuits past the `npc_blocking`/`can_step` checks
entirely before they ever run - so every scripted Move To/Move Relative on this engine ignored
collision completely, no matter what a project author checked in the editor. The comment right
above the macro had even already named this gap ("a collision-aware destination clamp...
neither implemented on this engine yet") without anyone connecting it to a real reported bug
until now.

Fixed by giving `BEGIN_MOVE` a third parameter (`useCollisions`) and only OR'ing in
`ACTOR_NOCLIP` when it's false, updating all three call sites
(`Script_ActorMoveTo_b`/`Script_ActorMoveRel_b`/`Script_ActorMoveToVal_b`) to pass their own
already-compiled byte (`script_cmd_args[2]`/`[4]`/`[0]` respectively - confirmed against each
opcode's real `args_len` in the dispatch table). A collision-respecting move now falls through
to `actor_try_move`'s existing, already-correct `npc_blocking`/`can_step` checks - including
the "Blocked - abandon the move and let the script continue" branch in `ActorMoveAim`, which
existed but had never actually been reachable until now, since NOCLIP always short-circuited
past it for every scripted move on this engine. `moveType` (horizontal/vertical/diagonal move
sequencing) is a separate field and stays deferred - unrelated to this bug.

Verified with a real toolchain build + Mesen A/B, not just by reading code: a synthetic project
(cloned from `test/projects/Test_Math`'s own assets, following this project's established
"minimal repro" convention) with one actor doing a looping `Move Relative` toward a single
painted wall tile, `useCollisions: true`. Two real gotchas hit and fixed while building this
repro, worth remembering for the next one: (1) a fixture's own `_version`/`_release` fields
matter - `Test_Math.gbsproj`'s `_version: 1` makes `migrateProject` run the *entire* legacy
migration chain and silently drop the hand-authored `updateScript`/collisions, exactly the
"pin to the latest known version" gotcha `compileSnesData.test.js`'s own synthetic fixtures
already document; (2) `compileSnesData.js` derives a scene's *real* compiled width/height from
its background image's own tile dimensions (`conv.tileW`/`tileH`), not from `scene.width`/
`height` in the JSON - a collision bitmap built against the wrong width silently indexes the
wrong tiles. **Before the fix**: the actor sailed through the wall entirely, ending up at tile
73 after 600 frames (several unobstructed 8-tile loop iterations). **After the fix**: it
stopped at tile 13 - exactly where `can_step`'s own "destination tile + one to the right" (for
the 16px-wide sprite) footprint predicts for a wall at tile 15, confirmed by also reverting just
this fix (`git stash`) and reproducing the "sails through" behavior again before restoring it -
the same negative-control discipline every other engine-only fix in this file's history uses.
Also discovered, while narrowing this down: the player's own default scene start position can
sit directly in a test actor's path and get flagged by `npc_blocking` instead of the intended
wall - moved it out of the way in the repro once this was noticed, not a real bug, just a
reproduction-setup trap worth remembering. Tests: two new `scriptBuilder.test.js` cases closing
a real gap in the existing coverage (every existing `actorMoveTo`/`actorMoveRelative` test only
exercised `useCollisions: false` - the wire format for `true` was already correct before this
fix, now it has its own byte-exact assertion too). Full suite green (150 suites), the real
engine still compiles/links against the vendored toolchain.

## Tests

Jest under `test/`, mirroring `src/lib`/`src/store` (`test/events/*` one per event,
`test/data/compiler/*`, `test/helpers/*`, `test/migrate/*`, `test/store/features/*`,
`test/components/*`). Fixture projects in `test/projects/`. Event tests assert the exact
opcode byte sequence a `compile()` produces, so changing an opcode or arg order is a breaking
change caught here. `test/compile.test.js` and `test/sum.test.js` are empty stubs.

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
