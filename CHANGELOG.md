# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-06

SNES: project music + layered sound effects, per-sprite colours, in-app Play + touch controls + saved-game persistence, sprite animation, editor polish, stabilisation (roadmap M8 + M9 + M10 + M11). Full status:
https://claude.ai/code/artifact/5d2ffc31-f2da-4f0d-b7d9-bb8f927573a4

### Added
- **SNES music now plays a project's own songs.** Each `.mod` track is converted to Impulse
  Tracker `.it` at build time (new `src/lib/compiler/mod2it.js`) and built into the SNES
  soundbank by the new `src/lib/compiler/compileSnesMusic.js`. `Music: Play` picks the right
  track. Conversion is slightly lossy (Amiga pitch slides → linear slides; a few ProTracker
  effects dropped). A project with no music keeps the previous bundled demo track.
- **SNES sound effects now play over the music** instead of stopping it. `Sound: Play Effect`
  (beep / tone / crash) plays a short BRR sample through the SPC700's dedicated sound region;
  the beep's pitch maps onto the SNES range. Two built-in samples (a square-wave blip and a
  noise burst) — GB Studio 1.2.2 has no per-project sound-effect assets.
- The **"Play" toolbar button now works for SNES projects**: it builds the ROM and runs it in a
  bundled in-app JS emulator (not cycle-accurate — a quick preview, not a reference emulator).
  The web player has a **start/pause gate**, an **on-screen touch pad** (auto-shown on touch
  devices), a small toolbar (pause, reset, fullscreen), and **persists saved games** — the
  `Save Data` / `Load Data` events now survive a page reload (stored in the browser, per game).
- New Project screen: **"Blank Project (SNES)"** and **"Sample Project (SNES)"** templates. The
  SNES sample is the classic 8-scene GB Studio sample game retargeted — it builds and plays as a
  `.sfc`; the art is still Game Boy-sized and green until redrawn.
- Engine: actor sprites with a **6-frame sheet now walk-cycle** (two poses per direction) while
  moving; a 6-frame sheet on a non-moving actor with "Animate Frames" ticked auto-cycles all 6
  frames (e.g. a torch). `Actor: Set Animation Speed` paces it.
- Engine: **per-sprite colours** — each distinct actor sprite sheet now draws its own 16-colour
  OBJ palette (extracted from the PNG) instead of every actor sharing one. Up to 6 distinct
  on-screen sprite sheets keep their own colours (emote/avatar hold 2 of the 8 SNES OBJ
  palettes); a 7th/8th reuses the first sheet's palette.
- Engine: `Text: Set Animation Speed`, `Player: Set Sprite Sheet`, and the internal opcode
  behind multi-page `Text` boxes now work (previously silently did nothing). Setting the
  player's sprite only works if that sheet is already used elsewhere in the project.
- Engine: unused actor OAM slots are hidden once at scene load instead of every frame.
- Editor: the **Backgrounds page size warnings** now match the selected target — an SNES
  project is checked against the 256×224 SNES screen, not the Game Boy's 160×144.
- Editor: for SNES projects the scene info bar shows **distinct sprite sheets (`S: n/8`)**
  instead of the Game Boy sprite-frame budget (`F: n/25`), which doesn't apply.
- Docs: `appData/src/snes/EVENTS.md` — a per-event support matrix for the SNES target (fully /
  with a caveat / not yet), plus the editor-side gaps.
- Docs: `appData/src/snes/PERF.md` — a performance profile (ROM / RAM / VRAM / ARAM budgets and
  the CPU frame budget).

### Changed
- **Rebranded to "GBSNES Studio"** — the app title, About box, splash window, menus, dialogs
  (all languages), packaged app name, executable and installer filenames.
- The Settings → Platform "SNES" help/warning text now reflects reality (music, actors,
  animation, saves all work; the real caveats are X/Y/L/R input, SFX interrupting music, and
  the 6-sprite-palette ceiling). The dropdown label is "SNES (beta)" rather than
  "SNES (experimental)".

