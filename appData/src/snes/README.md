# SNES engine (`appData/src/snes/`)

Second build target for GB Studio: **PVSnesLib / SNES**, parallel to `appData/src/gb/`
(GBDK / Game Boy). Added as a target, not a replacement — the `gb` tree stays the reference.

Status: **M7 (data compiler + input/timer-script execution, ACTOR_PUSH, scene-state stack,
SHOW/HIDE_SPRITES, SRAM save game, directional + walk-cycle actor sprites, per-sprite OBJ
palettes) + M5b-e (menus, emotes,
avatars, overlay, slide/2-col/move-to) + M8 (project `.mod` music via a JS `.mod`->`.it`
converter feeding snesmod's `smconv`; BRR sound effects layered over the music) + M9 (editor Settings page: Platform/Region/SRAM-size toggles,
target-aware camera viewport helper and compiler clamp) + M10 (Play button / web export via a
vendored JS SNES emulator) + M11 in progress (SNES New Project template; ejected build verified
to compile standalone with plain `make`; opcode audit + 4 Noop gaps closed; per-event support
matrix `EVENTS.md`; performance profile `PERF.md`). Real `.gbsproj` → SNES ROM via the app's own
Build page, no env var needed.**

**Per-event support (GB vs SNES): [`EVENTS.md`](EVENTS.md)** — every scripting event, whether it
works fully / with a caveat / is inert on the SNES target, plus the editor-side (M9) gaps.

**Performance profile: [`PERF.md`](PERF.md)** (M11) — ROM / WRAM / VRAM / ARAM budgets (all
comfortable) and the CPU frame budget (typical scenes hold 60 fps; > ~5–6 *moving* actors drops
the odd frame — an `816-tcc` codegen ceiling, degrades gracefully).

- **M3** `src/game.c` — Mode 1 BG1 scene, 16×16 OAM player, d-pad movement, camera scroll.
- **M4** `src/script_runner.c` + `src/script_cmds.c` — the VM ported from `appData/src/gb/src/
  ScriptRunner.c` + `ScriptRunner_b.c`. `script_cmds[]` keeps the exact opcode/args_len order of
  `src/lib/events/scriptCommands.js` (locked by `test/data/compiler/snesScriptCmds.test.js`).
  `script_ptr` is a far pointer walked with plain indexed reads — no `PUSH_BANK` (D4). The
  opcode table is **two parallel arrays** (`script_cmds[]` / `script_cmd_arg_lens[]`) built from
  one `SCRIPT_CMD_TABLE` X-macro: a far read of a mixed-size struct field mis-indexes under
  816-tcc, so `{fn, args_len}` structs are out.
- **M4b** `src/scene.c` — scenes loaded from an index-based blob (`assets.c`: `scenes[]`,
  `event_ptrs[]`): BG palette, NPC actors, walk/action triggers, scene-start script. A-button
  interaction (facing-tile), walk triggers (player-on-tile), and the `SWITCH_SCENE` opcode
  (`Script_LoadScene_b` → `SceneRequestSwitch` → main-loop stage switch).
- **M4c** `src/scene.c` — tile-locked movement (change direction only on a tile boundary),
  a per-scene collision bitmap (1 bit/tile), the `ACTOR_MOVE_TO` / `_RELATIVE` / `_TO_VALUE`
  family (NOCLIP scripted walk that owns `actors[0].moving` while the VM is paused),
  `IF_ACTOR_AT_POSITION`, `ACTOR_GET_POSITION` + `LOAD_VECTORS`, and simple NPC AI
  (random-walk / random-face on the GB 64-frame cadence). The VM correctly pauses on a
  blocking opcode (`WAIT`, a scripted move) and resumes when `script_action_complete` is set.
- **M5** `src/ui.c` (dialogue box), `src/fade.c` (fades), camera in `src/game.c`:
  - `ui.c` — `TEXT` opcode. A dark panel on **BG3** (2bpp, high priority in Mode 1) via a
    RAM tilemap shadow DMA'd in VBlank; typewriter reveal; `$NN$` -> `script_variables[NN]`;
    `\n` line break; blinking `>` when done; A dismisses and releases the script. Replaces
    the GB hardware-window layer (`UISetPos`/`MAXWNDPOSY` are gone).
  - `fade.c` — `FADE_OUT` / `FADE_IN` ramp the master-brightness register (`setBrightness`
    0..15). `IsFading()` gates the main-loop scene switch, like GB. `SWITCH_SCENE` with a
    non-zero fade arg fades out, holds the switch until `!IsFading()`, then `SceneInit` +
    `FadeIn`.
  - camera (`camera.h`, impl in `game.c`) — `CAMERA_MOVE_TO` / `CAMERA_LOCK` / `CAMERA_SHAKE`.
    `camera_settings` carries the LOCK flag (follow player, default) + speed; `CameraUpdate`
    steps toward the destination and applies the shake offset before `bgSetScroll`.

  VRAM (words): BG1 map `0x0000`, BG1 tiles `0x2000`, **BG3 map `0x1000`**, **BG3 UI tiles
  `0x3000`** (235 2bpp tiles from the project's `assets/ui/{ascii,frame,cursor}.png` via
  `snesFixedAssets.js`: 224 glyphs + `OVERLAY_SHOW` fill + a 9-slice frame + the menu cursor;
  tile 0 = a transparent space that doubles as `UI_BLANK`). BG3 palette -> CGRAM 16..19
  (tilemap palette field 4), re-asserted by `SceneInit` each scene.

