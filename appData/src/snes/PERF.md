# SNES target — performance profile (M11)

Measured 2026-09-05 in **Mesen 2** (cycle-accurate) against real project ROMs built through the
normal pipeline. Method notes at the bottom.

**TL;DR** — ROM, WRAM, VRAM and ARAM all have comfortable headroom. The one soft spot is **CPU
time per frame**: a typical scene holds a locked 60 fps, but a scene with more than ~5–6
*simultaneously moving* actors starts dropping the odd frame (graceful — ~54 fps, not 30). That
ceiling is a property of the `816-tcc` toolchain (a small non-optimising C compiler), not a bug.

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
**ROM is not a constraint.**

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

### Not done — future work

- Hand-optimising the render / actor-update hot path (or the parts of it that `816-opt` leaves
  fat) in 65816 asm. High effort, real regression risk across every scene feature, and low
  confidence it's worth it — deliberately deferred rather than rushed.
- **Practical guidance until then:** on the SNES target, a scene with more than ~5–6
  simultaneously *moving* actors may drop frames. Static NPCs, dialogue, camera work, music and
  large backgrounds are all fine.

---

## Method

- ROM/RAM: `buildTools/win32-x64/pvsneslib/devkitsnes/tools/snesromusage.exe -r lorom -g -i game.sym`.
- VRAM: read straight from the engine's `#define`d layout (`game.c`, `ui.c`, `targets/snes.js`).
- CPU: Mesen Lua — `emu.eventType.endFrame` to count PPU frames, `emu.read(0x2CB7,
  emu.memType.snesWorkRam)` for the `time` tick (address from `game.sym`, re-grep every build),
  `emu.setInput({...}, 0)` to keep the player moving. Frame-cost breakdown via
  `emu.addMemoryCallback(fn, emu.callbackType.exec, <SceneUpdate addr>)` + `emu.getState()
  ["ppu.scanline"]` at the `SceneUpdate` and `spcProcess` entry points.