### Fixed
- SNES: after a scene used `Overlay: Show` and then slid the overlay away with
  `Overlay: Move To` (without an explicit `Overlay: Hide` — as the sample game's intro does),
  the player could no longer be moved with the d-pad for the rest of the game. An
  off-screen overlay no longer blocks input.
- `Overlay: Show` / `Overlay: Move To` on SNES stopped the overlay short of the bottom of
  the screen (it used the Game Boy's screen height), so "hide" left a strip covering the
  lower part of the screen. The overlay row is now scaled to the target's screen height.
- The in-app "Play" window for an SNES project showed only a black screen. The player's
  layout used CSS features the app's bundled browser doesn't support, which pushed the
  "Play" button out of the (Game Boy-sized) window — the game was waiting to be started
  with no visible way to do it. The window is now sized for the SNES screen and the layout
  no longer depends on those features. (Exported web players were unaffected.)
- A user's "Eject Build" output for an SNES project could fail to compile with plain `make`
  (no app/Node involved) — the bundled proof-of-concept music data lived in a folder plain
  `make` never scans for source files, even though it linked fine through the app's own build.

### Known limitations (SNES target)

The SNES target is functional end to end (create → script → build → play), but:

- **Music** conversion is lossy: Amiga (non-linear) pitch slides become linear slides and a few
  ProTracker effects have no `.it` equivalent, so an SNES build won't sound identical to the GB
  player. Only 4-channel `M.K.` `.mod` files convert (the same format the GB target requires).
- **Input**: only the 8 Game Boy buttons. X / Y / L / R are not readable from scripts.
- **Sprites**: at most 6 distinct sprite sheets on screen keep their own palette; a 7th/8th
  reuses the first sheet's colours.
- `Player: Set Sprite Sheet` only works for a sheet already used elsewhere in the project.
- **Sound effects** are two built-in samples (beep + noise); `Tone` frequency and `Stop Tone`
  are ignored (the sample is a one-shot).
- **Performance**: a scene with more than ~5–6 simultaneously moving actors may drop frames
  (degrades gracefully). See `appData/src/snes/PERF.md`.
- The **web player** persists saved games (SRAM) but has no full save-state (mid-play snapshot).

Full per-event detail: `appData/src/snes/EVENTS.md`.

## [1.1.0] - 2026-09-05

SNES engine opcode coverage + editor integration (roadmap M7-cont. + M9).

### Added
- Editor: "Target Platform" (GB/SNES), "Region" (NTSC/PAL) and "Save Memory (SRAM)" selectors on
  the Settings page; GB-only sections (GBC options, cartridge type) hide when SNES is selected.
- Editor: the World editor's camera-viewport helper (shown while editing a `Camera: Move To`
  event) now sizes itself to the project's actual target screen size instead of always assuming
  the Game Boy's 20x18 tiles.
- Engine: `SET_INPUT_SCRIPT` / `REMOVE_INPUT_SCRIPT` / `SET_TIMER_SCRIPT` / `TIMER_RESTART` /
  `TIMER_DISABLE` now run for real (previously compiled but did nothing).
- Engine: `SHOW_SPRITES` / `HIDE_SPRITES` and `ACTOR_PUSH` implemented.
- Engine: scene-state stack - `SCENE_PUSH_STATE` / `SCENE_POP_STATE` / `SCENE_STATE_RESET` /
  `SCENE_POP_ALL_STATE`, for e.g. a pause-menu scene that returns to exactly where the player
  left off.
- Engine: cartridge SRAM save game - `LOAD_DATA` / `SAVE_DATA` / `CLEAR_DATA` / `IF_SAVED_DATA`.
- Audio (phase 1): `MUSIC_PLAY` / `MUSIC_STOP` / `SOUND_START_TONE` / `SOUND_STOP_TONE` /
  `SOUND_PLAY_BEEP` / `SOUND_PLAY_CRASH` wired to PVSnesLib's snesmod driver, verified playing a
  proof-of-concept soundbank. Not yet driven by a project's own music assets.
- Engine: actor sprites with a 3-frame sheet (down/up/side) now show the correct frame for the
  direction they're facing, including via `Actor: Set Direction` on a stationary NPC.

### Fixed
- `IF_INPUT` / `AWAIT_INPUT` were comparing the compiler's button mask against the console's raw
  pad bits instead of the layout the compiler actually emits, so they matched almost no real
  button press.
- `AWAIT_INPUT` could block a script forever - nothing ever released it.
- Switching to the scene already loaded (e.g. via the new scene-state stack or save/load) did not
  reload it, since the switch code never reset the "scene loaded" flag.
- The camera's compiled movement range was always clamped to the Game Boy's screen size, even
  when building for SNES.

## [1.0.0] - 2026-09-03

Initial GB SNES Studio Public Release : https://claude.ai/code/artifact/5d2ffc31-f2da-4f0d-b7d9-bb8f927573a4?via=auto_preview