- **M6** `src/scene.c` + `src/game.c` + `tools/gen-dummy-gfx.js`:
  - The BG is no longer a one-time `main()` setup - `SceneInit` uploads the scene's BG
    **tiles + tilemap + palette + map size** (`SC_32x32` / `SC_64x64` from the BG's tile
    dimensions) from the `assets.c` `bg_tiles_ptrs[] / bg_maps_ptrs[] / bg_pals_ptrs[]` +
    length/size arrays. Scene blob byte 0 changed from `bg_pal_idx` to `bg_index`.
  - `SceneInit` runs its VRAM DMAs in forced blank (`setScreenOff`), then `setBrightness
    (FadeLevel())` un-blanks to 15 on a normal load, or leaves it black when a `SWITCH_SCENE`
    fade-in is pending. `main()` no longer calls `setScreenOn` / `FadeInit` no longer touches
    the brightness register.
  - `tools/gen-dummy-gfx.js` now converts a **real GB Studio background** (`mabe_house.png`)
    through `src/lib/compiler/snesgfx.js` and emits it as scene 1's BG - so the M6 converter
    is exercised on hardware. Scene 0 keeps the hand-rolled 64x64 dummy for the M4c demo.

- **M7 phase 1** — the data compiler. `src/lib/compiler/compileSnesData.js` turns a
  denormalized project into `src/assets.{c,h}` (scene blobs, `event_ptrs[]` script bytecode via
  the shared `compileEntityEvents` / `scriptBuilder`, `string_ptrs[]`, `bg_*_ptrs[]` via
  `snesgfx.js`, `START_*` defines). Sub-scripts (`SET_INPUT_SCRIPT` / `SET_TIMER_SCRIPT`) go
  through a `banked` shim that gives each one its own `event_ptrs[]` slot (bank 0, offset =
  index); the opcodes are still `Noop` engine-side, so those features don't fire yet but the
  scripts compile. `buildProject.js` `buildProjectSnes` runs it and writes the files into the
  ejected engine before `buildSnesRom`. `game.c` reads `START_SCENE/X/Y/DIR`; `dir_to_vec` is
  exported from `scene.c`.
  **12 `test/projects/*` fixtures compile; 6 build end-to-end to a bootable `.sfc` and boot in
  Mesen** (Test_Math, Test_CombinedMath, Test_ActorStoreDirection, Test_RelativePos,
  Test_SceneState, Test_ActorInvoke) - scene scripts run (variables set), backgrounds render,
  dialogue shows with `$NN$` substitution.
  - Legacy events (`EVENT_MATH_*` etc.) are handled: `compileSnesData` runs `migrateProject`
    (idempotent) first.
  - 32x32-tile backgrounds are the max and fit `SC_32x32` exactly - `SC_64x64` isn't needed.
  - **Per-actor sprites** - `snesgfx.imageToSpriteData` converts a sprite sheet's frame(s) into
    OBJ tiles. The OBJ sheet at VRAM `0x4000` is **per scene** (`SceneInit` DMAs
    `scene_spr_ptrs[scene_index]` + its 8-palette CGRAM image): player = slot 0, that scene's
    actor sheets = 1..7. The scene blob's `[24]` table (`sprite_type[8] / _frames[8] / _pal[8]`,
    right after `w,h`) fills the mutable `sprite_*_for_slot[]`. Actor blob byte 4 = the per-scene
    slot; `SceneInit` sets `actors[i].frame_offset = slot * 2` (OBJ grid TL tile for the "down"/only
    frame); a 3-frame sheet's up/side frames additionally land in two dedicated regions (see
    "Directional actor sprites" below) and `SceneRenderActors` picks the right one at render
    time from the actor's current facing. Player uses `PLAYER_SPRITE_SLOT`. One 16-colour OBJ
    palette (the player sprite's) is shared.

- **M5b** `src/ui.c` — `CHOICE` (0x27) and `MENU` (0x5C). `UIShowMenu(flag, str, cancel_cfg)`:
  options are `\n`-separated lines drawn instantly with a `>` cursor at column `TXT_COL0`;
  Up/Down move the cursor, A picks (writes `1..N`, or `0` when the last option cancels), B
  cancels when `cancel_cfg & 2`. `Script_Choice_b` is `UIShowMenu(var, str, 3)` (B + last-option
  cancel, like the GB engine); `Script_Menu_b` passes the compiled `layout` / `cancelConfig`.
- **M5c** `src/scene.c` — `ACTOR_EMOTE` (0x16). `SceneStartEmote(actor, id)` sets `emote_time`
  (~50 frames) and blocks the script; `SceneUpdateEmote` counts it down and releases; a 16x16
  OBJ bubble is drawn above `actors[emote_actor]` on OBJ palette 1 (CGRAM 144). The 8 emote
  images come from `tools/emotes.png` via `snesFixedAssets.js` (OBJ sheet slots 8-15, tiles
  32-63). `src/lib/compiler/snesFixedAssets.js` is now async and shared by `gen-dummy-gfx.js`.
  Verified in Mesen: bubble appears above the player for its duration, then the M5b menu runs.

- **M5d** `src/ui.c` + sprite pipeline — the rest of the dialogue box:
  - **Word-wrap**: `ui_wrap()` runs once after variable substitution, turning a space into
    `\n` whenever the next word would overflow the box width (avatar-aware: narrower when an
    avatar is showing). No re-flow needed at typewriter time.
  - **`TEXT_WITH_AVATAR`** (0x5B): `UIShowTextAvatar(str, avatarIndex)` - a 16x16 OBJ portrait
    (OBJ palette 2, CGRAM 160) in the box's top-left corner; text starts 4 columns further
    right (`ui_xoff`). Avatar sprite sheets are collected project-wide (stable index order,
    like `strings`/`variables`) and converted into slots 16-23 of the OBJ sheet (tiles 64-95).
  - **`OVERLAY_SHOW` / `OVERLAY_HIDE`** (0x19/0x1A): a solid BG3 panel over the whole screen,
    independent of the dialogue box (`ui_overlay`); `UIIsClosed()` also blocks d-pad input
    while it's up. Closing a dialogue while the overlay is active restores the overlay fill
    under the box instead of blanking it. (`OVERLAY_SET_POSITION` stays `Noop`: its GB args_len
    is 0 even though the handler takes 2 args - a pre-existing GB table quirk this port must
    match; `OVERLAY_MOVE_TO` is not wired up yet.)
  - The OBJ sheet grew to 96 tiles (3 KB): slots 0-7 actor sprites, 8-15 emotes (M5c), 16-23
    avatars (M5d).
  - **Bug fixed along the way**: `UIInit()` set `ui_state`/`ui_dirty` but not the newer M5d
    statics (`ui_overlay`, `ui_avatar_active`, `ui_flush_full`, `ui_xoff`) - one of them held
    boot-time garbage that made `UIIsClosed()` return false forever, silently disabling d-pad
    input. `UIInit()` now resets all of them.
  - Verified in Mesen: `Test_TextWithAvatar` (real fixture) shows its avatar portrait next to
    the text on scene load; `OVERLAY_SHOW`/`HIDE` produce a full-screen panel that appears and
    clears on schedule; the M5b menu and M5c emote still work end to end afterwards.

- **M5e** `src/ui.c` — the rest of the polish:
  - **Box slide-in/out**: the box is drawn at fixed BG3 map rows as before, but `UIUpdate`
    now scrolls BG3 (`bgSetScroll(2, 0, y)`) from `SLIDE_HIDDEN` (-64, below the screen) to 0
    over 4 steps before typewriter/menu input starts, and back down before the box actually
    closes. The avatar (OAM, screen-fixed) is held back until the slide finishes so it doesn't
    desync from the sliding box.
  - **2-column "menu" layout**: `UIShowMenu`'s `layout` argument selects 1 or 2 columns
    (`MENU_ROWS_PER_COL` = 4, so up to 8 options); option *i* → `(row, col) = (i % 4, i / 4)`.
    Left/Right jump a whole column (`MENU_ROWS_PER_COL`) in addition to Up/Down.
  - **`OVERLAY_MOVE_TO`** (0x1C): `OVERLAY_SHOW`'s `y` argument is now a real BG3 row (the
    panel covers rows `[y..31]`, not just the full screen), and `OVERLAY_MOVE_TO` animates that
    row toward a target (frames-per-step from `speed`), blocking the script until it arrives -
    matching the GB engine's `UIAtDest()` wait. Closing a dialogue over a partial overlay now
    restores the right fill per box row instead of an all-or-nothing guess.
  - Verified in Mesen: a 5-option menu renders 4+1 across two columns with a working `>`
    cursor; `OVERLAY_SHOW` from row 24 covers the bottom third, `OVERLAY_MOVE_TO` to row 8
    visibly slides that boundary up; scene-switch/fade/text regression re-checked, clean.

