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
| If Expression, Loop While | ✅ | M3 (v4). No shared GB Studio 3.x GBVM value stack exists on this target (own flat-opcode VM, see `appData/src/snes/src/rpn.h`) — a shunting-yard-ordered expression is compiled to a sequence of small fixed-arg `RPN_PUSH_CONST` / `RPN_PUSH_VAR` / `RPN_OPERATOR` opcodes instead of GBVM's one variable-length `VM_RPN` meta-instruction. `If Expression` branches on the result `> 0`; `Loop While` reuses the same test as its loop-continue condition (GB Studio 3.x's own reference uses `> 0` for the former and `!= 0` for the latter — a harmless inconsistency we don't replicate, since one shared opcode can only encode one comparison and almost every real expression is comparison/logical-built, always 0/1 either way). **Verified (M8, v4)**: a real Mesen run of `5 + 3 * 2` (operator precedence) followed by `If Expression $var$ > 10` read the correct `11` then `> 0`-true branch result straight back from live WRAM. |

## Variables & math

| Event | SNES | Notes |
| --- | --- | --- |
| Set / Increment / Decrement, Set to Random, Copy | ✅ | |
| Math (add/sub/mul/div/mod, by value or variable) | ✅ | |
| If Variable (value / compare / true / false), If Variable Flags Compare | ✅ | |
| Add / Clear / Set Flags | ✅ | |
| Reset All Variables | ✅ | |
| Evaluate Expression | ✅ | M3 (v4). Same RPN micro-op sequence as If Expression / Loop While above, ending in a `RPN_SET_VARIABLE` opcode instead of a branch test. Variables are `u8` on this target (unlike GB Studio 3.x's 16-bit signed) — the RPN stack itself is `s16` internally (an intermediate result can go negative/out-of-range before a final compare), but the value actually stored back wraps to `u8` like every other math opcode (`MATH_ADD` etc). **Verified (M8, v4)**: a real Mesen run of `Loop While $var$ < 5 { $var$ = $var$ + 1 }` (5 iterations, self-referencing evaluate) read the variable back as exactly `5` from live WRAM after the loop. |

## Timers & input

| Event | SNES | Notes |
| --- | --- | --- |
| Set Timer Script, Restart Timer, Disable Timer | ✅ | **4 independent timer contexts** (M4, v4) - each with its own duration/countdown/target script (`NUM_TIMER_CONTEXTS`, `scene.c`). Still only one script can be *running* project-wide at a time (single `script_ptr`, not real hyperthreads like GB Studio 3.x's GBVM) - two contexts firing the same frame just means the second one starts a frame late. |
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
| Activate Actor, Deactivate Actor | ⚠️ | M4 (v4), scoped down. Toggles a new `active` flag (independent of `enabled`/Show-Hide) gating AI, movement, collision and interaction — `npc_blocking`, `SceneTryInteract`, `actor_at_tile`, `SceneUpdateAi` in `scene.c` all skip an inactive actor. Unlike GB Studio 3.x, this does **not** re-launch or terminate a persistent per-actor "On Update" script - that subsystem isn't ported on this engine (see "Not yet implemented" below), so Deactivate is closer to "freeze in place, can't be walked into or talked to" than B's full activity teardown. The player can never be deactivated (same guard as B's `if (actor == &PLAYER) return;`). Rendering and animation cycling are unaffected — a deactivated-but-shown actor still stands there and animates. |
| Show All Sprites, Hide All Sprites | ✅ | |
| Actor animation | ✅ | A 6-frame actor sheet walk-cycles (2 poses per direction) while moving. An "animated" sheet with 2/4/5/6 frames auto-cycles all of them (a duck, a torch) when "Animate Frames" is ticked. 3-frame sheets are direction-only (no cycle); 1-frame sheets are static. |
| Actor Emote | ✅ | 16×16 bubble on OBJ palette 1. Emote is a real project entity as of M5 (v4) - `assets/emotes/*.png`, one 16×16 PNG per emote, up to 8 (the fixed project-wide OBJ region this builds into - a genuine SNES OBJ VRAM budget, not per-scene like actor sheets/avatars). A project with none yet falls back to the legacy fixed `assets/ui/emotes.png` 8-wide grid; an already-saved numeric `emoteId` (from before this entity existed) still resolves correctly as long as no real Emote entities have since been added (mixing old numeric refs with new entities after the fact isn't handled - a documented, narrow gap, not silently papered over). |
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

## Parallax scrolling (M6, v4)

Not a scripting event - a per-scene editor field (`Scene.parallax`, Scene properties sidebar),
matching GB Studio 3.x's `SceneParallaxLayer[]` shape exactly (`{height, speed}`, up to 3 bands
stacked top-to-bottom, the last one always auto-extending to fill the rest of the screen).

The mechanism is completely different from B's, though. GB Studio's own engine has no hardware
for this: it reprograms `SCX`/`SCY` from an LCD STAT (LYC) interrupt fired at each band's start
scanline (`appData/src/gb/src/core/parallax.c` in the B reference tree). The SNES has real
hardware for exactly this - **HDMA** - so this port uses that instead: PVSnesLib's
`setParallaxScrolling()` (`dma.h`) arms HDMA channel 3 from a small table (`HDMATable16`) that
the PPU itself walks once per scanline during the active picture, rewriting `BG1HOFS` with zero
CPU involvement after the table is built. No second BG layer is used (BG2 stays unused) - all
bands render from the *same* BG1 scene background, just scrolled at different rates, exactly
like B's own single-layer model.

`speed` is a **signed shift**, not a fraction or a multiplier - matching B's `PARALLAX_STEP`
macro/`parallax_row_t.shift` field exactly: positive = slower than the camera (`scroll_x >>
speed`, e.g. a distant background), negative = faster (`scroll_x << -speed`, a foreground
layer), 0 = matches the camera exactly (same as no parallax for that band). `height` is in
tiles; `compileSnesData.js` converts it to scanlines (`× 8`) and always auto-extends the last
band to cover every remaining line down to the SNES's real screen height (224 NTSC), so there
are never gaps.

**X-axis only** - matches `setParallaxScrolling()` itself, which drives a single `BGxHOFS`
register (`dmas.asm`'s `_bgscridx` table). GB Studio 3.x's own parallax also shifts `SCY` per
band; there's no ready-made SNES equivalent for that and no engine need identified yet, so this
is a deliberately narrower port, not an oversight.

Engine: `appData/src/snes/src/parallax.c`/`.h`. `SceneInit` (`scene.c`) reads the scene blob's
fixed `[MAX_PARALLAX_LAYERS(3)*2]` band table (right after the `[24]` sprite-slot table - see
`compileSnesData.js`) into `parallax_lines[]`/`parallax_shift[]`, and sets `parallax_active`.
`game.c`'s main loop calls `ParallaxUpdate()` once per frame, right after the existing
`bgSetScroll(0, scroll_x, scroll_y)` call, only while `parallax_active` is set - `scroll_y`
(vertical) is still owned by the plain `bgSetScroll` call either way. Leaving a parallax scene
for one with none explicitly disables HDMA channel 3 (`setModeHdmaReset`) in `SceneInit` - it's
a **sticky** register (`REG_HDMAEN`), so without this a scene with no parallax at all would
otherwise keep replaying the *previous* scene's stale HDMA table over its own `BG1HOFS` forever.

**Verified (M8, v4)**: a real Mesen run with a 2-band scene (`{height:8, speed:1}, {height:10,
speed:-1}`) at a real non-zero `scroll_x` (104, from a wide test scene and an off-centre player
spawn) read the live `HDMATable16` WRAM buffer back as `[64, 52, 0, 160, 208, 0, 0, ...]` -
`52 = 104 >> 1` and `208 = 104 << 1` exactly, matching the signed-shift formula by hand for both
a positive and a negative `speed` in the same run, with the correct per-band line counts (64,
then 160 auto-extending to the screen height) and a `0`-line terminator. `parallax_active` read
back `1` on the parallax scene. Confirms the HDMA table the hardware actually walks holds the
right numbers, not just that the C code compiles.

## Priority tiles (M7, v4)

Not a B feature - there's no equivalent GB Studio/GBC concept to port (checked B's real
`consts.ts`: its `TILE_PROPS` upper nibble is entirely ladder/slope flags for the Platformer
genre, nothing priority-related). This is a genuinely new capability added specifically because
the SNES PPU natively supports real per-tile BG-above-OBJ priority in Mode 1 - the DMG/GBC has
nothing like it (only a per-*sprite* OAM priority bit, no fine per-BG-tile control at all).

**Editor**: a "Priority" brush (`BrushToolbar.js`, `TILE_PROP_PRIORITY = 0x20`), painted exactly
like collisions/the existing (SNES-unused until now) Ladder brush - a free bit in the same
`TILE_PROPS` (0xF0) upper nibble of the collision-grid byte, reusing 100% of the existing
collision paint-tool infrastructure (`SceneCursor.js`'s `TILE_PROPS`-masked painting already
worked generically, no code changes needed there at all). Rendered in the World editor as a gold
corner marker (`SceneCollisions.js`).

**Compiler** (`compileSnesData.js`): background tilemaps are cached **per background asset**
(shared across every scene that uses it), but priority is painted **per scene** (same grid as
collision) - two scenes sharing one background could paint different priority patterns. A scene
with no priority tiles painted keeps referencing the shared tilemap unmodified, at zero cost
(`scene_bg_map_ptrs[i] = 0`). A scene that paints any gets its own tilemap *copy*, with the real
SNES tilemap priority bit (`BG_TIL_PRIO`, `1<<13` - the same bit `snesgfx.js` already reserved
per-tile in its packed format) OR'd in at the painted positions, emitted as its own `src/data/
scene_bgmap_<n>_data.as` blob (the same "graphic assets are 65816 source" scheme every other
per-scene override already uses) and referenced from `scene_bg_map_ptrs[i]`.

**Engine** (`scene.c`): `SceneInit` DMAs from `scene_bg_map_ptrs[scene_index]` when it's set,
falling back to the shared `bg_maps_ptrs[bg_index]` otherwise - no other engine change needed to
make the *tilemap* bit itself take effect, since per-tile BG priority is a Mode 1 PPU hardware
feature the tilemap format already fully supports once the bit is set correctly.

**What *did* need an engine change**: every OAM sprite (actors, the emote bubble) used to render
at OBJ priority 2. In Mode 1 (with BG3 kept in "priority high" mode for the dialogue box, as this
engine already does), the layer order back-to-front is `BG1/BG2(low) < OBJ0 < BG1/BG2(high) <
OBJ1 < OBJ2 < OBJ3 < BG3(high)` - so a BG1 "high priority" (painted) tile sits *below* OBJ1-3,
meaning it would never actually render above the player at the old priority 2. Actors and the
emote bubble (both world-space sprites a priority tile is meant to occlude) now render at OBJ
priority 0 instead - below a painted priority tile, same as before above every *ordinary* BG1
tile. The dialogue avatar portrait (`ui.c`, UI-space, unrelated to world priority tiles) is left
at priority 2, unchanged.

**Verified (M8, v4)**: a real Mesen run against a purpose-built fixture (BG1 tilemap base
`bgSetMapPtr(0, 0x0000, SC_32x32)`) confirmed both halves directly, by reading real emulated
state rather than trusting the source: the VRAM word at the painted tile's map index
(`ty*32+tx`) read back `hi=0x20` (the `BG_TIL_PRIO` bit set, tile index 1 - the painted tile,
not the shared background's tile 0), and a neighbouring unpainted tile in the same map read back
`hi=0x00` (bit correctly scoped to only the painted tile). The player's real OAM attribute byte
read back `0` (priority bits `00`), confirming the OBJ-priority-0 fix is actually in the compiled
ROM, not just the source. Getting a literal rendered-pixel screenshot to confirm the visual
occlusion hit a Mesen Lua tooling snag this session (`emu.getPixel` hung intermittently across
repeated scripted relaunches, unrelated to ROM content - see Claude's memory `m8-verification-
2026-09-19` for the full writeup), so the very last link (does Mode 1 hardware really composite
the two exactly as documented) is still sourced from SNES hardware documentation rather than an
independently observed frame - but both engine-side mechanisms M7 introduced are now confirmed
correct against real hardware state, not just re-read source code.

## Projectiles (v4)

`Launch Projectile`, `Weapon: Attack` and `Player: Bounce` (Platformer physics, unrelated to
Projectiles proper - kept in this section only because all 3 were `Script_Noop_b` together
since the original SNES port and got real handlers in the same pass) all shipped for real. The
compiler side (event fields, `scriptBuilder.js`'s `launchProjectile()`/`weaponAttack()`/
`playerBounce()`, opcode reservations) had existed since the original port; only the engine side
was ever missing.

**Direction-based, not angle-based** - unlike GB Studio 3.x's real Launch Projectile (4 aiming
modes: fixed direction, aim-at-actor, literal 0-255 angle, angle-from-variable; genuine
diagonal trig movement), this engine's own Launch Projectile only ever compiled a plain 4-way
`direction` union (fixed/variable/property) - matching how every other actor on this engine
already moves (axis-locked, `dir_x`/`dir_y` only, no angle/trig anywhere else in the codebase).
Kept as-is rather than reopening the wire format to add angle support nothing else needs.

**No dedicated projectile VRAM/sprite budget** - a projectile's sprite must already be loaded
into the launching scene's own OBJ pool (same 8-slot-per-scene mechanism actors and the player
use, M7-cont.), resolved at compile time to that scene's slot 0-7. `compileSnesData.js` scans
every scene's scripts for `Launch Projectile`/`Weapon: Attack` sprite references
(`sceneProjectileSpriteIds`) and adds them to that scene's sprite pool automatically, the same
way avatar sprites already are - an author doesn't need to also add an actor using that sheet
just to make it available. Rendering borrows whichever slot's tiles/palette are already
resident; always frame 0 (h-flipped moving left) - full 4-direction facing wasn't ported this
pass (most bullet/arrow art doesn't need it, and it's addable later without a wire-format
change).

**Real collision** (not just flight): a small fixed pool (`MAX_PROJECTILES = 4` per scene,
`appData/src/snes/src/scene.c`) each carries the launching event's `collisionGroup`/
`collisionMask` (packed into one byte, matching `collisionGroupDec()`/`collisionMaskDec()`'s
existing bit values). `Actor.collisionGroup` (already in the schema, carried over from GB,
previously unused on this target) and `Actor.hit1Script`/`hit2Script`/`hit3Script` are now
compiled into the scene blob and actually wired: a projectile whose own `collisionGroup` is
"player" fires the hit actor's regular script, "1"/"2"/"3" fire `hit1`/`hit2`/`hit3Script`
respectively - matching B's own `ActorEditor.tsx` `hitTabs` mapping exactly (its "Player" hit
tab maps to the plain `script` key too, not a dedicated slot).

**The player can be hit too (follow-up, same session).** `Scene.playerHit1Script`/
`playerHit2Script`/`playerHit3Script` - already in the schema and already wired in
`SceneEditor.tsx`'s "On Player Hit" tab, carried over from GB, previously uncompiled on this
target - are now compiled into the scene blob (matching B's `script_p_hit1/2/3` exactly:
collision group 1/2/3 fires `playerHit1`/`playerHit2`/`playerHit3Script` respectively; a
"player"-group projectile hitting the player fires nothing, there's no slot for it, matching how
`Actor.hit1/2/3Script` has no such case either). `ProjectilesUpdate()` now tests the player
(index 0) the same way it tests every other actor. No `player_iframes`/invincibility-window
concept was ported for this path - not needed for it specifically, since a projectile is always
destroyed on the hit that triggers the script (a genuinely one-shot event), unlike B's other
player-hit path (an actor *walking into* the player, which can overlap for many consecutive
frames and would need real debouncing) - that path (enemy-actor-touches-player, as opposed to
enemy-*projectile*-touches-player) is not ported and would need that invincibility window built
first if it ever is.

**No `lifeTime`/`destroyOnHit` fields** - this engine's Launch Projectile wire format (5 bytes,
fixed since the original port) has no room for either (unlike B's own event). A launched
projectile always destroys on hit and relies entirely on leaving the scene's bounds to despawn
otherwise (no countdown). Weapon Attack's momentary hitbox uses a fixed internal 15-frame
lifetime instead (not author-configurable) - long enough for the collision test to actually run
against it, short enough to read as instantaneous.

**Player: Bounce** matches B exactly: a fixed upward velocity impulse (`PlatformSetVelY()`,
scene.c) using the identical fixed-point scale this engine's whole Platform physics was already
ported from verbatim, not a simulated bounce - normal gravity does the rest. Only meaningful on
Platformer scenes (compiles and no-ops harmlessly everywhere else, matching B).

**Verified (v4)**: a real Mesen run confirmed the entire pipeline end to end against live WRAM
state, not just source review - Launch Projectile: correct spawn position/direction/speed byte,
movement (`x/y += dir*speed` matched exactly frame over frame), collision firing exactly when
its box first overlapped the target actor's, the correct `hit1Script` (matching `collisionGroup
"1"`) writing its marker variable, and clean post-hit pool cleanup (`active` back to 0, no
double-fire). Weapon Attack: spawn position exactly `actor position + offset` along the actor's
*current facing* (not a direction argument of its own), and correct ttl-driven self-destruct
with no collision fired (deliberately mismatched `collisionMask` in the test, to isolate the
lifetime behaviour from the already-proven collision path). Both pool slots' full raw struct
layout (including 816-tcc's own alignment padding, empirically confirmed rather than assumed)
matched every expected field. **Player-hit follow-up, same day**: a second Mesen run (a
projectile spawned from a non-player actor, aimed at the player) confirmed it correctly hit the
*player* specifically rather than its own source actor, and the scene's `playerHit1Script`
(matching `collisionGroup "1"`) fired exactly once, writing its marker variable - the player's
own position/state stayed stable afterward (no corruption, no re-trigger, no hang).

## Scenes

| Event | SNES | Notes |
| --- | --- | --- |
| Switch Scene | ✅ | With the fade-out / fade-in handshake. |
| Scene Push State, Pop State, Pop All State, Reset State Stack | ✅ | Stack of (scene, player tile pos, facing) snapshots — e.g. a pause-menu scene that returns exactly where the player left off. |
| Return to Title | ≡ | `Noop` on the Game Boy engine too — nothing to match. |

## Dialogue, menus & overlay

| Event | SNES | Notes |
| --- | --- | --- |
| Display Text (single or multi-page) | ✅ | BG3 box, typewriter, `$NN$` variable substitution, word-wrap. Multi-page keeps the box visually open across pages. Font + box border come from the project's `assets/ui/ascii.png` / `frame.png` (max 3 colours on the box). Font is a real project entity as of M5 (v4) - `assets/fonts/*.png` - but only **one** font is ever compiled in (the project's first Font entity, or the legacy `assets/ui/ascii.png` if it has none): no in-game font switching, unlike GB Studio 3.x's mid-dialogue `\002\<font>` escape code, which would need a real VRAM glyph-reload mechanism this engine doesn't have (a fixed 235-tile BG3 region at 0x3000, see the M5c/M5d history below). |
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
| Save Data, Load Data, Clear Data, If Data Saved | ✅ | Cartridge SRAM, **3 independent save slots** (`FIELD_SAVE_SLOT`), each its own fixed-size region. Saves the same scope as GB: player position / facing + all `script_variables[]` (not other actors, the scene stack, or timers). Save Data (M4, v4) also runs an **On Save** child branch straight after the opcode - GB Studio 3.x polls an async write-completion flag first (real GB flash carts), but `consoleCopySramWithOffset` on this toolchain is synchronous, so there's nothing to poll and no branch is needed. |

## Not yet implemented (M16 opcode audit, 2026-09-18)

A full row-by-row re-check of `script_cmds.c` against `scriptCommands.js` (guarded by
`snesScriptCmds.test.js`) found these opcodes still `Script_Noop_b` and missing from this
doc — all deliberately deferred (each has its own comment in `script_cmds.c` explaining why),
not silent holes; every one has a real table row, just no runtime behaviour yet.

| Event | SNES | Notes |
| --- | --- | --- |
| Actor: Set Sprite Sheet (union-type variant) | ➖ | Per-actor sprite override introduced with the `On Update` scripted-movement rework; needs that port first. |
| If Actor Relative to Actor, Actor: Stop Update Script, Actor: Set Animate | ➖ | All need the `On Update` per-actor movement-script port (see `appData/src/snes/README.md` — a real, separate architecture piece, not a mechanical opcode wire-up). |
| Engine Field: Update / Update Word / Update Variable / Update Variable Word / Store / Store Word | ➖ | Runtime Engine Field writes (the union-type "fixed value vs variable, byte vs word" family) — Engine Fields exist and are edited from Settings, but a script can't write one back at runtime yet. |

**Launch Projectile / Weapon: Attack / Player: Bounce shipped (v4, real Projectiles subsystem)** -
see their own section below. All 3 were listed here through M16; they're the first opcode-audit
gaps this doc has actually closed rather than just documented.

`Palette: Set Background` / `Set Actor` / `Set UI` used to be listed here as ➖ (dispatchable but
inert). The GB-heritage custom-palette editor these events edited was removed entirely - it had
no purpose on SNES, since `snesgfx.js` already extracts each background/sprite's real palette
straight from its PNG with no user-editable overlay. `EVENT_PALETTE_SET_BACKGROUND` /
`_ACTOR` / `_UI` no longer appear in the event picker at all; the corresponding opcodes
(`PALETTE_SET_BACKGROUND` / `_ACTOR` / `_UI`) stay reserved, still-Noop entries in
`script_cmds.c` so opcode numbering downstream of them doesn't shift.

---

## Editor (not scripting — M9)

The editor is data-driven and already renders SNES projects correctly.

| Area | SNES-aware? | Notes |
| --- | --- | --- |
| Settings: Target Platform, Region (NTSC/PAL), Save Memory (SRAM size) | ✅ | GB-only sections (GBC options, cartridge type) hide when SNES is selected. |
| Settings: Controls | ✅ | For a SNES project the key-binding list grows an X / Y / L / R column and the pad diagram is the SNES pad (L/R shoulders, X/Y/A/B diamond) instead of the Game Boy one. New settings keys `customControlsX/Y/L/R`; the bundled web player binds them and falls back to `i`/`u`/`o`/`p`. |
| World editor: `Camera: Move To` viewport rectangle | ✅ | Sizes to the target's real screen (32×28 vs 20×18). |
| World / scene canvas geometry | ✅ | Data-driven — the scene canvas is sized from the background's tile dimensions (a 32×28 SNES background renders at 32×28 tiles). Scenes are still capped at 32×32 tiles for both targets. |
| Colour rendering (scene / background / sprite previews) | ✅ | The World editor's scene/sprite previews used to run every image through a GB-green-channel quantization heuristic (`ColorizedImage`/`SpriteSheetCanvas.worker`, GB Studio 2.0 heritage) before display. Removed along with the custom-palette editor - previews now show each PNG's real colours directly, matching what the compiler already builds into the ROM. |
| Backgrounds page: size warnings | ✅ | "Too small / too large" now use the target's screen (256×224 on SNES) and scene-map size, not the fixed GB 160×144 / 256×256. |
| Scene info bar: sprite budget | ✅ | GB shows a per-scene sprite-*frame* budget (`F: n/25`); SNES shows distinct actor sprite *sheets* (`S: n/8`, the real `SPRITE_SLOTS` limit — project-wide, enforced by a compiler warning). |
| Sprite editor: dimensions, frame counts | ✅ | 16×16 frames, 1/3/6-frame types — the same shape the SNES engine uses. |
| Input events: X / Y / L / R options | ✅ | `InputPicker` shows a third button row (X / Y / L / R) for SNES projects; the engine reads them (see *Timers & input* above). Their keyboard/pad bindings are set on the Settings > Controls page (row above). |
| Palette editor | — | Removed entirely (menu, page, per-scene/actor palette pickers, the "Colorize" paint tool): `snesgfx.js` already extracts each background/sprite's palette from its PNG automatically, nothing to edit by hand. |
