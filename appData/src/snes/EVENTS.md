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
| Set Position, Move To (+ to-variables, relative variants) | ✅ | Tile-locked movement, per-scene collision bitmap. **v4 fix (user-found):** `SceneUpdateActors`'s per-frame stepping loop used to skip a scripted move entirely while its actor was hidden (`ACTOR_HIDE` sets `enabled=0`) - the move's own "aim" step isn't gated on `enabled`, so it still armed `moving=1`, but the stepping loop's unconditional `if (!a->enabled) continue;` then skipped the actual position advance forever: the actor's position never reached its destination, the blocking move command (and the rest of the script after it) hung permanently. Now lets the actor currently targeted by a scripted move (`is_cmd`) step regardless of `enabled` - rendering is unaffected (`SceneRenderActors` has its own, separate `enabled` check). Verified in Mesen: reverting the fix reproduces the hang exactly (position frozen, `script_action_complete` stuck at 0); with the fix, a hidden actor's position advances normally and a trailing script step after the move runs. **Related, separate, not fixed here**: `SceneUpdateAi` (NPC random-walk/face AI) also checks `enabled` before `active` when arming a move, which contradicts `gbs_types.h`'s own doc comment on `active` ("a hidden-but-active actor still moves and blocks") - so a hidden-but-active AI-driven NPC likely has the same stuck-movement issue today. Not reported by a user yet and out of scope for this fix (which only touched the stepping loop's `is_cmd` case), but worth revisiting if it surfaces. **v4 fix #2 (user-found: "Path to Sample Town", a Turnip actor's own On Update bob walked straight through a collision tile):** the "Use Collisions" checkbox has compiled to a real wire-format byte since v2 (2.0.0-beta5), but every `BEGIN_MOVE` call site (`Move To`/`Move Relative`/`Move To Value`) unconditionally OR'd in `ACTOR_NOCLIP` regardless of it - every scripted move ignored tile and actor collision entirely, no matter what was checked in the editor. `BEGIN_MOVE` now only sets `ACTOR_NOCLIP` when the byte is false. Verified with a real toolchain build + Mesen A/B: a synthetic actor Move-Relative-ing into a wall with Use Collisions checked now stops one tile short of it (as `can_step`'s existing "destination tile + one to the right" footprint predicts) instead of sailing through to its full, unobstructed destination. `moveType` (horizontal/vertical/diagonal sequencing) remains unimplemented. |
| Get Position, Move to Vectors / Load Vectors | ✅ | |
| Push Actor | ✅ | Pushes in the actor's current facing direction (no NOCLIP). |
| Set Movement Speed | ✅ | |
| If Actor at Position, If Actor Facing Direction | ✅ | |
| Set Direction, Set Direction to Variable, Get Direction | ✅ | 3-frame and 6-frame actor sheets show the matching facing frame (down / up / side, side flipped), recomputed from the actor's direction every frame — works on stationary NPCs too. 1-frame sheets set the direction internally (movement / collision use it) but have no distinct facing frame, same as on GB. |

## Actors — appearance

