# SNES target — performance profile (M11)

Measured 2026-09-05 in **Mesen 2** (cycle-accurate) against real project ROMs built through the
normal pipeline. Method notes at the bottom. **Re-checked 2026-09-19** (see "2026-09-19
re-profile" below) after a whole v4 milestone's worth of new engine code (RPN evaluator, bulk
event port, Font/Emote entities, HDMA parallax, priority tiles, per-scene player sprite, and a
real Projectiles subsystem) - ROM headroom has genuinely shrunk a lot; CPU has not regressed.

**TL;DR** — WRAM, VRAM and ARAM still have comfortable headroom. **ROM headroom is now the real
soft spot** (see below - a full sample project sits at 97% of its default 8-bank allocation,
down from the ~77% this doc originally measured against a smaller stress fixture), and **CPU
time per frame** is still the other one: a typical scene holds a locked 60 fps, but a scene with
more than ~5–6 *simultaneously moving* actors starts dropping the odd frame (graceful — ~54 fps,
not 30). That ceiling is a property of the `816-tcc` toolchain (a small non-optimising C
compiler), not a bug. 2026-09-11: found and fixed a real O(N²) spike in the movement/collision
path (an actor-count scan that could run once per actor on the very frame several actors' AI
ticks coincided) - see "Done" below. The underlying `816-tcc`-is-slow ceiling itself is
unchanged.

---

## ROM

`snesromusage` on a 9-actor / 32×32-scene / music stress ROM:

| Bank | Contents | Used |
| --- | --- | --- |
| $00 | crt0 + PVSnesLib runtime + snesmod SPC driver blob (~7 KB) + `.rodata` + initialised globals | **100 %** (91 B free) |
| $01 | more engine code (`scene.c`, `ui.c`, …) + `libc` bits | **100 %** (1 B free) |
| $02 | generated game data (scene blobs, scripts, BG tiles/maps) | 20 % |
| $05 | soundbank, chunk 0 | 86 % demo bank / 100 % with one converted project `.mod` |
| $06 | soundbank, chunk 1 (only when the soundbank is > 32 KB — a project song usually pushes it there) | ~78 % (1 converted `.mod` + effects ≈ 57 KB total) |
| $03 $04 $07 | *empty* | 0 % |

The ROM is padded to the 8-bank (256 KB) minimum; ~77 % of the used banks is occupied
(demo soundbank) rising to ~5 of 8 banks with one project song. A soundbank needing more than
banks $05–$07 gets a build warning (`compileSnesMusic.js`).
Banks $00/$01 read as "full" only because `wla` packs `SUPERFREE` sections tightly — new engine
code spills into the empty banks automatically, and the ROM can grow to 128 banks (4 MB).
**ROM is not a constraint.** *(2026-09-19: this "not a constraint" verdict is now stale - see
below. Still true that it's elastic, not a hard wall - just much less headroom than this table
suggests today.)*

## WRAM

14 % of the 128 KB main work RAM; 6 % of the 8 KB fast LowRAM (`$7E:0000–1FFF`). The largest
consumers are snesmod's own driver state and the initialised-globals block. **Not a constraint.**

## VRAM (64 KB / 32 K words)

Fixed engine layout:

| Words | Region | Size |
| --- | --- | --- |
| `0x0000–0x0FFF` | BG1 tilemap | 4 KW (all of it for an `SC_64x64` scene; 1 KW for `SC_32x32`) |
| `0x1000–0x13FF` | BG3 UI tilemap | 1 KW |
| `0x2000–0x2FFF` | BG1 tileset | 4 KW → **256-tile cap** (`targets/snes.js` `maxTilesetTiles`) |
| `0x3000–~0x3307` | BG3 font | ~0.8 KW |
| `0x4000–0x4FFF` | OBJ tiles (the 256-tile sheet: actor direction + walk-cycle frames, emotes, avatars — fills the whole first OBJ name page) | 4 KW |

High-water ≈ `0x5000` ≈ **62 %** of VRAM, with large unused gaps. Two things sit at their
ceiling: the **256-tile BG tileset budget** (a 32×32 scene whose art doesn't de-duplicate below
256 unique tiles gets a compiler warning) and the **256-tile OBJ sheet** (the first name page is
full after walk-cycle frames were added — more OBJ tiles would need the 2nd page).

## ARAM (SPC700, 64 KB)

Managed by snesmod: one music module resident at a time, ~58 KB cap (PVSnesLib's own figure).
Each song is streamed from ROM on `MUSIC_PLAY`, so what has to fit ARAM is one song's samples,
not the whole soundbank — `smconv` reports per-module ARAM use at build time. The soundbank as a
whole sits in ROM (banks 5+, ~2 banks for one converted `.mod`). The built-in BRR sound effects
reserve a fixed **2 KB** region (`spcAllocateSoundRegion(8)` in `music.c`) for the effect
stream, carved out at boot and independent of the music module — a small, constant cost.

## CPU — the frame budget

Measured by comparing the engine's main-loop tick counter (`time`, incremented once per
iteration) against elapsed PPU frames over ~15 s runs, with the player walked around by a Lua
script to keep movement / collision / camera hot. Ratio `1.00` = locked 60 fps; `0.90` ≈ 54 fps.