**SHOW_SPRITES / HIDE_SPRITES (done):** GB toggles a single hardware OAM-enable bit; here
`SceneRenderActors` just skips the `oamSetEx(...OBJ_SHOW)` call for every actor while a
`sprites_hidden` flag (`scene.c`) is set, falling back to `oamSetVisible(...OBJ_HIDE)` instead.
Reset to visible on every scene load, matching GB's `SceneInit` (`SHOW_SPRITES` right before
`DISPLAY_ON`). Verified in Mesen with before/after screenshots (dummy scene 1's wandering NPC +
player both vanish from OAM, then reappear).

**ACTOR_PUSH (done):** pushes the active actor 2 tiles (default) or all the way to the scene
edge / until blocked ("Slide Until Collision") in the *player's* current facing direction.
Reuses the existing scripted-move machinery (`actor_move_dest_x/y` + `SceneUpdateActors`) but
*without* the `ACTOR_NOCLIP` bit, so it naturally stops at the first solid tile - which is also
exactly "slide until collision", so no extra logic was needed for that mode beyond aiming at the
scene edge (out-of-bounds already reads as solid, so overshooting the edge target is harmless).
Verified in Mesen: pushed the player 2 tiles in their current facing direction from a trigger,
confirmed the move starts only once the trigger's own `WAIT` finishes, covers exactly 16px, and
then stops and releases control (no drift, checked 48 frames later).

