# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-09

Playing the retargeted sample game end to end turned up a run of SNES engine and build-system
issues; this release clears them. The `1.0.0` tag was cut before CI could build all three
platforms, so nothing was actually published under it — `1.1.0` is the first release with
downloadable binaries.

### Added
- **SNES scripts can read the X / Y / L / R buttons.** The input events (`If Button Pressed`,
  `Await Input`, `Attach Script to Button`) offer all 12 SNES buttons for a SNES project — the
  editor shows an extra X/Y/L/R row. On the SNES target the button mask these events compile to
  is 2 bytes instead of 1; the Game Boy target is completely unchanged (still 8 buttons, 1 byte,
  byte-identical ROM output). In the bundled web player X/Y/L/R map to the keys U / I / O / P.
- **Settings → Controls now shows the SNES pad for a SNES project** — an X / Y / L / R
  key-binding column and a SNES-shaped pad diagram (L/R shoulders, X/Y/A/B diamond) instead of
  the Game Boy one. The bundled web player also gained a full default keyboard for SNES
  projects that never customised their controls (previously only X/Y/L/R responded), and the
  on-screen touch pad grew the L/R and X/Y buttons.

### Changed
- **The SNES dialogue / menu box is now sized to its contents** and anchored to the bottom of
  the screen. A two-option menu or a two-line line of text used to draw as a fixed eight-row
  slab with a large empty area below it.
- **SNES builds: graphic assets are emitted as multi-bank 65816 source** (`src/data/*.as` +
  `src/data/data.asm`) instead of one big C array file. A single C data file compiles to one
  atomic section that can't cross a 32 KB ROM bank, which capped a project's total
  background / sprite / font data; the new layout lets the linker spread it across banks, so a
  large project builds. No change to how you author assets.
- CI now builds Windows, macOS and Linux as three separate jobs in sequence, and the macOS
  build (a paid runner class on private repos, an Apple-Silicon runner since GitHub retired
  the Intel one) can no longer block the Windows + Linux release.
- "Build & Run" / "Export ROM" no longer print the assembler's per-file optimisation chatter.
- **New GBSNES Studio branding artwork.** The application icon (a Game Boy / SNES hybrid
  handheld), the `.gbsproj` project-file icon (a "GBSNES Studio Project" cartridge) and the
  macOS `.dmg` installer background were all redrawn; the Windows `.ico` and macOS `.icns`
  were regenerated from the new 1024×1024 sources.
- The "Sample Project (SNES)" now greets you with "Welcome to GBSNESStudio!" (the Game Boy
  sample is unchanged).

### Fixed
- SNES: **the screen sheared (horizontal glitch lines near the bottom) while the camera was
  moving.** The camera scroll registers were written mid-frame; they're now written during the
  vertical blank.
- SNES: **when the dialogue box opened or closed it briefly flashed at the top of the screen.**
  The box now slides by redrawing rather than by scrolling BG3 (which, being a 256-pixel layer,
  wrapped a taller box back around to the top).
- SNES: **you couldn't talk to a character (or push the rock) from its right or from above** —
  only from the left or below. The "tile in front of the player" was computed a tile short when
  the player faced right or down (the sprite is two tiles wide).
- SNES: the scene's background **flashed at full brightness for one frame** before its opening
  `Overlay: Show` curtain appeared (the sample's "YOUR LOGO" intro).
- SNES: a "hidden" overlay (`Overlay: Move To` off the bottom of the screen) left a **1-pixel
  dark line along the bottom edge** for the rest of the game.
- The "Sample Project (SNES)"'s three large scrolling backgrounds (Outside, Stars, Underground)
  are recoloured off the flat 4-shade Game Boy green — all eight sample backgrounds now use a
  SNES palette.
- CI: the packaged-app build failed on a fresh dependency resolve (a transitive package now
  requires Node ≥ 18; the project builds on Node 16 on purpose).

## [1.0.0] - 2026-09-06

First tagged release of **GBSNES Studio** — a fork of GB Studio 1.2.2 that keeps the Game Boy
(GBDK) target intact and adds a second **SNES / PVSnesLib** build target: create an SNES
project → script it (dialogue, menus, actors, camera, SRAM save, music, sound effects) →
Build ROM → Play (bundled JS emulator, with touch controls + saved-game persistence). The
Game Boy non-regression suite stays green. The stock 8-scene sample game plays start to
finish on SNES. Full roadmap & status:
https://claude.ai/code/artifact/5d2ffc31-f2da-4f0d-b7d9-bb8f927573a4

The `[0.x.0]` sections below were untagged development milestones during the fork's build-out
and are kept for chronology; everything in them ships in 1.0.0.

The highlights of the final push (roadmap M8–M12):

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
  `.sfc`, with all backgrounds at the SNES resolution (the room scenes redrawn, the scrolling
  scenes recoloured off the 4-shade Game Boy green).
- Engine: actor sprites with a **6-frame sheet now walk-cycle** (two poses per direction) while
  moving; a 6-frame sheet on a non-moving actor with "Animate Frames" ticked auto-cycles all 6
  frames (e.g. a torch). `Actor: Set Animation Speed` paces it.
- Engine: **per-sprite colours** — each distinct actor sprite sheet now draws its own 16-colour
  OBJ palette (extracted from the PNG) instead of every actor sharing one. Up to 6 distinct
  on-screen sprite sheets keep their own colours (emote/avatar hold 2 of the 8 SNES OBJ
  palettes); a 7th/8th reuses the first sheet's palette.
- Engine: `Text: Set Animation Speed`, `Player: Set Sprite Sheet`, and the internal opcode
  behind multi-page `Text` boxes now work (previously silently did nothing). Setting the
  player's sprite only works if that sheet is already loaded in the current scene.
- Engine: unused actor OAM slots are hidden once at scene load instead of every frame.
- Engine: **sprite sheets load per scene** — the player plus up to 7 of a scene's own actor
  sheets — so a project's total sprite-sheet count is no longer capped at 8. (A single scene
  with 9+ distinct actor sheets still overflows the extras.)