| Event | SNES | Notes |
| --- | --- | --- |
| Show Actor, Hide Actor | ✅ | |
| Activate Actor, Deactivate Actor | ✅ | M4 (v4). Toggles a new `active` flag (independent of `enabled`/Show-Hide) gating AI, movement, collision and interaction — `npc_blocking`, `SceneTryInteract`, `actor_at_tile`, `SceneUpdateAi` in `scene.c` all skip an inactive actor. v4 follow-up: now also re-launches/terminates the actor's persistent "On Update" script (see its own section below), matching GB Studio 3.x's real `activate_actor()`/`deactivate_actor()`. The player can never be deactivated (same guard as B's `if (actor == &PLAYER) return;`). Rendering and animation cycling are unaffected — a deactivated-but-shown actor still stands there and animates. |
| Show All Sprites, Hide All Sprites | ✅ | |
| Actor animation | ✅ | A 6-frame actor sheet walk-cycles (2 poses per direction) while moving. An "animated" sheet with 2/4/5/6 frames auto-cycles all of them (a duck, a torch) when "Animate Frames" is ticked. 3-frame sheets are direction-only (no cycle); 1-frame sheets are static. |
| Actor Emote | ✅ | 16×16 bubble on OBJ palette 1. Emote is a real project entity as of M5 (v4) - `assets/emotes/*.png`, one 16×16 PNG per emote, up to 8 (the fixed project-wide OBJ region this builds into - a genuine SNES OBJ VRAM budget, not per-scene like actor sheets/avatars). A project with none yet falls back to the legacy fixed `assets/ui/emotes.png` 8-wide grid; an already-saved numeric `emoteId` (from before this entity existed) still resolves correctly as long as no real Emote entities have since been added (mixing old numeric refs with new entities after the fact isn't handled - a documented, narrow gap, not silently papered over). |
| Sprite sheets per scene | ✅ | Loaded per scene (player + up to 7 of that scene's actor sheets), so the total project sprite-sheet count is unbounded. A single scene with 9+ distinct actor sheets overflows the extras to slot 0. |
| Per-actor sprite colours | ✅ | Each distinct sprite sheet gets its own 16-colour OBJ palette (extracted from the PNG). OBJ palettes 1 and 2 are reserved for emotes / avatars, so up to **6** distinct sprite sheets *in one scene* keep their own colours; a 7th/8th reuses palette 0. |
| Set Collisions Enabled / Disabled | ✅ | |
| Player: Set Sprite Sheet | ⚠️ | Only works for a sheet **already loaded into this scene** — i.e. used by some actor/the player, a projectile/weapon event, or *another* Set Sprite Sheet event elsewhere in the same scene. GB streams new sprite tiles into VRAM at runtime; this engine pre-bakes ≤ 8 sprite sheets into fixed OBJ slots at build time and has no runtime streaming. Switching to a never-used sheet is a silent no-op. **v4 fix (user-found):** the compiler used to only scan Launch Projectile/Weapon Attack events for "which sheets does this scene need loaded" - a sheet referenced *only* via a Set Sprite Sheet event (exactly what a "swap to a named alternate look" pattern needs) silently never got loaded at all, even though the author genuinely referenced it. Fixed - both Set Sprite Sheet events now count as a real reference too. Also fixed: swapping between sheets of different frame counts used to leave the actor's frame count at the *old* sheet's value - fewer frames than the new sheet froze its animation, more frames than the new sheet read OBJ tile data that sheet's own upload never wrote (a real corruption risk). Both fixed and Mesen-verified: swapping a 1-frame sheet for a 6-frame one mid-scene now animates correctly, not frozen on frame 0. |
| Actor/Player: Set Sprite Swap | ✅ | v4. Renamed from "Set Sprite State" (user-asked, to stop colliding with the newer "Set Animation State" below - the two share GB Studio's own "SpriteState" name upstream but are genuinely different features here). A sprite sheet can carry an optional named `states[]` list, each just a name + pointer to another already-existing sheet - no per-tile composition, this is a *whole-sheet* swap. `EVENT_ACTOR_SET_STATE`/`EVENT_PLAYER_SET_STATE` (command ids unchanged, only the display label changed, so no existing project's data format is affected) are a thin compiler-only layer: `stateId` resolves through the selected sheet's `states[]` to a real target sheet, then calls the exact same `actorSetSprite`/`playerSetSprite` helpers Set Sprite Sheet already uses - no new opcodes, so it inherits that event's own row above verbatim (same "already loaded into this scene" restriction, same fixed `frames_len` recompute). Verified two ways: a jest test compiles `EVENT_PLAYER_SET_STATE` and an equivalent hand-authored `EVENT_PLAYER_SET_SPRITE` through the real `compileEntityEvents`/`ScriptBuilder` pipeline and asserts byte-identical output (proves zero new runtime behaviour); a real toolchain build (an animated 6-frame sheet with one named state pointing at a 3-frame sheet, switched via `EVENT_PLAYER_SET_STATE` in the start scene's own script) booted in Mesen - WRAM settled at `sprite_type=1, frames_len=1` (the 3-frame sheet's own correct values, not the original 6-frame sheet's stale `frames_len=2`), stable for 130+ frames. |
| Actor/Player: Set Animation State | ✅ | v4 follow-up, "named animation states" matching GB Studio 3.2.1's own real per-sheet SpriteState concept (several named pose-sets *within* one sheet, not a whole-sheet swap - see Set Sprite Swap just above for that older, differently-named feature). A metaspriteMode sheet's own top-level `metasprites`/`metaspriteTiles`/`animationType` are its default/implicit state ("state 0"); an optional `animStates[]` holds any extra named states, each a self-contained pose-set with its own `animationType` (so e.g. a 1-frame "Hurt" state and a 6-frame "Walk" state can coexist on one sheet). Genuinely viable now that `packSceneSprites.js`'s on-demand packer (M8.1-M8.3) gives a scene's whole actor/avatar OBJ data a flexible 512-tile budget with dedup, rather than the old fixed 256-tile/8-region scheme an earlier pass over this doc assumed was still current - every extra state's own tiles are just more quads for the same packer to place, no runtime VRAM streaming needed at all. `compileSnesData.js` packs every state's own frame data into the SAME per-slot blob `metasprite_frame_base[slot]` already points at (default state first, extras appended after, each with its own `{frames_len, spriteType, byteOffset}` directory entry); the new `ACTOR_SET_ANIM_STATE`/`PLAYER_SET_ANIM_STATE` opcodes set a new per-actor `anim_state_offset` field (`gbs_types.h`) added onto that base pointer at render time - 0 for every actor still on its sheet's own default state, so an untouched project's rendering is completely unaffected. Found and fixed a real bug during the SAME `writePal()` refactor this needed: an extra state's own newly-introduced OBJ colours were being merged into the scene's running palette but never actually re-written to the compiled palette bytes, since the write happened right after the default state's own merge, before any extra state had a chance to contribute a colour - fixed by moving the write to after every state (default + extras) has merged in. Verified in Mesen: a real toolchain build (a `fixed` default state, one `fixed` extra "Attack" state with 2 placed tiles instead of 1, switched via `EVENT_PLAYER_SET_ANIM_STATE` in the start scene's own script) read back `anim_state_count[slot]=1` and `anim_state_offset=7` from WRAM - exactly the default state's own encoded byte length (a 1-frame, 1-tile metasprite: 2-byte frame-offset table + 1-byte entry count + 4-byte entry = 7), confirming the extra state's data is packed immediately after it at a byte-exact correct offset. The Sprites page editor is now built too, reusing the exact existing UI/reducer patterns rather than designing anything new (user-confirmed: the live Sprite Swaps list pane is "suffisante" as a template to extend): a third stacked left-sidebar pane, "ANIMATIONS" (`SpriteNavigator.tsx`, mirroring the existing Sprite Swaps pane's list/add/remove pattern exactly), and the existing `MetaspriteCanvas`/`MetaspriteToolbar`/`MetaspriteFramesTimeline` components all gained an optional `animStateId` prop so the same click-to-place canvas, toolbar and frame strip edit a selected state's own `metasprites`/`metaspriteTiles` instead of the sheet's default ones (a small shared `getMetaspriteContainer`/`writeContainerChanges` duck-typing helper in `entitiesState.ts` resolves which one every affected reducer reads/writes - `AnimState` and `SpriteSheet` are structurally interchangeable for every tile/frame operation). `SpriteInspector.tsx` gained a matching Name/Animation Type/Canvas Size settings block for the selected state. Verified with real DOM-rendered smoke tests (`test/components/sprites/MetaspriteCanvas.test.tsx`, `SpriteNavigator.test.tsx`, `SpriteInspector.test.tsx`), not just the reducer-level tests in `entitiesState.test.ts` - this repo's TypeScript toolchain can't currently run a whole-project `tsc` (an unrelated, pre-existing `@types` version mismatch chokes on parsing `node_modules` itself), so a real component render through `ts-jest`'s per-file diagnostics was the most reliable compile-correctness check available short of a full `npm start`. |
| Sprites page: Animations / Frames panel (editor only, no opcode) | N/A | v4 follow-up, same user request. `getSpriteAnimations(type, numFrames)` (`src/lib/helpers/spriteAnimations.js`) labels this engine's existing, purely file-width-derived frame convention (down/up/side × idle/walk-cycle-AB, or a single flat "Idle" list for a non-directional sheet) - a pure, read-only function, no new compiler/engine behaviour. The Sprites page shows it as an "ANIMATIONS" list (left dock) + a "Frames: `<name>`" strip docked over the right-hand preview area (`SpriteAnimationsPanel.tsx`/`SpriteFramesPanel.tsx`) - user-found the first cut crammed frame thumbnails into the narrow left sidebar; moved next to the actual preview image instead. Each frame box is a real, absolute index (0..`numFrames`-1) into the sheet's own strip via a new `SpriteSheetCanvas` `rawFrame` prop (bypasses the direction-based `directionToFrame` helper entirely). **Deliberately read-only, reverted from a brief editable pass** (a "+"/click-to-remove editor-only frame curation, `SpriteSheet.animationFrames?: number[][]`) - on review it didn't hold up: for a directional (actor/actor_animated) sheet the engine hardcodes exactly 1 idle frame and 2 moving frames (`scene.c`'s `actor_render_tile`, no per-animation frame table), so editing the list there could never do anything the compiled game would honour; for an Idle-only sheet it could only reorder/repeat/drop frames the PNG already has, not add real new content. Removed rather than leave a control implying capability that doesn't exist. Adding a genuinely new named animation (not just curating an existing one's frames) has the same "engine has no data-driven per-animation table" limitation and isn't supported either. |
| Actor: Set Animation Speed | ✅ | Paces the walk cycle of a 6-frame actor sheet (and the auto-cycle of a 6-frame sheet on a non-moving actor with "Animate Frames" ticked). No effect on 1- or 3-frame sheets, which don't cycle. Higher value = faster; default 3. |
| Actor: Set Frame, Set Frame to Variable, Set Flip | ✅ | v4 follow-up (user-asked, after this doc's own ⚠️ row explaining why they didn't work on a directional sheet). All 3 used to only have a real effect on a non-directional ("fixed") sheet - a 3-/6-frame directional sheet's render (`actor_render_tile`/`actor_metasprite_pose`, `scene.c`) recomputes pose + flip from `dir_x`/`dir_y` fresh every frame, silently overwriting whatever these opcodes had just stored (and for Set Frame specifically, the stored value itself was *also* pre-clamped to the wrong range - `frames_len` is deliberately 1 for a 3-frame sheet and 2 for a moving 6-frame one, since that field drives the walk cycle, not a frame picker). Fixed with a new per-actor `frame_override` flag (`gbs_types.h`): set by all 3 of these opcodes (using a *separate* `override_frame_count()` - the sheet's real pose count, 3 or 6, not `frames_len`, to clamp the stored value correctly), cleared by **Actor: Set Direction** - the canonical "resume automatic facing" signal - and also cleared on a sheet swap (Set Sprite Sheet, Set Animation State) since an override tied to the old sheet's pose layout wouldn't mean anything on the new one. While the flag is set, the render path trusts `frame`/`flip` as-is instead of deriving them from facing - same code path a non-directional sheet always used. Doesn't defeat a moving/auto-animating actor's own walk-cycle tick (`SceneAnimateActors`) overwriting `frame` again on its own cadence - the same pre-existing caveat the "fixed" sheet case already had for an `animate`-flagged actor, now just also true here; a one-off pose override on an idle actor is the realistic use case, not fighting a live walk cycle every tick. Verified: full jest suite (158 suites) and the real vendored-toolchain link (`buildSnesRom`) both pass. |

## Camera

| Event | SNES | Notes |
| --- | --- | --- |
| Camera Move To | ✅ | Clamped to the SNES screen size (32×28 tiles), not the GB 20×18. |
| Camera Lock, Camera Shake | ✅ | |

**Camera deadzone/offset (v4).** Not a scripting event on either engine - GB 3.2.1's own
`camera_deadzone_x/y` (a follow-window pixel half-width around the player) and
`camera_offset_x/y` (a fixed shift of that window) are pure per-genre state defaults, set once
by each genre's own `Start_<Genre>()`/`*_init()`, with no event anywhere that sets them from a
script. Now ported to this engine's `CameraUpdate()` (`game.c`) as a direct port of GB's real
formula (`appData/src/gb/src/core/camera.c` in the v3.2.1 reference), converted only for this
engine's camera_x/y being a *scroll* (left-edge) value rather than GB's own *screen-centre*
value. Defaults, matching GB exactly: Top Down 0/0 (unchanged hard lock - this genre's own prior
behaviour already matched GB's own Top Down default), Adventure 8px both axes, Platform 4x/16y,
Point and Click 24px both axes, Shmup 0 deadzone + a scroll-direction-biased offset (48/-64/48/-48
depending on the scene's initial facing, same 4 magic numbers GB uses). `camera_settings` now
uses GB's real independent `CAMERA_LOCK_X_FLAG`/`CAMERA_LOCK_Y_FLAG` bits (`camera.h`) instead of
this fork's own single combined bit, even though no event here locks one axis without the other
yet (`CAMERA_LOCK_FLAG` is still both bits together, same wire behaviour as before). **Verified**:
full test suite green, a real toolchain build (816-tcc/816-opt/wla-65816/wlalink) compiles/links
the changed `game.c`/`scene.c` cleanly. **Not verified**: an actual live Mesen run watching the
deadzone/offset take effect during real movement - same gap class as M3's RPN opcodes, M6's HDMA
parallax and M7's priority tiles (no reusable Mesen automation harness exists this session, and
this change's own risk is comparatively lower than those three - pure CPU-side position
arithmetic feeding the same scroll-register write path already Mesen-verified many times, not new
PPU/hardware-timing behaviour), so building a whole new asset-backed fixture just for this was
judged disproportionate; flagged here rather than silently assumed correct.

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
feature and the bit is already in the data (see below for where this doesn't apply).

**Not supported on a Map-Engine-routed scene (v4 follow-up - see PERF.md's "Background
streaming" section for the full routing rule).** A scene whose background needs horizontal
streaming AND has no active parallax now loads its tilemap through PVSnesLib's own Map Engine
(`mapLoad`), which has no equivalent of
`scene_bg_map_ptrs`'s per-scene override - `SceneInit` skips that DMA entirely on this path.
Not a regression in practice: checked directly against the real reference project, neither
wide scene that qualifies ("Space Battle", "Path to Sample Town") paints any priority tile.
A future project that does would need re-scoping this (or painting priority on a scene that
either fits in 64 tiles or uses parallax instead).
feature the tilemap format already fully supports once the bit is set correctly.

**What *did* need an engine change**: every OAM sprite (actors, the emote bubble, projectiles)
renders at OBJ priority 2. In Mode 1 with BG3 kept in "priority high" mode for the dialogue box
(as this engine already does), the real layer order - front to back, quoting fullsnes' own
Background Priority Chart, the authoritative source, read literally rather than re-derived - is:
`BG3.1 > OBJ3 > BG1.1 > BG2.1 > OBJ2 > BG1.0 > BG2.0 > OBJ1 > OBJ0 > BG3.0 > Backdrop`. A BG1/BG2
"high priority" (painted) tile sits *above* OBJ1-3 (correctly occludes a sprite at any of those
priorities), and OBJ0 sits *below* BG1.0/BG2.0 - i.e. below *every ordinary tile*, not just a
painted one. Priority 2 is the correct choice: below BG1.1/BG2.1 (still occluded by a painted
priority tile) but above BG1.0/BG2.0 (not hidden by ordinary ones). The dialogue avatar portrait
(`ui.c`, UI-space, unrelated to world priority tiles) is also at priority 2.

**M8's original verification (v4) got this backwards and briefly shipped priority 0**, which
hid every actor/emote/projectile behind the plain scene background - not just a painted priority
tile - reported by the user as "the sprites are displayed behind the current BG" (the Sample
Project's Outside scene made it obvious immediately). Root cause: M8 sourced the layer order from
SNES hardware documentation but transcribed it in reverse, and its own verification only checked
that the *compiled ROM* carried the intended priority *value* (a real Mesen OAM-attribute read
confirmed priority 0 reached VRAM) - it never got a rendered-pixel screenshot to confirm what that
value actually *looks like* on screen (`emu.getPixel` tooling issues that session - see Claude's
memory `m8-verification-2026-09-19`), so the mis-transcribed table went unchallenged. Re-fixed by
reverting to priority 2 (also just restoring what this code did before M7) and re-deriving the
table from fullsnes' raw HTML table directly instead of a re-derived summary.

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
concept was needed *for this path specifically*, since a projectile is always destroyed on the
hit that triggers the script (a genuinely one-shot event) - unlike B's other player-hit path (an
actor *walking into* the player, which can overlap for many consecutive frames and needs real
debouncing). That other path (enemy-*actor*-touches-player, as opposed to enemy-*projectile*-
touches-player) **is now also shipped** - see "Walk-into-a-hostile-actor damage" below, which
does port a real `player_iframes` cooldown.

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

**Walk-into-a-hostile-actor damage, same day (`PlayerContactUpdate()`, scene.c).** The other
half of B's `actors_handle_player_collision()` - now that `Actor.collisionGroup` and the
`playerHit1/2/3Script` firing path both exist from the work above, this was a much smaller
follow-up than it looked like when Adventure/Platform's own comments first flagged it (M5c/M5d)
as blocked on both. Runs once per frame, after every genre's own `Update_*` - **overlap-based,
not movement-blocking-based, and shared across every genre by one function** rather than
genre-specific code in each `Update_*`: Top Down's `actor_try_move()`/`npc_blocking()` already
*blocks* the player from ever stepping onto another actor's tile at all (so real overlap never
happens there to detect), but Adventure and Platform's own player movement never call
`npc_blocking()` in the first place - their collision tests are narrow and terrain-only, so the
player can already freely walk through an NPC in those two genres today. One shared overlap
check (same 16x16-actor-box test used everywhere else actor bounds are compared) covers all five
genres without new genre-specific plumbing. A `player_iframes` cooldown (60 frames, ~1s, no
visual flash during it - GB's own cue, not ported, a documented simplification) prevents
re-firing every single frame while the player stays in contact; once it expires, continued
contact re-fires and restarts the cooldown, matching the intended "still standing in the fire
hurts again" behaviour rather than a permanent one-shot per scene. Only fires the scene's
`playerHit1/2/3Script` (by the *actor's* `collisionGroup` this time, not a projectile's) - not
also the actor's own script the way B fires both, since this engine only runs one script at a
time project-wide; picking one consistently (matching the already-shipped projectile-hits-player
path) beats trying to fire two and only ever reaching the first.

No compiler/schema changes needed - `Actor.collisionGroup` and `Scene.playerHit1/2/3Script` were
already compiled by the work above, this is purely new engine reaction logic. **Verified**: a
real Mesen run (Adventure-genre scene, player spawned exactly overlapping a `collisionGroup:
"2"` actor, no simulated movement needed since the check is overlap- not movement-triggered)
confirmed the full cycle on live WRAM state: the hit fires once (`playerHit2Script`'s marker set
correctly), `player_iframes` starts at ~60 and decrements exactly 1/frame while the marker stays
unchanged (no re-fire during cooldown), and once it reaches 0 the still-overlapping contact
correctly re-fires and restarts the cooldown (~59) - the intended repeating-damage cycle,
confirmed end to end rather than assumed from the code alone.

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
| Mosaic | ✅ | SNES-exclusive (no GB Studio equivalent) - `REG_MOSAIC` hardware pixelisation, ramped frame by frame like Fade In/Out rather than PVSnesLib's own blocking `setMosaicEffect()`, see `mosaic.h`. Targets BG1 and/or BG3 only - BG2/BG4 don't apply to this engine's layout, and sprites (OBJ) have no hardware mosaic on the SNES at all. |

## Music & sound

| Event | SNES | Notes |
| --- | --- | --- |
| Music: Play | ✅ | The project's own `.mod` songs are converted to `.it` (`mod2it.js`) and built into the soundbank by `compileSnesMusic.js` at build time. Lossy vs the GB player: Amiga pitch slides become IT linear slides and a few ProTracker effects are dropped (see `appData/src/snes/README.md` M8 phase 2). |
| Music: Stop | ✅ | |
| Sound: Play Effect (beep / tone / crash / custom) | ⚠️ | Plays a short BRR sample **layered over the music** (via snesmod's dedicated sound region), one of 3 built-in synthesized waveforms or - **real per-project sound effects, shipped in `b2209d2`, this row was just stale** - a `"custom"` type reading a real project asset (`assets/sounds/*.wav`, `src/lib/compiler/compileSnesSfx.js`), encoded to `.brr` via the vendored `snesbrr` (now present for all 3 vendored platforms - win32/linux/darwin-arm64). "Beep" and "Tone" use a generated square-wave blip; "Crash" a noise burst; "Custom" plays the author's own sample at a chosen pitch (1-8, the same scale "Beep" uses). The beep's pitch maps onto the SNES 1–6 range; "Tone"'s exact frequency and "Stop Tone" are ignored (every sample is a one-shot, including a custom one). If `snesbrr` can't be resolved for the current platform at all, custom effects fall back to silent rather than failing the build. |

## Save data

| Event | SNES | Notes |
| --- | --- | --- |
| Save Data, Load Data, Clear Data, If Data Saved | ✅ | Cartridge SRAM, **3 independent save slots** (`FIELD_SAVE_SLOT`), each its own fixed-size region. Saves the same scope as GB: player position / facing + all `script_variables[]` (not other actors, the scene stack, or timers). Save Data (M4, v4) also runs an **On Save** child branch straight after the opcode - GB Studio 3.x polls an async write-completion flag first (real GB flash carts), but `consoleCopySramWithOffset` on this toolchain is synchronous, so there's nothing to poll and no branch is needed. |

## Not yet implemented (M16 opcode audit, 2026-09-18)

A full row-by-row re-check of `script_cmds.c` against `scriptCommands.js` (guarded by
`snesScriptCmds.test.js`) found these opcodes still `Script_Noop_b` and missing from this
doc — all deliberately deferred (each has its own comment in `script_cmds.c` explaining why),
not silent holes; every one has a real table row, just no runtime behaviour yet.

This section is now empty — the last remaining item, Engine Field runtime writes, shipped (v4
follow-up, see "Engine Fields" below). **Launch Projectile / Weapon: Attack / Player: Bounce
shipped (v4, real Projectiles subsystem)** - see their own section below. **Actor: Start/Stop
Update Script shipped (v4, real On Update subsystem)** - see its own section below. All 4 were
listed here through M16; they're the opcode-audit gaps this doc has actually closed rather than
just documented.

## Engine Fields (v4, `appData/src/snes/engine.json`)

Not a scripting event - a Settings-page mechanism (`useGroupedEngineFields.ts`/
`EngineFieldsEditor.tsx`, one `SearchableCard` per genre group), matching GB Studio 3.2.1's own
Engine Fields exactly in UI shape. **Real root cause found (user-found: "les engine fields ne
sont pas modifiables dans settings" - no Scroll Speed for Shoot Em Up, unlike B)**: the entire
UI chain (Settings page, the editor component, Redux state, per-project persistence, the
script-event side) already existed and worked - `appData/src/snes/engine.json` itself existed
too, but as `{"version": "2.0.0-e1", "fields": []}`, an empty catalog nobody had ever populated.
Nothing was broken; there was just nothing to show.

Populated with the 12 fields that have a real backing global on this engine, values copied
verbatim from GB Studio 3.2.1's own `engine.json` (min/max/defaultValue) where a like-for-like
global already existed:
- **Top Down**: `topdown_grid` (8/16px movement grid) - was already a real (if hardcoded) global.
- **Platformer**: the 10 fixed-point physics constants (`plat_min_vel` … `plat_max_fall_vel`) -
  were already real (`static`) globals in `scene.c` with the exact same default values as B's own
  schema (same 1/16px position, 1/4096px/frame velocity fixed-point scale as GB's `Platform.c`) -
  just de-`static`'d so a generated definition elsewhere can supply the real value.
- **Shoot Em Up**: `shooter_scroll_speed` - **a genuine engine fix, not just a Settings wire-up**.
  This target's own `Update_Shmup` had no independent scroll-speed concept at all; its forced
  auto-scroll just reused the player actor's own `move_speed`, conflating two things B keeps
  separate (`shooter_scroll_speed` drives the auto-scroll; `PLAYER.move_speed` only drives the
  player's own perpendicular dodge steering). Introduced as a real, separate global; the
  auto-scroll advance now uses it, the perpendicular advance still uses `move_speed`, matching
  B's real split exactly. Default `1` (this engine's own whole-pixel-per-frame movement scale,
  not B's larger fixed-point one - chosen to match this target's previous *effective* default
  speed, not B's raw number).
  **v4 follow-up (user-found: "scrolling is really slow" in a real Shmup scene).** The original
  default (`1`) and max (`8`) were ported from B's own `engine.json` unchanged, on the mistaken
  assumption the two engines share units. They don't: B's `shooter_scroll_speed` feeds
  `point_translate_dir()` against `PLAYER.pos`, which B stores in 16.4 fixed-point (16 units = 1
  real pixel) - B's default of `16` is actually 1px/frame. This engine's `actors[].x/y` are plain
  whole pixels (no fixed-point anywhere in this port) and `Update_Shmup` adds
  `shooter_scroll_speed` to `x`/`y` directly - so the ported default of `1` really was only
  1 whole pixel/frame (60px/s), genuinely too slow for a forced-scroll shooter. A first fix
  mechanically copied B's raw number (`16`) into this field without re-deriving the unit
  conversion - tried and reverted once the mismatch was found (16 whole pixels/frame is
  960px/s, wildly too fast). Landed on `2` (~120px/s, max raised to `8`) as a modest, reasoned
  correction, not a B-matching one - a feel/pacing call verified only by reading WRAM in Mesen
  (no rendered output in this environment), not by eye; revisit if `2` still isn't right.
  Verified in Mesen: `Update_Shmup` runs at a true 1:1 per-real-frame rate against a
  normally-sized background (ruling out a hidden half-rate cause), and each call that scrolls
  now adds exactly 2 whole pixels.

`fade_style` (white/black fade direction) - `fade.c` has no such option at all currently.

`plat_climb_vel` (ladder climb speed, same 1/4096px/frame scale as the other `plat_*` fields) -
real, see "Ladders / one-way platforms" below.

**Button remapping (v4 follow-up) — `INPUT_PLATFORM_JUMP`/`RUN`/`INTERACT`,
`INPUT_TOPDOWN_INTERACT`.** Real now, matching GB Studio's own `cType: "define"` fields exactly
(a compile-time `#define`, not a runtime-readable byte - `compileEngineFields()` skips them,
`precompileEngineFields()`/`EngineFieldSelect.tsx` do too, so Engine Field: Set/Store can't
target one, same as upstream). `compileSnesData.js`'s new `compileInputDefines()` writes the
project's chosen button (a real SNES `KEY_*` macro name, e.g. `KEY_X` - not GB's `INPUT_A`/
`INPUT_B` names) straight into a generated `src/input_defines.h`, included by `scene.c` before
`Update_Platform`/`Update_TopDown`; the 6 previously-hardcoded `joy & KEY_A`/`KEY_B` call sites
now read `joy & INPUT_PLATFORM_JUMP` etc. Defaults (`KEY_B` jump, `KEY_A` run/interact both
genres) exactly reproduce the old hardcoded buttons, so an untouched project sees zero behaviour
change. `gen-dummy-gfx.js` generates the same header for the committed dummy/eject build.
Verified in Mesen: a project remapped to `KEY_X` ignores `B` entirely and jumps on `X`.

**Ladders / one-way platforms (v4 follow-up, Update_Platform only).** The editor's own
`BrushToolbar.js` has always let a project paint per-tile `COLLISION_TOP`/`BOTTOM`/`LEFT`/
`RIGHT` and a ladder flag (`TILE_PROP_LADDER`, inherited from GB Studio) - but `col_solid()`/
`scene_col[]` are a flat 1-bit-per-tile bitmap ("was the authored byte nonzero at all"), so a
painted one-way platform or ladder silently behaved as a fully-solid wall. `Update_Platform` now
gets a second, optional per-tile byte table (`scene_col_dir`/`platform_has_col_dir`, scene.c) -
most scenes paint only plain solid/empty tiles and skip it entirely, zero cost. A tile only
blocks sideways/vertical entry from the side it was actually painted to (`COLLISION_TOP` alone =
the classic "jump up through, stand on top" platform); a ladder tile lets the player climb with
Up/Down and walk off sideways. Slopes (GB's own `COLLISION_SLOPE_*`, upper nibble) are **not**
part of this - those bits were already repurposed for `TILE_PROP_PRIORITY` on this fork (see
`consts.js`), a deliberate earlier decision this doesn't revisit.

Real bug found and fixed via Mesen A/B during verification (not just documented as a limitation):
a one-way platform's `COLLISION_TOP` check used only the *current* tile row and `plat_vel_y`'s
sign, so a jump whose apex happened to land inside (or just past) the platform's own row, on the
exact frame gravity flips `plat_vel_y` non-negative, got caught as if landing on it - even though
the player arrived from *below*, never fell onto it from above. Fixed by also checking the
player's position *before* that frame's own Y movement (`old_py`) - only a player who was at or
above the tile's top edge last frame can be landing on it now. Verified in Mesen three ways: a
jump through the platform now matches a no-platform negative control's own unobstructed apex
exactly (previously it snapped short, caught by the bug); the same jump still correctly settles
back onto the real floor below when it doesn't clear the platform; and a plain fall from genuinely
above the platform (no jump, gravity only) still lands exactly on its top edge rather than falling
through. Ladder climbing verified separately: climbs up at `plat_climb_vel`, stops naturally at
the top of a ladder's own tile run, climbs back down, and correctly exits onto solid ground below
it.

**Mechanism (compile-time default)**: GB Studio 3.x's real engine writes a chosen value into
these globals at boot, via a GBVM assembly routine generated from the schema
(`compileBootstrap.ts`'s `_script_engine_init`). This engine has no such VM injection point (no
GBVM - see the On Update section above for why), so `compileSnesData.js`'s `compileEngineFields()`
bakes the chosen value straight into a generated `src/engine_fields.c` initializer instead - see
"Runtime writes" just below for the storage layout this now implies.

**Verified (compile-time default)**: full test suite green, a real toolchain build compiles/links
`engine_fields.c` cleanly. A real Mesen run (a throwaway fixture with `engineFieldValues:
[{shooter_scroll_speed: 5}, {topdown_grid: 16}]`, no d-pad input needed) read both fields back
from real WRAM as `16` and `5` - the project's own chosen values, not the schema's `8`/`1`
defaults - confirming the whole pipeline (Settings value → `compileEngineFields` →
`engine_fields.c` → linked into the ROM → real runtime value) end to end.

**Runtime writes (v4 follow-up, shipped) — Engine Field: Set / Store.** A script can now both
write an Engine Field at runtime (`EVENT_ENGINE_FIELD_SET`, literal or from a variable) and read
one into a variable (`EVENT_ENGINE_FIELD_STORE`) - the last item on this doc's "Not yet
implemented" list. Both event files (`eventEngineFieldSet.js`/`eventEngineFieldStore.js`) and
`scriptBuilder.js`'s `engineFieldSetToValue`/`engineFieldSetToVariable`/
`engineFieldStoreInVariable` helpers already existed unchanged from the original GB-era port,
emitting a valid wire format against 6 already-scaffolded opcodes
(`ENGINE_FIELD_UPDATE(_WORD)`/`_VAR(_WORD)`, `ENGINE_FIELD_STORE(_WORD)`) - only the SNES C
engine (still `Script_Noop_b`) and one missing compiler wire (below) were ever missing, the same
"compiler half already built" shape as several other v4 milestones this session.

Storage changed from one named C global per field to a single little-endian byte array,
`engine_fields_raw[]` (`engine_fields.h`/`.c`) - a runtime opcode addresses a field by the same
byte offset the compiler already computes (`src/lib/helpers/engineFields.ts`'s
`precompileEngineFields()`, cumulative byte size in `engine.json`'s own field order), which a
named-global-per-field scheme has no way to expose. `engine_fields.h`'s macros
(`#define topdown_grid (engine_fields_raw[0])`, `#define plat_min_vel (*(s16 *)&engine_fields_raw
[1])`, …) keep every existing consumer (`scene.c`'s `Update_TopDown`/`Update_Platform`/
`Update_Shmup`) reading/writing the plain field name unchanged - only the header's definition of
that name changed, no call site did. Offsets are guarded against `engine.json` drifting out of
sync by `test/helpers/engineFieldsOffsets.test.js`.

**Real gap found while implementing, not assumed fixed**: `compileSnesData.js` never actually
built the `options.engineFields` map (`{offset, field}` per key) that `scriptBuilder.js`'s three
helpers require - the "compiler half already built" framing above was only true for the
*event files and ScriptBuilder helpers*, not the options wiring one level up. Compiling any
project using either event threw a plain `TypeError` (`Cannot read properties of undefined`)
until this was added (`compileSnesData.js` now passes `engineFields: precompileEngineFields
(getEngineFieldsSchema())` into `compileEntityEvents`'s options) - caught by actually building a
fixture ROM, not by reading the source alone.

**Verified (runtime writes)**: full test suite green, byte-exact `scriptBuilder.test.js` cases
for all 6 opcodes (literal/variable × byte/word, both Set and Store, including the hi/lo
variable-pair byte order - Set pushes hi then lo, Store pushes lo then hi, matched exactly). A
real Mesen run (throwaway fixture: seed a variable to 42, `ENGINE_FIELD_SET` a byte field to a
literal, a different byte field from that variable, a word field to a literal, then
`ENGINE_FIELD_STORE` the first field back into a second variable) read `engine_fields_raw[]`
back from real WRAM with every value exactly as scripted (byte literal, byte-from-variable, word
literal all correct at their real byte offsets) and the Store variable read back the same value
the Set had written two events earlier - confirms the full runtime round-trip, not just that it
compiles.

## On Update (v4, `appData/src/snes/src/update_script.c`)

| Event | SNES | Notes |
| --- | --- | --- |
| Actor: Start "On Update" Script, Actor: Stop "On Update" Script | ⚠️ | Real, but a scoped-down design, not a literal port - see below. |

`Actor.updateScript` (the "On Update" tab `ActorEditor.tsx` already had, carried over from GB -
only the SNES compiler/engine side was missing) is a persistent, per-actor background script.
GB Studio 3.x's real engine runs it as a genuine concurrent GBVM thread (up to 16 script
contexts, round-robin scheduled every frame, independent of whatever the foreground script is
doing) - this engine has exactly one bytecode VM (`script_ptr` and friends in
`script_runner.c`), so a literal port would mean rewriting the VM core into a real multi-context
scheduler, the same class of change as adopting GBVM itself (excluded from this whole roadmap).

Scoped design instead: a small fixed pool (`MAX_UPDATE_CONTEXTS` - originally 4, raised to 16
in a later v4 pass to match GB Studio's own `VM_MAX_CONTEXTS`) of saved VM states
(pointer/call-stack/actor/wait-timer), each **independent of the foreground `script_ptr`** -
critically, not the same global `SceneHandleInput()` checks to decide whether the player can
move or interact. `UpdateScriptsProcess()` (called once per frame from `SceneUpdate`) gives
every active context a turn by swapping its saved state into the shared globals the opcode
dispatch table already operates on, letting `ScriptRunnerUpdate()` run its natural burst, then
saving the (possibly still mid-`Wait`) state back out - the foreground's own live state is saved
before the first swap and restored after the last, so none of this is ever visible to, or
blocked by, the foreground script.

**A real, non-obvious risk found and fixed before writing any of this**: a first design
("`run_script()` the update script whenever the shared `script_ptr` happens to be idle, sharing
the foreground's own state") was proposed, user-approved, and then found to be broken on closer
inspection *before implementation* - GB Studio's own idiomatic authoring pattern for an ambient
On Update script is `Loop Forever { Wait N; ...}`, which never naturally terminates. Sharing
`script_ptr` with the foreground means that loop would occupy it **permanently** once started -
and `SceneHandleInput()` (player movement/A-press) already refuses to run at all while
`script_ptr` is non-zero (existing, intentional behaviour, e.g. during a dialogue). So the naive
design would have **permanently frozen the player** the moment any actor's On Update script
started - not a reduced-richness simplification, an outright regression on the most common
authoring pattern the feature exists for. Flagged to the user before implementing (a second
`AskUserQuestion` round, after the first had already approved the simpler design); user approved
the corrected, separate-context design instead.

Real, documented limitations of this scoped version vs GB Studio 3.x (see
`update_script.h`'s own design note for the full detail):
- Only `MAX_UPDATE_CONTEXTS` (16) actors can have a running update script at once *per scene* -
  a fixed cap, same class as `SPRITE_SLOTS`/`MAX_PROJECTILES`/the 4 timer contexts elsewhere in
  this engine (raised from an original 4 - see the "On Update" entry in `CLAUDE.md`'s own
  history for why). A scene needing more just doesn't run the extras' update scripts (silent,
  like every other pool-exhaustion cap in this engine).
- An update script's own blocking opcodes get a private `Wait` timer *and* (v4 follow-up, see
  below) a private `Move To`/`Move Relative` destination - `Camera Shake`/`Await Input` are the
  two still left reading/writing the *foreground's* shared `shake_time`/`await_input`, so using
  either inside an On Update script has undefined/shared behaviour. Not a realistic authoring
  pattern for a background ambient script, so not solved here.
- Turns are round-robined one context at a time per frame in pool-slot order, not truly
  simultaneous - fine for the intended use (ambient/idle behaviour, simple per-actor AI), not a
  general-purpose thread.
- Auto-launch matches GB Studio 3.x's real `activate_actor()` (every scene-resident actor's
  update script starts automatically on scene load; Activate/Deactivate Actor re-launch/
  terminate it), but a naturally-*completed* update script does **not** auto-relaunch on its own
  (matches B) - `Loop Forever` is how an author keeps one running, same as on B.

**Verified**: `scriptBuilder.test.js` unchanged pattern reused for `actorStopUpdate`; full
toolchain build (816-tcc/816-opt/wla-65816/wlalink) compiles and links `update_script.c`/
`script_cmds.c`/`scene.c` cleanly. **Real Mesen run** (a throwaway fixture actor with
`updateScript = [Wait 0.2s, Inc var0] × 3`, no d-pad input needed): `var0` read back `0 → 1 → 2
→ 3` across the run, proving the saved context correctly resumes across many separate frames
(pointer/call-stack/wait-timer save-restore is correct); the **foreground** `script_ptr` read
`0,0,0` on every single sampled frame throughout, confirming the core fix - the update script's
execution never touches the global that would otherwise freeze the player.

**`Move To`/`Move Relative` inside an On Update script could permanently freeze the whole scene
(v4 fix, user-found: a real Shoot Em Up scene where 15 enemies' own On Update scripts each did
a bob/weave `Move Relative` - "I still can't move [...], it is still slow").** The design note
above already flagged Camera Shake/Await Input as unsafe to use inside an On Update script for
sharing a global with the foreground - missed that `ACTOR_MOVE_TO`/`ACTOR_MOVE_RELATIVE` have
the identical hazard: `BEGIN_MOVE` (`script_cmds.c`) writes `actor_move_dest_x/y` and
`actor_move_settings`, neither swapped per-context. The moment any context's own blocking move
ran, it silently overwrote whichever move the foreground (or another context) already had in
flight - confirmed in Mesen: the foreground's own scene-init `Move Relative` on the player had
its destination (a sane `40`) replaced by an enemy's own On Update move (`696`) mid-flight, so
the arrival check never fired again, `script_action_complete` never came back, and the scene's
own init script - gating everything downstream, including real player control - hung forever.
Fixed for real (not just documented as a limitation, since "something bobs/patrols on its own"
is an extremely natural On Update use): `UPDATE_CTX` gained its own `move_settings`/
`move_dest_x`/`move_dest_y`, swapped in/out exactly like `wait_time`; the foreground's own
copies are saved/restored around the whole per-context loop the same way `fg_wait_time` already
is. The arrival-check logic itself (previously inline in `SceneUpdateActors`) is now a shared
`u8 ActorMoveAim(void)` (`scene.c`/`scene.h`), called once for the foreground (unchanged) and
once per active context right after `ScriptRunnerUpdate()` runs its turn. Verified against the
real project: the foreground's `actor_move_dest_x` stays `40`, its `script_ptr` now reaches
`0,0,0` within the expected window instead of never, and `Update_Shmup` runs for real
afterward. **Known remaining gap** (not hit by this project, not fixed): the stepping loop's
"a hidden actor can still finish *its own* commanded move" exception only covers the
foreground's `script_actor`, not a per-context mover - an On Update script that hides then
moves its own actor would still hit the older "Hide then Move Relative" bug class for that
narrower case. The separate, non-engine half of this bug report - 15 `Call Custom Event` call
sites never binding the "Enemy Ship" actor parameter, so each one's body fell back to actor
index 0 (the player) via the same `findIndex()+1→0` convention that resolves `$self$` - is a
project-authoring fix, not an engine one.

**Actor: Set Sprite Sheet, If Actor Relative to Actor, Actor: Set Animate shipped (v4).** All 3
were listed here through this point as needing the `On Update` per-actor script port - re-checked
while actually scoping that port and found none of them really do:
- **Actor: Set Sprite Sheet** (the general-actor sibling of the already-shipped Player: Set Sprite
  Sheet) was a Noop with a **broken wire format** inherited from the original port -
  `scriptBuilder.js`'s `actorSetSprite()` resolved via `getSpriteOffset()`/`scene.sprites`, a
  GB-only field that's never populated on the SNES compile path (the same root cause as the
  Projectiles `getSpriteSceneIndex` bug fixed earlier this session's M4) - always compiled a dead
  offset of 0 regardless of what was authored. Rewritten to emit the same `ARG16` project-sprite-
  index format Player: Set Sprite Sheet already uses; the engine resolves it via the identical
  `sprite_slot_for_index[]` pre-loaded-slot lookup, just applied to `script_actor` instead of the
  hardcoded player slot - shares that event's own real behaviour and its own documented
  limitation (only a sheet already used somewhere in the scene can be switched to). Both now-dead
  helpers (`getSpriteOffset`, and the already-orphaned `getSpriteSceneIndex` left over from the
  Projectiles fix) removed from `src/lib/events/helpers.js`.
- **If Actor Relative to Actor** is a plain position compare between the active actor and a second
  actor slot (up/down/left/right, strict pixel comparison) - a self-contained dedicated opcode
  with the same true/false jump-target shape every other `IF_*` opcode already uses (see If Actor
  At Position). No relation to On Update at all.
- **Actor: Set Animate** is a plain field setter (`actors[script_actor].animate`) - the same flag
  `SceneAnimateActors` already reads at compile time from a sprite sheet's own "Animate Frames"
  checkbox, just exposed as a runtime toggle. No relation to On Update either.

All 3 were simply mislabeled in the original M16 audit pass, not actually blocked - found by
reading what each one's `compile()`/`scriptBuilder.js` helper really does before assuming the
audit's grouping was correct, the same "verify against the real code" discipline this session has
applied everywhere else. Tests: `scriptBuilder.test.js` (byte-exact for all 3), full toolchain
build confirms `script_cmds.c` still compiles/links.

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