**SCENE_PUSH_STATE / SCENE_POP_STATE / SCENE_STATE_RESET / SCENE_POP_ALL_STATE (done):** an
8-deep stack (`scene.c`, `SCENE_STATE {scene_index, tile_x, tile_y, dir_x, dir_y}`) snapshotting
the current scene + player tile pos/facing, e.g. for a pause-menu scene that later returns
exactly where the player left off. Global, not reset on scene load - only `SCENE_STATE_RESET`
or a consuming pop clears it, matching GB. `SCENE_POP_STATE`/`SCENE_POP_ALL_STATE` reuse the
`SceneRequestSwitch` + fade-handshake path `SWITCH_SCENE` already uses.
Found one real bug fixed along the way: `SceneRequestSwitch` never reset `scene_loaded`, so
switching "to" the scene already loaded (exactly what popping back to an unchanged scene index
does) would skip the reload entirely - the main loop's trigger is `!scene_loaded ||
scene_index != scene_next_index`, and only the second half would ever go true. GB's own
`Script_LoadScene_b` sets `scene_loaded = FALSE` on every switch for this reason; `scene.c`'s
`SceneRequestSwitch` now does too (fixes the same latent gap in `SWITCH_SCENE`, not just the new
opcodes - never triggered before because no existing fixture switches to its own current scene).
Verified in Mesen: pushed state after the M7-cont. `ACTOR_PUSH` test above, then immediately
popped it (round-tripping to the same scene on purpose, to exercise the `scene_loaded` fix) -
confirmed the exact scene index/tile/facing were captured on push, `scene_loaded` correctly
toggled 1->0->1 across the reload, and the player spawned back at the popped tile before the
scene's own start script (which contains its own `ACTOR_MOVE_TO`, re-run on every load like any
scene-start script) moved them again - a test-scenario quirk, not an engine bug.

**M8 phase 1 (music/sound engine plumbing, done):** `MUSIC_PLAY`/`MUSIC_STOP`/`SOUND_START_TONE`/`SOUND_STOP_TONE`/
`SOUND_PLAY_BEEP`/`SOUND_PLAY_CRASH` all call into `music.c`'s `spc*` wrappers
(see "Sound effects layered over music" below for the current SFX path)
(PVSnesLib's snesmod driver - `pvsneslib/include/snes/sound.h`). Good news from
investigating: the SPC700 driver ships prebuilt inside `libc.obj`, already unconditionally
linked by `buildSnesRom.js` for every build - **nothing extra to vendor**, and
`buildSnesRom.js`'s generic `.asm`-file collection picks up a soundbank's generated
`.asm`/`.incbin`'d `.bnk` with zero changes to the build pipeline.
`appData/src/snes/res/soundbank.{bnk,h}` + `src/res/soundbank.asm` is a **prebuilt test
soundbank borrowed from PVSnesLib's own `snes-examples/audio/effectsandmusic` demo** (one IT
music module + 5 IT-instrument effects) - not yet generated from a project's own assets. The
`.asm` specifically lives under `src/` (not next to its `.bnk`/`.h` in `res/`) so that a plain
`make` (M11's "eject compiles standalone" check - real PVSnesLib `devkitsnes/snes_rules` only
wildcard-scans `src/` and its first two subdirectory levels for `.c`/`.asm`, unlike
`buildSnesRom.js`'s own broader recursive walk) assembles and links it too - it silently didn't
before, and the standalone build only failed at the very last (link) step with an "Unresolved
reference to SOUNDBANK__" error. The `.incbin "res/soundbank.bnk"` inside the `.asm` and
`music.c`'s `#include "res/soundbank.h"` are both resolved relative to the *build tool's working
directory* (the project root), not the including file's own location, so only the `.asm` needed
to move.
`game.c`: `MusicInit()` (`spcBoot()` + `MUSIC_SET_BANKS()` + `spcAllocateSoundRegion()`) runs
once at boot; `spcProcess()` runs every frame in the main loop (required - it streams soundbank
data to the APU).