| Scene | Ratio | |
| --- | --- | --- |
| Typical: ≤ 5 actors, ≤ 20×18 background, music playing | **1.00** | locked 60 fps |
| 9 actors **static**, 32×32 background, music | **1.00** | rendering 9 sprites + a big scene + music, on their own, cost nothing measurable |
| 9 actors **random-walk**, 32×32 background, music | **0.91** | ~54 fps |
| …same, music removed | 0.90 | `spcProcess()` (per-frame SPC streaming) costs ~nothing |

So the ~10 % slowdown is **entirely the per-frame AI + tile-locked-movement + collision path**
for actors with a non-`static` movement type. It degrades gracefully — the odd dropped frame,
never a halving to 30 fps.

Deeper: even the *static* 9-actor scene already spends **~175 of the 224 active-display
scanlines** (~75 % of the frame's CPU budget) inside `SceneUpdate` + `UIUpdate` + `CameraUpdate`.
The headroom is only moderate because `816-tcc` emits slow code — no register allocation, a
software-stack calling convention; the `816-opt` peephole pass helps but it's still several
times heavier than hand asm or SDCC. A demanding scene therefore doesn't have much room before
it tips over one frame.

### Done

- `SceneRenderActors` now walks only the *used* OAM slots each frame (`SceneInit` hides the rest
  once) instead of iterating all 9 unconditionally. Helps every scene with fewer than 9 actors
  (i.e. all realistic ones); free; verified no regression (Mesen OAM dump — right sprites shown,
  unused slots parked at `y=240`).
- **Movement/collision hot-path cleanup (still plain C, no asm).** The ~10 % slowdown above traced
  to `npc_blocking()` - an O(actor count) scan run by *every* actor that attempts a step - being
  called by potentially every actor on the *same* frame: `SceneUpdateAi()` gated all actors on one
  shared `(time & 0x3F) == 0` tick, so an AI-tick frame could trigger up to N calls to
  `npc_blocking()`, each itself O(N) - an O(N²) spike concentrated on exactly the frames that could
  drop. Three fixes, all mechanical/low-risk:
  1. `actor_try_move()` now computes the destination tile (`tx, ty`) **once** and passes it to both
     `npc_blocking()` and `can_step()`, instead of each independently re-deriving it via
     `SceneActorTileX/Y()` - two redundant function calls per move attempt removed (816-tcc does no
     CSE, so every one of those was a real call with software-stack overhead).
  2. `npc_blocking()`'s inner scan inlines `SceneActorTileX/Y(j)` (`(actors[j].x - 8) >> 3` etc.)
     instead of calling them - up to `2*(N-1)` call eliminations per invocation.
  3. `SceneUpdateAi()` now stripes actors by index parity across the 64-frame ticks (odd indices on
     `time == 0/128`, even on `64/192`) instead of touching every actor on every tick - **porting
     the GB engine's own already-shipped design** (`Scene_b.c` does exactly this striping; the SNES
     port had never replicated it, so it was touching every actor twice as often as GB *and* with
     no spread). Each actor's own AI decision cadence is now every 128 frames, matching GB exactly,
     and no two actors' `npc_blocking()` scans ever land on the same frame.

  No behaviour change to collision itself (same `tx`/`ty` arithmetic, just not recomputed) and no
  new opcodes/fields. Verified: `buildSnesRom.js`/`compileSnesData.js` fixture suite still compiles
  and links; a Mesen run of the retargeted sample (spawned directly in Outside) confirmed the
  player still walks and collides normally in all four directions and the scene's one `randomWalk`
  actor still moves over time (its position changed between two WRAM snapshots ~400 frames apart).
