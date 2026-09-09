# SNES target — event support matrix

Which GB Studio scripting events work on the **SNES (PVSnesLib)** build target, and how far.
The Game Boy target is the reference — every event listed here works fully on `gb`.

Opcode numbers are shared between both targets (`src/lib/events/scriptCommands.js` ↔
`appData/src/snes/src/script_cmds.c`, locked by `test/data/compiler/snesScriptCmds.test.js`),
so nothing here *fails to compile* — the question is only what the SNES engine does at runtime.

| Symbol | Meaning |
| --- | --- |
| ✅ **Full** | Behaves like the Game Boy target. |
| ⚠️ **Partial** | Works, with the limitation noted. |
| ➖ **Inert** | Compiles and dispatches without error but has no visible effect *yet* — safe to leave in a script, it just does nothing. |
| ≡ **Same as GB** | The Game Boy engine doesn't implement this either (vestigial opcode) — matching it is correct. |

---

## Control flow & logic

| Event | SNES | Notes |
| --- | --- | --- |
| If / If Not, Switch, Loop, Label + Goto | ✅ | Pure control flow (`IF_TRUE` / `IF_VALUE` / `JUMP`), target-independent. |
| Wait | ✅ | |
| Stop Script | ✅ | |
| Call Custom Event, Group, Comment | ✅ | Compiler-side — inlined before any target sees them. |
| Attach Script to Button (`SET_INPUT_SCRIPT` / remove) | ✅ | All 12 SNES buttons — d-pad, A, B, Select, Start, **and X / Y / L / R** (the input opcodes carry a 2-byte mask on SNES). |

## Variables & math

| Event | SNES | Notes |
| --- | --- | --- |
| Set / Increment / Decrement, Set to Random, Copy | ✅ | |
| Math (add/sub/mul/div/mod, by value or variable) | ✅ | |
| If Variable (value / compare / true / false), If Variable Flags Compare | ✅ | |
| Add / Clear / Set Flags | ✅ | |
| Reset All Variables | ✅ | |

## Timers & input

| Event | SNES | Notes |
| --- | --- | --- |
| Set Timer Script, Restart Timer, Disable Timer | ✅ | |
| If Button Pressed (`IF_INPUT`), Await Input (`AWAIT_INPUT`) | ✅ | All 12 SNES buttons, X / Y / L / R included. On the SNES target these opcodes (plus `SET_INPUT_SCRIPT` / `REMOVE_INPUT_SCRIPT`) carry a 2-byte button mask — X/Y/L/R are `KEY_BITS` bits 8..11 in `src/lib/compiler/helpers.js`. The Game Boy engine and its byte-exact tests are untouched (GB still emits a 1-byte mask). |

## Actors — position & movement

| Event | SNES | Notes |
| --- | --- | --- |
| Set Active Actor | ✅ | |
| Set Position, Move To (+ to-variables, relative variants) | ✅ | Tile-locked movement, per-scene collision bitmap. |
| Get Position, Move to Vectors / Load Vectors | ✅ | |
| Push Actor | ✅ | Pushes in the actor's current facing direction (no NOCLIP). |
| Set Movement Speed | ✅ | |
| If Actor at Position, If Actor Facing Direction | ✅ | |
| Set Direction, Set Direction to Variable, Get Direction | ✅ | 3-frame and 6-frame actor sheets show the matching facing frame (down / up / side, side flipped), recomputed from the actor's direction every frame — works on stationary NPCs too. 1-frame sheets set the direction internally (movement / collision use it) but have no distinct facing frame, same as on GB. |

## Actors — appearance