- Engine: **"animated" sprite sheets** with 2, 4 or 5 frames (not just 3 or 6) now cycle
  through every frame — a 2-frame duck, a 4-frame torch.
- Engine: the SNES **dialogue box, menus and overlay now use the project's own
  `assets/ui/ascii.png` / `frame.png` / `cursor.png`** (the same files the Game Boy target
  uses) — a real bordered box, a menu cursor, the project's font.
- The "Sample Project (SNES)" backgrounds all use the **SNES resolution**: the 5 room scenes
  are redrawn at 256×224 and their scenes resized to match (so the sample fills the screen
  instead of a corner), and the 3 scrolling scenes (Outside, Stars, Underground) are
  recoloured off the 4-shade Game Boy green to a per-scene palette.
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
  animation, saves all work; the real caveats are X/Y/L/R input, the two built-in sound
  effects, and the per-scene sprite-sheet limit). The dropdown label is "SNES (beta)" rather
  than "SNES (experimental)".

### Fixed
- SNES: a project with more than 8 sprite sheets showed the player sprite for every actor
  past the 8th (a shop keeper, a torch flame, an NPC). Sprite sheets are now loaded per
  scene, so each scene gets its own 8 slots — the sample game's shops and cave render
  correctly.
- SNES: the player was blocked one tile earlier than on Game Boy, so a tight gap (a house
  doorway with a wall just past it) couldn't be walked through - the exit trigger behind it
  never fired. Collision now matches Game Boy.
- SNES: actor sprites drew one tile too low, so an actor placed "on" something (a rock on
  a staircase, a torch on a stand) rendered a row below it. Sprites now sit at the same
  spot as on Game Boy.
- SNES: "animated" sprite sheets with 2, 4 or 5 frames (e.g. a flapping duck, a flickering
  torch) only showed their first frame. They now cycle through every frame.
- SNES: the dialogue box, menus and overlay now use the project's own
  `assets/ui/ascii.png`, `frame.png` and `cursor.png` (the same files the Game Boy target
  uses) instead of a built-in font. The box gets a real border and menus get a cursor;
  text that previously rendered as garbled tiles is now legible.
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
- **Sprites**: sheets load per scene (player + 7). A single scene with 9+ distinct actor
  sheets overflows the extras to the player sprite; at most 6 sheets in one scene keep their
  own 16-colour palette (a 7th/8th reuses palette 0).
- `Player: Set Sprite Sheet` only works for a sheet already loaded in the current scene.
- **Sound effects** are two built-in samples (beep + noise); `Tone` frequency and `Stop Tone`
  are ignored (the sample is a one-shot).
- **Performance**: a scene with more than ~5–6 simultaneously moving actors may drop frames
  (degrades gracefully). See `appData/src/snes/PERF.md`.
- The **web player** persists saved games (SRAM) but has no full save-state (mid-play snapshot).

Full per-event detail: `appData/src/snes/EVENTS.md`.

## [0.2.0] - 2026-09-05

*(untagged development milestone — ships in 1.0.0)*

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

## [0.1.0] - 2026-09-03

*(untagged development milestone — ships in 1.0.0)*

First internal end-to-end SNES build (roadmap M0–M7). Full status:
https://claude.ai/code/artifact/5d2ffc31-f2da-4f0d-b7d9-bb8f927573a4?via=auto_preview