- **`OVERLAY_MOVE_TO` slide (user-found: "le slide... est très lent et pas très joli").**
  `ui_update_overlay()` (`ui.c`) advances the BG3 curtain one tile row per tick but was doing so by
  calling `ui_overlay_fill_from()` - rewriting **all 32 rows** of the BG3 tilemap (1024 WRAM writes
  in 816-tcc-generated C) and forcing a full 2 KB VRAM DMA on *every single tick*, even though at
  most one row's fill state actually changes per step. Replaced with `ui_overlay_step(old_row,
  new_row)`: touches only the row(s) that actually changed (almost always exactly 1, up to ~5 at
  the one hidden/visible boundary crossing) and `UIFlush()` DMAs only that narrow range. No
  behaviour/timing change (same tick cadence, same final content - see below), ~32× fewer WRAM
  writes on a typical tick. Verified in Mesen (WRAM + real VRAM, not just the write-side buffer):
  every row settles to the intended content one frame after its transition, including the
  hidden-boundary crossing this exists to get right (rows 28-31 all confirmed blank in VRAM, not
  just WRAM - the original "stray dark line" bug this design predates was not reintroduced). Also
  *directly observed* the CPU-budget tightness this file already documents: a couple of ticks were
  caught by the Lua script mid-write (columns 0-8 of a row already rewritten, 9-31 still holding
  the old value, settled correctly by the very next frame) - i.e. even a ~32-write tick can
  occasionally straddle a frame boundary on this build, consistent with "a typical scene already
  spends ~75% of its budget" above. Doesn't fix the coarseness (still 8px/tick, not a smooth
  pixel-by-pixel wipe like the GB engine's hardware window-Y scroll) - that would need driving the
  curtain via a real BG3 vscroll register, deferred (BG3 is shared with the dialogue/menu box,
  which would need to compensate its own draw position to stay fixed on screen while the curtain
  scrolls - a bigger, riskier change than this mechanical one).

### 2026-09-19 re-profile

Same two methods as above (`snesromusage`, and the `time`-vs-PPU-frame ratio), run against a
different and more representative ROM than the original 2026-09-05 measurement: the **`sneshtml`
sample project** (8 real scenes, real backgrounds/sprites/music) built through the normal
pipeline, rather than a synthetic "9-actor stress" fixture - and against today's engine, after a
whole v4 milestone's worth of new code landed since (RPN evaluator, bulk event port, Font/Emote
entities, HDMA parallax, priority tiles, per-scene player sprite override, a real Projectiles
subsystem with its own new per-frame `ProjectilesUpdate()` call). Prompted by the user, right
after Projectiles shipped, specifically to check whether that much new code had eaten into the
headroom this doc promised.

**ROM: genuinely tighter now, still not a hard wall.** `snesromusage -r lorom -g -i game.sym`:

| Bank | Used | Free |
| --- | --- | --- |
| $00 – $05 | **100%** each | 75, 0, 0, 0, 0, 0 bytes |
| $06 | 79% | 6854 B (21%) |
| **Total (7 banks)** | **97%** | **6929 B (3%)** |

Six banks fully packed (vs. two in the original measurement) and only ~6.9 KB free across the
whole ROM - a real, substantial drop from the ~77%-used figure this doc originally reported,
because this is a much bigger real project *and* a lot of new engine/compiler code has landed
since. Still genuinely elastic, not a hard ceiling: the build log already shows `OBTAIN_ROMBANKS:
Using the biggest selected amount of ROM banks (8)` - i.e. `settings.snesRomBanks` (Settings >
SNES Options) is what actually caps this, and it can go up to 128 banks (4 MB) same as before.
**Practical guidance**: a project that's this close to its currently-configured bank count and
hits a real "doesn't fit" build error should just raise `snesRomBanks` in Settings - not a code
fix, an author-facing setting already in place for exactly this.

**CPU: no regression.** `time` turned out to be a `u8` (wraps mod 256, not `u16` as first
assumed when this check was set up - re-derived correctly after the first attempt's numbers came
out nonsensically low, a measurement bug on this session's part, not an engine one). Corrected
measurement: **777 engine ticks / 780 PPU frames = 0.9962** (essentially locked 60 fps) over a
~13 s window spanning several of the sample's real scenes with the player idle (no simulated
movement - the same Mesen input-simulation gap this doc's own Method section already worked
around by walking the player via script for the original 2026-09-05 numbers is still unfixed
this session, see memory `gbsnes-v2-migration`). This *does* confirm the new unconditional
per-frame `ProjectilesUpdate()` call (added for v4's Projectiles subsystem - it scans
`MAX_PROJECTILES(4)` pool slots every frame regardless of how many are actually active) costs
nothing measurable at idle. It does **not** by itself re-confirm the ~90% (moving-actor) or
~54 fps (heavy collision) numbers further down this doc, which specifically need real movement
to exercise - those numbers are carried forward unchanged, not re-verified this pass.

### Not done — future work

- Hand-optimising the render / actor-update hot path (or the parts of it that `816-opt` leaves
  fat) in 65816 asm. High effort, real regression risk across every scene feature, and low
  confidence it's worth it — deliberately deferred rather than rushed.
- Re-measuring the exact fps ratio after the movement/collision cleanup above (same Mesen Lua
  method as the table above) — expected to help most on a frame where several actors' AI ticks
  used to coincide, but not re-profiled with numbers yet.
- **Practical guidance until then:** on the SNES target, a scene with more than ~5–6
  simultaneously *moving* actors may still drop the odd frame. Static NPCs, dialogue, camera work,
  music and large backgrounds are all fine.

---

## Method

- ROM/RAM: `buildTools/win32-x64/pvsneslib/devkitsnes/tools/snesromusage.exe -r lorom -g -i game.sym`.
- VRAM: read straight from the engine's `#define`d layout (`game.c`, `ui.c`, `targets/snes.js`).
- CPU: Mesen Lua — `emu.eventType.endFrame` to count PPU frames, `emu.read(0x2CB7,
  emu.memType.snesWorkRam)` for the `time` tick (address from `game.sym`, re-grep every build),
  `emu.setInput({...}, 0)` to keep the player moving. Frame-cost breakdown via
  `emu.addMemoryCallback(fn, emu.callbackType.exec, <SceneUpdate addr>)` + `emu.getState()
  ["ppu.scanline"]` at the `SceneUpdate` and `spcProcess` entry points.