**Sound effects layered over music (done).** `SOUND_PLAY_BEEP` / `SOUND_START_TONE` /
`SOUND_PLAY_CRASH` play a short BRR sample through snesmod's **dedicated BRR sound region**
(`spcAllocateSoundRegion` at boot -> `spcSetSoundEntry` + `spcPlaySound` per event), which mixes
on top of the module instead of interrupting it - no more `spcStop`/session reload. The samples
are two tiny generated waveforms baked into ROM: `res/sfx_beep.brr` (a square-wave blip, used
for beep + tone) and `res/sfx_crash.brr` (a noise burst). `appData/src/snes/tools/gen-sfx.js`
synthesises the `.wav`s and encodes them with the vendored `snesbrr`; the `.brr` + `res/sfx.h`
(byte lengths) + `src/res/sfx.asm` (`.incbin`, under `src/` so plain `make` finds it) are
committed so an eject build needs no extra tool. `SOUND_PLAY_BEEP`'s GB pitch (0-7) maps onto
the BRR pitch range 1-6 (`hz ~ pitch*2000`); `SOUND_START_TONE`'s exact period and
`SOUND_STOP_TONE` are still ignored (one-shot sample, no arbitrary-frequency primitive).
GB Studio 1.2.2 has no per-project sound-effect assets, so these two are engine built-ins;
`res/effectssfx.it` stays soundbank module 0 (for smconv / bank-layout stability) but is no
longer loaded at runtime.
**Verified in Mesen** (`emu.getState()` DSP voice envelopes): with music on voice 2 (env ~2016),
a burst of 10 alternating beep/crash effects fired on voice 7 (env ~1920) **while voice 2 stayed
at 2016** - the music never dropped out. Before this change a `SOUND_*` collapsed every music
voice to 0.
**Verified in Mesen** via `emu.getState()`'s SPC700/DSP registers (flat string keys like
`"spc.dsp.outSamples0"`, NOT nested tables - a real gotcha, see below) rather than by ear:
`spc.pc` advances (driver alive), and `spc.dsp.voices[*].envVolume` go from silent (0) to
strongly nonzero and back down as the module plays.
**M8 phase 2 (project music, done):** `src/lib/compiler/compileSnesMusic.js`, run from
`buildProjectSnes` after `compileSnesData`, turns the project's own `.mod` songs into the
soundbank the engine plays. The phase-1 blocker (this repo's music pipeline is ProTracker
`.mod` via `mod2gbt`; snesmod's `smconv` only takes Impulse Tracker `.it`, and no `.mod`->`.it`
converter existed anywhere) is solved by a new JS converter, `src/lib/compiler/mod2it.js`:
a 4-channel `M.K.` `.mod` -> the simplest valid `.it` smconv accepts (one pass-through
instrument per sample, 8-bit signed samples, IT packed patterns; Amiga slides emitted as IT
linear slides, a few PT effects dropped - documented lossy bits). `compileSnesMusic.js` then
runs `smconv -s -b 5` over `res/effectssfx.it` (always soundbank module 0) + each converted
song (`mus0.it`, `mus1.it`, ... -> modules 1..N, matching the compiler's `getMusicIndex`
order, so `MUSIC_PLAY` track N -> `spcLoad(1 + N)`), and writes `res/soundbank.{bnk,h}`,
`src/res/soundbank.asm`, and `res/soundbank_banks.h`. A soundbank larger than one 32 KB LoROM
bank is split by smconv into `SOUNDBANK__0`/`SOUNDBANK__1`/... on consecutive banks (5, 6, ...);
`soundbank_banks.h`'s generated `MUSIC_SET_BANKS()` `spcSetBank()`s each chunk in reverse order
(chunk 0 first - PVSnesLib's own `musicGreaterThan32k` convention). A track that can't be read
or converted falls back to the effects module (silent in-game, warned) rather than shifting the
later tracks' indices. A project with no music keeps the committed proof-of-concept soundbank.
**Verified in Mesen** the same way as phase 1: after a scene's `MUSIC_PLAY` fires,
`spc.dsp.voices[*].envVolume` ramps to strongly nonzero (peaked ~2016) with active BRR decode
across ~200/300 frames - real audio from the converted project `.mod`, not silence.
`test/data/compiler/compileSnesMusic.test.js` covers `mod2it` (pure, always runs) and, when
the toolchain is vendored, the full project-`.mod` -> regenerated 2-bank soundbank -> bootable
`.sfc` path.

**LOAD_DATA / SAVE_DATA / CLEAR_DATA / IF_SAVED_DATA (done):** cartridge SRAM save game, ported
from GB's `Script_*Data_b` (`appData/src/gb/src/ScriptRunner_b.c`). GB reads/writes a raw pointer
into a fixed CPU address window (`0xA000`) that the MBC maps to SRAM; PVSnesLib has no such
pointer - SRAM is only reachable via `consoleCopySramWithOffset`/`consoleLoadSramWithOffset`
(`pvsneslib/include/snes/console.h`, already linked in via `libc.obj`, nothing to vendor). New
`appData/src/snes/src/save.c`/`.h`: a small header (save-exists flag, scene index, player tile
pos + facing) at SRAM offset 0, then `script_variables[]` right after - the same header-then-
variables split GB uses, just via function calls instead of a pointer. Matches GB's scope
exactly: only the player's position/facing + scene + variables are saved, nothing else (other
actors, scene stack, timers, input scripts are not persisted). `LOAD_DATA` reuses
`SceneRequestSwitch` + the fade handshake `SWITCH_SCENE` already uses (same `SceneStackPop()`-
style "dummy dir code then overwrite the vector" trick from the scene-state stack).
Found and fixed a real bug during testing, not in the original port: `SaveDataExists()` initially
checked the flag byte for *truthiness* (nonzero), but a never-written cartridge's SRAM does NOT
read back as zero - confirmed via Mesen that a freshly created `.srm` save file is filled with
random garbage bytes (simulating a real uninitialized SRAM chip), so a truthy check would
misreport "save exists" on effectively every fresh cartridge. Fixed to check exact equality
(`exists == 1`), matching the GB engine's own `*RAMPtr == TRUE` check - same ~1/256 residual
false-positive odds GB's original design already accepts, not a new gap.
Verified in Mesen with a real SRAM round-trip: on a genuinely fresh (freshly-deleted) save file,
`IF_SAVED_DATA` correctly reports false; `SAVE_DATA` then makes it report true; `CLEAR_DATA`
makes it false again; a variable set to 42, saved, then dirtied to 0 locally, is correctly
restored to 42 by `LOAD_DATA` - which also correctly forces a full scene reload (exercises the
`scene_loaded` fix from the scene-state-stack work above) without hanging.