| Event | SNES | Notes |
| --- | --- | --- |
| Show Actor, Hide Actor | ✅ | |
| Show All Sprites, Hide All Sprites | ✅ | |
| Actor animation | ✅ | A 6-frame actor sheet walk-cycles (2 poses per direction) while moving. An "animated" sheet with 2/4/5/6 frames auto-cycles all of them (a duck, a torch) when "Animate Frames" is ticked. 3-frame sheets are direction-only (no cycle); 1-frame sheets are static. |
| Actor Emote | ✅ | 16×16 bubble on OBJ palette 1. |
| Sprite sheets per scene | ✅ | Loaded per scene (player + up to 7 of that scene's actor sheets), so the total project sprite-sheet count is unbounded. A single scene with 9+ distinct actor sheets overflows the extras to slot 0. |
| Per-actor sprite colours | ✅ | Each distinct sprite sheet gets its own 16-colour OBJ palette (extracted from the PNG). OBJ palettes 1 and 2 are reserved for emotes / avatars, so up to **6** distinct sprite sheets *in one scene* keep their own colours; a 7th/8th reuses palette 0. |
| Set Collisions Enabled / Disabled | ✅ | |
| Player: Set Sprite Sheet | ⚠️ | Only works for a sheet **already loaded** — i.e. used by some actor or the player elsewhere in the project. GB streams new sprite tiles into VRAM at runtime; this engine pre-bakes ≤ 8 sprite sheets into fixed OBJ slots at build time and has no runtime streaming. Switching to a never-used sheet is a silent no-op. |
| Actor: Set Animation Speed | ✅ | Paces the walk cycle of a 6-frame actor sheet (and the auto-cycle of a 6-frame sheet on a non-moving actor with "Animate Frames" ticked). No effect on 1- or 3-frame sheets, which don't cycle. Higher value = faster; default 3. |
| Actor: Set Frame, Set Frame to Variable | ⚠️ | Works for a 6-frame sheet on a **non-moving** actor (`frames_len = 6`, frame 0–5 picks the sheet frame). On a 1- or 3-frame sheet, or a moving 6-frame actor, `frames_len` is 1 or 2 and the value is clamped, so it has little or no effect. |
| Actor: Set Flip (via Set Direction on a static-movement actor) | ⚠️ | Flips a 1-frame sprite fine. For a 3-frame directional sheet the render overrides flip from the facing direction each frame, so an explicit flip that disagrees with the direction won't stick. |

## Camera

| Event | SNES | Notes |
| --- | --- | --- |
| Camera Move To | ✅ | Clamped to the SNES screen size (32×28 tiles), not the GB 20×18. |
| Camera Lock, Camera Shake | ✅ | |

## Scenes

| Event | SNES | Notes |
| --- | --- | --- |
| Switch Scene | ✅ | With the fade-out / fade-in handshake. |
| Scene Push State, Pop State, Pop All State, Reset State Stack | ✅ | Stack of (scene, player tile pos, facing) snapshots — e.g. a pause-menu scene that returns exactly where the player left off. |
| Return to Title | ≡ | `Noop` on the Game Boy engine too — nothing to match. |

## Dialogue, menus & overlay

| Event | SNES | Notes |
| --- | --- | --- |
| Display Text (single or multi-page) | ✅ | BG3 box, typewriter, `$NN$` variable substitution, word-wrap. Multi-page keeps the box visually open across pages. Font + box border come from the project's `assets/ui/ascii.png` / `frame.png` (max 3 colours on the box). |
| Display Text with Avatar | ✅ | 16×16 portrait (OBJ palette 2), text indented. |
| Display Choice, Display Menu | ✅ | Cursor (from `assets/ui/cursor.png`) + Up/Down + A/B; menu layout supports 1 or 2 columns. |
| Text: Set Animation Speed | ✅ | Controls box slide-in / slide-out and typewriter speed. Timing is approximate, not pixel-for-pixel GB (values 1–2 = fastest, 3/4/5 progressively slower, 0 ≈ fastest rather than a true instant jump). |
| Overlay Show, Overlay Move To, Overlay Hide | ✅ | Solid BG3 panel, row-targeted, animates independently of the dialogue box. The Y row is scaled from the GB screen (18 rows) to the SNES screen (28); an overlay parked off-screen stops blocking the d-pad even without an explicit Overlay Hide. |

## Screen & fades

| Event | SNES | Notes |
| --- | --- | --- |
| Fade In, Fade Out | ✅ | Brightness-based (`setBrightness`) rather than GB's palette cycle — visually equivalent. |

## Music & sound

| Event | SNES | Notes |
| --- | --- | --- |
| Music: Play | ✅ | The project's own `.mod` songs are converted to `.it` (`mod2it.js`) and built into the soundbank by `compileSnesMusic.js` at build time. Lossy vs the GB player: Amiga pitch slides become IT linear slides and a few ProTracker effects are dropped (see `appData/src/snes/README.md` M8 phase 2). |
| Music: Stop | ✅ | |
| Sound: Play Effect (beep / tone / crash) | ⚠️ | Plays a short built-in BRR sample **layered over the music** (via snesmod's dedicated sound region). "Beep" and "Tone" use a generated square-wave blip; "Crash" a noise burst. The beep's pitch maps onto the SNES 1–6 range; "Tone"'s exact frequency and "Stop Tone" are ignored (the sample is a one-shot). No per-project sound-effect assets (GB Studio 1.2.2 has none). |

## Save data

| Event | SNES | Notes |
| --- | --- | --- |
| Save Data, Load Data, Clear Data, If Data Saved | ✅ | Cartridge SRAM. Saves the same scope as GB: player position / facing + all `script_variables[]` (not other actors, the scene stack, or timers). |

---

## Editor (not scripting — M9)

The editor is data-driven and already renders SNES projects correctly.

| Area | SNES-aware? | Notes |
| --- | --- | --- |
| Settings: Target Platform, Region (NTSC/PAL), Save Memory (SRAM size) | ✅ | GB-only sections (GBC options, cartridge type) hide when SNES is selected. |
| Settings: Controls | ✅ | For a SNES project the key-binding list grows an X / Y / L / R column and the pad diagram is the SNES pad (L/R shoulders, X/Y/A/B diamond) instead of the Game Boy one. New settings keys `customControlsX/Y/L/R`; the bundled web player binds them and falls back to `i`/`u`/`o`/`p`. |
| World editor: `Camera: Move To` viewport rectangle | ✅ | Sizes to the target's real screen (32×28 vs 20×18). |
| World / scene canvas geometry | ✅ | Data-driven — the scene canvas is sized from the background's tile dimensions (a 32×28 SNES background renders at 32×28 tiles). Scenes are still capped at 32×32 tiles for both targets. |
| Colour rendering (scene / background / sprite previews) | ✅ | GB Studio 1.2.2's editor already shows the raw full-colour PNGs (no DMG-green filter anywhere) — the 4-shade conversion is compiler-only. So SNES art shows in its real colours with no change needed. |
| Backgrounds page: size warnings | ✅ | "Too small / too large" now use the target's screen (256×224 on SNES) and scene-map size, not the fixed GB 160×144 / 256×256. |
| Scene info bar: sprite budget | ✅ | GB shows a per-scene sprite-*frame* budget (`F: n/25`); SNES shows distinct actor sprite *sheets* (`S: n/8`, the real `SPRITE_SLOTS` limit — project-wide, enforced by a compiler warning). |
| Sprite editor: dimensions, frame counts | ✅ | 16×16 frames, 1/3/6-frame types — the same shape the SNES engine uses. |
| Input events: X / Y / L / R options | ✅ | `InputPicker` shows a third button row (X / Y / L / R) for SNES projects; the engine reads them (see *Timers & input* above). Their keyboard/pad bindings are set on the Settings > Controls page (row above). |
| Palette editor | — | Intentionally not built: `snesgfx.js` extracts the palette from each PNG automatically, nothing to edit by hand. |