**Fixed (pre-existing bug, found while scoping sprite direction frames):** `AVATAR_SLOT0` was
16 instead of 32 (`src/lib/compiler/snesFixedAssets.js`). `compileSnesData.js`'s `placeTiles(slot,
...)` writes tile `2*slot`, so avatar tiles landed at `2*16=32` - the same tiles as emote 0 -
while the engine's own `AVATAR_TILE0` (64, used by `ui.c`'s `UIShowTextAvatar`) was never
actually written. Net effect: any project using both `ACTOR_EMOTE` and `TEXT_WITH_AVATAR` had
its emote 0 graphic silently overwritten by avatar data, and dialogue avatars rendered as a
blank/transparent portrait (reading untouched zero tiles at 64). Confirmed with a raw VRAM dump
in Mesen before and after the fix. Not caught earlier because M5c and M5d's own Mesen checks
never screenshotted both features in the same run.

**Actor sprite frames (M7-cont.).** Phase 1: a 3-frame sheet (down/up/side, GB Studio's
`numFrames===3` `SPRITE_ACTOR` convention) shows the right frame for the way it's facing, from
`actors[i].dir_x`/`dir_y` recomputed **fresh on every render call** (mirroring GB's own
`SceneRenderActor_b`). `snesgfx.js` extracts all 3 frames (12 OBJ tiles); `snesFixedAssets.js`
put the "up"/"side" frames in two new 8-slot OBJ regions (`ACTOR_UP_TILE0=96`,
`ACTOR_SIDE_TILE0=128`) *appended after* the existing actor/emote/avatar regions - `placeTiles`'s
fixed `16 + 2*slot` bottom-row offset is only collision-free for 8 slots per region (the
`AVATAR_SLOT0` bug's root cause), so a same-pattern new region beats widening slot 0-7.
`compileSnesData.js` emits a per-actor `sprite_type` scene-blob byte + a `PLAYER_SPRITE_TYPE`
define. A nice consequence: `EVENT_ACTOR_SET_DIRECTION` works with zero extra opcode plumbing -
its `ACTOR_SET_DIRECTION` (0x07) already sets `dir_x`/`dir_y`, and the render picks it up.

**Phase 2 (walk-cycle animation, done).** A 6-frame sheet (`SPRITE_ACTOR_ANIMATED`,
`numFrames===6`, laid out down-a/down-b/up-a/up-b/side-a/side-b) walk-cycles between its two
poses per direction while the actor moves. The OBJ sheet grew 160→**256 tiles** (the whole first
OBJ name page) - three more 8-slot regions for the "B" poses (`ACTOR_DOWN_B_TILE0=160`,
`ACTOR_UP_B_TILE0=192`, `ACTOR_SIDE_B_TILE0=224`). Per-actor sprite_type is now
movement-type-aware, matching GB's `spriteTypeDec`: a 6-frame sheet on a *non-moving* actor is
`SPRITE_STATIC` with `frames_len` 6 (a manual/auto cycle through all 6 frames - a torch), not a
walk cycle. `compileSnesData.js` emits `sprite_frames_for_slot[]` (1/3/6) so `SceneInit` derives
`frames_len` (`frames_len_for()`), plus `anim_speed`/`animate` scene-blob bytes (actor entry
7→9 bytes). `scene.c`'s `SceneAnimateActors` (ported from GB's own frame-cycle loop) steps
`actors[i].frame` on the `/8` tick, gated by `anim_speed` (4 fastest .. 0 slowest, default 3),
while the actor `moving` (walk) or has the `animate` flag (decorative). A new `actors[i].anim_hold`
counter bridges the 1-frame `moving`=0 dips at tile boundaries so a continuously-walking sprite
doesn't stutter or reset; an idle walk sprite settles back to pose 0. Verified in Mesen (real
PPU OAM tile/flip) - player and a random-walk NPC on a 6-frame sheet both cycled the correct
A↔B pose per direction (down 0↔160, up 96↔192, side 128↔224 with hflip when facing left) at the
default speed, and snapped to the standing pose when idle. 3-frame and 1-frame sheets are
provably unchanged (`frames_len` 1 → `SceneAnimateActors` skips them; the render path for
`SPRITE_ACTOR` is byte-identical to phase 1).

**Correction (M11, this claim was actually stale/wrong):** a re-audit of `script_cmds.c`'s
opcode table against `scriptCommands.js` for the M11 supported-events documentation pass found
this "no meaningless Noop" claim didn't hold - 4 opcodes with a real GB implementation were
still `Script_Noop_b` here: `PLAYER_SET_SPRITE` (0x13), `TEXT_SET_ANIM_SPEED` (0x44),
`TEXT_MULTI` (0x50), `ACTOR_SET_FRAME_TO_VALUE` (0x51). (Two others that looked like gaps at
first glance, `RETURN_TO_TITLE`/0x18 and `OVERLAY_SET_POSITION`/0x1B, are genuinely `Noop` in
the **GB reference engine too** - matching them is correct parity, not a gap; the "camera easing"
note below is a separate, still-valid correction from an earlier session.) All 4 are now real:
- **`TEXT_SET_ANIM_SPEED`**: `ui.c` gained `ui_slide_in_speed`/`ui_slide_out_speed`/
  `ui_text_speed` (default 1, matching the previous hardcoded behaviour) and a shared
  `ui_speed_tick()` frame-skip gate mirroring the GB engine's own `UIUpdate_b()` thresholds
  (1-2 every frame/fastest, 3/4/5 every 2nd/4th/8th frame - GB's separate 1-vs-2 step-size
  distinction is collapsed into "every frame" here, a documented simplification; 0 is
  approximated as fastest rather than a true zero-frame jump). Gates the box slide-in, slide-out,
  and typewriter reveal steps that were previously always-every-frame.
- **`TEXT_MULTI`**: a compiler-internal opcode (not a user-facing event - emitted automatically
  around a multi-page `TEXT` event to keep the box visually "open" across pages: instant close
  before all-but-the-last page, instant open after the first). `UITextMulti(mode)` save/restores
  `ui_slide_in_speed`/`ui_slide_out_speed` exactly like GB's own `Script_TextMulti_b`, now that
  those speeds are real runtime state (from the item above) rather than hardcoded constants.
- **`ACTOR_SET_FRAME_TO_VALUE`**: reads a variable instead of a literal, otherwise identical to
  the already-real `ACTOR_SET_FRAME` - and, like it, currently has no visible effect on any
  sprite, since `frames_len` is hardcoded to 1 everywhere (no manual frame-cycling/animation
  yet, matching the sprite-direction-frames Phase 1 scope) so `frame % frames_len` is always 0.
  Wiring the opcode is still correct - it's exactly as inert as its sibling, not a new gap.
- **`PLAYER_SET_SPRITE`**: the real architectural one. GB streams the target sheet's tile data
  into VRAM at runtime from its full per-project sprite bank; this engine pre-bakes only the
  <=8 sheets actually referenced by an actor/the player into fixed OBJ slots at compile time and
  never touches VRAM again, so arbitrary runtime streaming isn't there. Scoped down instead:
  `compileSnesData.js` emits `sprite_slot_for_index[]` (one entry per project sprite sheet,
  mapping the compiler's `getSpriteIndex()` value to its pre-loaded OBJ slot, or `0xFF` if that
  sheet was never loaded - i.e. never used by any actor or the player anywhere in the project)
  and `sprite_type_for_slot[]`; `Script_PlayerSetSprite_b` looks up the slot and updates
  `actors[0].frame_offset`/`sprite_type`, or no-ops on `0xFF` rather than pointing OAM at tiles
  that were never uploaded. **Real, documented restriction**: switching to a sheet no actor in
  the project ever uses is silently inert (not an error, no warning yet) - only sheets already
  "earning" a slot by being referenced somewhere are switchable.

Verified all 4 in Mesen with one scripted sequence: a multi-page `TEXT`, then
`TEXT_SET_ANIM_SPEED` (slowed to 5/5/5), another `TEXT`, `ACTOR_SET_FRAME_TO_VARIABLE`, then
`PLAYER_SET_SPRITE` switching to a second actor's (pre-loaded) sheet, finishing with a marker
variable set - confirmed via a Lua script that toggled the A button (`emu.setInput({a=...}, 0)`)
to advance both dialogue boxes: the marker variable read back correctly from WRAM at the
`script_variables` symbol's address (proving the whole sequence ran without hanging/crashing),
and the player's real OAM sprite (sprite 0, byte 2 of the PPU OAM table) showed the switched-to
sheet's tile - not the original one.

No script opcode is left as a meaningless `Script_Noop_b` anymore (NOW actually true, re-checked
row by row against `scriptCommands.js` this time) - every opcode the GB engine actually
implements has a real SNES handler (checked against the GB reference: the "camera easing beyond
linear" item once listed here didn't correspond to anything real - GB's own camera has no
easing/curve concept either, just the same bit-masked linear speed steps this engine already
ports). Remaining known gaps are visual/asset-pipeline or documented restrictions, not opcode
coverage: `PLAYER_SET_SPRITE` only working for already-loaded sheets (above), the two built-in
BRR sound effects (no per-project SFX assets - GB Studio 1.2.2 has none), and only 6 distinct
actor OBJ palettes (see below).

**Per-sprite OBJ palettes (done):** each used sprite slot draws its own 16-colour OBJ palette.
The SNES has 8 OBJ palettes (CGRAM 128..255, 16 colours each); palettes 1 and 2 stay reserved
for the emote bubbles and dialogue-avatar portraits, so `compileSnesData.js` assigns actor
sprite slots from the pool `{0, 3, 4, 5, 6, 7}` and emits `sprite_pal_for_slot[8]`. A project
with 7-8 distinct sprite sheets on screen reuses palette 0 for the overflow. `spr_pal` grew
from one palette to the whole OBJ CGRAM image (8*32 bytes); `game.c`'s `oamInitGfxSet` uploads
it wholesale, then its own `dmaCopyCGram` calls reclaim palettes 1/2 for emotes/avatars.
`scene.c`'s `SceneRenderActors` passes `sprite_pal_for_slot[actors[i].frame_offset >> 1]` as
the OAM palette - `frame_offset` is always `slot*2` (SceneInit / `PLAYER_SET_SPRITE`), so a
runtime sprite swap picks up the new sheet's palette with no extra plumbing. Verified in Mesen
(Test_ActorInvoke: player's OAM sprite on OBJ palette 0, the signpost NPC on palette 3, their
CGRAM contents genuinely different; emote/avatar palettes intact after the wholesale upload).

**Input-script / timer-script execution (M7-cont., done):** `SET_INPUT_SCRIPT`,
`REMOVE_INPUT_SCRIPT`, `SET_TIMER_SCRIPT`, `TIMER_RESTART`, `TIMER_DISABLE` all run for real now
(`scene.c`: `input_script_ptrs[NUM_INPUT_SCRIPTS]` one slot per GB-layout button bit, persists
across scenes like GB; `timer_script_duration/time` a single auto-repeating slot, disabled every
scene load like GB).
Both are only checked while no other script is running (`script_ptr == 0`), matching the GB
engine. Found and fixed two real bugs along the way:
- `Script_IfInput_b` (`IF_INPUT`) compared the compiler's GB-layout button mask directly against
  `joy` — but `joy` is PVSnesLib's raw pad bits (`KEY_A=BIT7`, `KEY_UP=BIT11`, ...), not the GB
  engine's compact byte (`right=0x01, left=0x02, up=0x04, down=0x08, a=0x10, b=0x20, select=0x40,
  start=0x80` from `KEY_BITS` in `src/lib/compiler/helpers.js`). The two layouts barely overlap,
  so IF_INPUT (and, before this fix existed, any input-script) matched close to nothing on a
  real button. Fixed with `SceneGbInputBits(u16)` (`scene.c`), which every compiler-emitted-mask
  comparison now goes through.
- `AWAIT_INPUT` set `await_input` and blocked the script (`script_action_complete = 0`) but
  nothing ever read `await_input` back — any script using it hung forever. Fixed in
  `ScriptUpdateTimers()` (`script_runner.c`): checks `SceneGbInputBits(joy) & await_input` each
  frame and releases the script, clearing `await_input` immediately (unlike the GB engine, which
  gates on `last_fn` instead — this engine has no such per-opcode gate, so a stale non-zero mask
  would wrongly complete a later, unrelated blocking opcode without the clear).

**X / Y / L / R (M12-cont., done):** the four input opcodes (`IF_INPUT`, `AWAIT_INPUT`,
`SET_INPUT_SCRIPT`, `REMOVE_INPUT_SCRIPT`) carry a **2-byte** little-endian button mask on the
SNES target instead of GB's 1 byte — the extra byte holds X / Y / L / R (`KEY_BITS` bits 8..11
in `src/lib/compiler/helpers.js`; `targets/snes.js` `inputMaskBytes: 2`). This is the only place
the SNES `script_cmds.c` arg lengths diverge from the GB table (`+1` for those four opcodes;
`snesScriptCmds.test.js` allows exactly that). The GB engine, its byte-exact event tests and GB
ROM output are untouched — GB still emits a 1-byte mask. Engine side: `SceneGbInputBits()` now
returns `u16` and packs all 12 buttons, `input_script_ptrs[]` grew to `NUM_INPUT_SCRIPTS` (12),
`await_input` is `u16`, and the four `Script_*Input*_b` handlers read
`args[0] | (args[1] << 8)` (the jump/index args shift by one). The editor's `InputPicker` shows
a third X/Y/L/R row for SNES projects. Verified in Mesen: a scene registering
`SET_INPUT_SCRIPT("x")` / `SET_INPUT_SCRIPT("r")` had both sub-scripts fire on the real button
presses (marker variables read back 42 / 43 from WRAM via a Lua `emu.setInput` driver).

**816-tcc gotcha (M4c/M5):** a 3-or-more-term boolean chain (`a || b || c`, `a && b && c`) in a
conditional links its branch targets wrong — the false path fell through into the block. All of
`scene.c` / `ui.c`'s guards are now written as one test per `if` (see `actor_on_tile`, `in_box`,
`col_solid`, `can_step`, the `$NN$` parser). Keep new conditionals to at most two `&&` / `||`
terms, and avoid the `?:` operator (use `if`/`else`).

**816-tcc gotcha (M7-cont.):** a function with a struct-by-value parameter (e.g. `BANK_PTR`)
assigned straight into a global (`some_global = param;`) can emit a reference to a `_locals`
stack-frame symbol (`__FnName_locals`) that 816-tcc never defines when the function has no other
local variables — `wlalink` then fails with "Unresolved reference". Fix: assign the parameter to
a genuine local first (`BANK_PTR t = param; some_global = t;`), which forces the locals frame to
actually be emitted. `run_script()` already did this by accident; `SceneSetTimerScript()` needed
the same fix once it was added.

**M5 palette timing:** `dmaCopyCGram` from inside `UIInit` (before `setScreenOn`) did not
stick - the UI palette is written by `SceneInit` instead, in its post-`WaitForVBlank` window.

**Fixed (M4b glitch):** the dark blocks at the top of non-initial scenes were uninitialised
BG3 tilemap VRAM (`UIInit` cleared the RAM shadow but never DMA'd it) - some garbage entries
had the priority bit, so BG3 (high priority in Mode 1) drew them over BG1. `UIInit` now DMAs
the full blank map to `0x1000` once.

**Known limitation (M4c):** NPC AI is deliberately minimal (one random direction every 64
frames, no pathing); `move_speed` > 1 is untested against tile alignment.

Dummy graphics + the test script live in `src/assets.{c,h}`, generated by `tools/gen-dummy-gfx.js`
(throwaway; the real data path is M6/M7).

### GB → PVSnesLib mapping used so far

| GB (`appData/src/gb`) | PVSnesLib |
| --- | --- |
| `wait_vbl_done()` | `WaitForVBlank()` |
| `joypad()` (8-bit) | `padsCurrent(0)` (16-bit, D6) |
| `SCX_REG` / `SCY_REG` | `bgSetScroll(bg, x, y)` |
| `set_bkg_data` / `set_bkg_tiles` | `bgInitTileSet` / `bgInitMapSet` |
| `move_sprite` / `set_sprite_tile` | `oamSet` / `oamSetEx` |
| `DISPLAY_ON` / `LCDC_REG` | `setScreenOn()` / `setMode(BG_MODE1, 0)` (D1) |

## Build (standalone, for engine work)

Requires PVSnesLib **V4.7.0** and Unix `make` + coreutils on `PATH`.

```sh
export PVSNESLIB_HOME=/c/svgexterne/vboxshared/DropboxSvnClient/snesdev/pvsneslib   # Unix-style path, even on Windows
make            # -> game.sfc and build/rom/game.sfc
make clean
```

From the app, `src/lib/compiler/makeBuild.js` (SNES branch) copies this tree to the output
dir, drops the generated data files into `src/data/`, sets `PVSNESLIB_HOME` + env, and runs `make`.

## Key decisions (see the M0 ADR)

- **D1** Mode 1: BG1 = decor, BG3 = UI/text/overlay, OAM = actors (1 sprite 16×16 per actor).
  Sprite size pair `OBJ_SIZE8_L16` (small 8×8 for cursor/UI, large 16×16 for actors).
- **D2** 256×224 → 32×28 tiles; camera margins `−32 / −28`.
- **D3** LoROM + FastROM, SRAM 8 KB (`SRAMSIZE=03`), auto `hdr.asm`, output `game.sfc`.
- **D4** 1 `BankedData` bank → 1 `.SECTION SUPERFREE` (`.incbin` blob); `BANK_PTR` → far 24-bit
  pointer, direct dereference (no `PUSH_BANK` — validated on Mesen 2). `BankManager.c` is gone.
- **D5** Explicit palettes (indexed PNG), fades via brightness register.
- **D6** 12-button input.

## Layout

```
Makefile           includes $PVSNESLIB_HOME/devkitsnes/snes_rules (standalone builds)
src/game.c         main loop + camera (ported from appData/src/gb/src/game.c)
src/script_runner.c / script_cmds.c   bytecode VM + opcode table
src/scene.c        scene loader, actors, triggers, tile-locked movement, collision
src/ui.c           dialogue box on BG3 (M5)
src/fade.c         master-brightness fades (M5)
src/assets.{c,h}   M3/M5 dummy graphics + font + strings — generated, committed, gone in M6
tools/gen-dummy-gfx.js   regenerates src/assets.* (UI gfx from templates/gbhtml/assets/ui/)
src/data/          generated by the JS compiler (bank_*, data_ptrs.*, ...) from M7 — not committed
hdr.asm            written by buildSnesRom.js / snes_rules from project settings
```
