# SNES web player (M10)

Used by the "Play" button / web export for `settings.target === "snes"` projects, the same way
`appData/js-emulator` (GameBoy-Online) serves the Game Boy target.

## Vendored (unmodified, MIT) from [angelo-wf/SnesJs](https://github.com/angelo-wf/SnesJs)

- `snes/apu.js`, `snes/cart.js`, `snes/cpu.js`, `snes/dsp.js`, `snes/pipu.js`, `snes/snes.js`,
  `snes/spc.js` - the actual emulation core (65816 CPU, PPU, SPC700 + DSP audio). LoROM only,
  which matches this project's own SNES build (`buildSnesRom.js`, D3: LoROM + FastROM).
- `js/audio.js` - `AudioHandler`, a small Web Audio wrapper the core calls into for samples.
- `LICENSE.txt` - SnesJs's own MIT license text, required by the license to travel with the code.

Not vendored (present in the upstream repo but not needed here): `js/main.js`, `js/trace.js`,
`js/spcmain.js`, `js/spcp.js` (upstream's own file-input UI + debug trace/SPC-player tools) and
`lib/deflate.js`/`lib/inflate.js`/`lib/zip.js` (loading `.zip`-wrapped ROMs from a file picker) -
none of that applies here, since the build always produces a plain `.sfc` fetched by URL.

## SNES Studio-authored

- `index.html` / `css/style.css` - the page shell. `buildProject.js` string-replaces
  `___PROJECT_NAME___` / `___AUTHOR___` / `___PROJECT_HEAD___` / `___CUSTOM_CONTROLS___`, the
  same placeholder convention as the GB template's `index.html`. The shell is a dark centred
  frame with:
  - a **start gate** overlay ("Play" button) - the emulator boots and renders one frame but
    doesn't run until the player clicks, which also satisfies the browser autoplay policy so
    audio works on touch-only devices (the old version never resumed audio without a keypress);
  - an **on-screen touch pad** (d-pad + A/B + Start/Select), shown automatically on coarse
    pointers and toggleable from the toolbar. Multi-touch via per-pointer tracking +
    `setPointerCapture`, so you can hold a direction and press a face button at once. X/Y/L/R
    are keyboard-only (fixed to `u`/`i`/`o`/`p`);
  - a toolbar: pause/resume, soft reset, pad toggle, fullscreen;
  - auto-pause when the tab is hidden (auto-resumes only if the player hadn't paused it).
- `js/main.js` - wires the vendored core to the page: `fetch("rom/game.sfc")` instead of a file
  `<input>`, a `requestAnimationFrame` loop calling `snes.runFrame()`/`setPixels()`/
  `setSamples()`, and keyboard input via the project's own Settings > Controls mapping
  (`customControlsUp/Down/Left/Right/A/B/Start/Select` - the same JSON shape `buildProject.js`
  already builds for the GB template). Also defines the small global helpers the vendored core
  calls into that upstream's own `main.js`/`trace.js` used to provide: `log`, `clearArray`,
  `getByteRep`/`getWordRep`/`getLongRep`.
  - **Cartridge SRAM persistence.** The SNES engine's `SAVE_DATA`/`LOAD_DATA` opcodes write to
    battery-backed cartridge SRAM (`snes.cart.sram`); SnesJs has no persistence of its own, so a
    reload would lose every save. `main.js` mirrors `snes.cart.sram` into `localStorage` (base64,
    keyed by `document.title` so two projects on one origin don't collide), restoring it right
    after `loadRom`+`reset(true)` and flushing on a 5 s poll (FNV-1a hash gate - only writes when
    the save actually changed) + on `pagehide`/`beforeunload`. Verified with an offscreen
    Electron round-trip: poke `sram`, wait past the poll, reload -> bytes restored, "Loaded
    saved game" logged. No full save-state (emulator snapshot) - SnesJs doesn't serialize its
    machine state, and SRAM covers what GB Studio games actually persist.

SNES pad button indices (`Snes.setPad1ButtonPressed/Released`, upstream's own convention):
`0 B, 1 Y, 2 Select, 3 Start, 4 Up, 5 Down, 6 Left, 7 Right, 8 A, 9 X, 10 L, 11 R`. Only
Up/Down/Left/Right/A/B/Start/Select are project-configurable - X/Y/L/R aren't read by this
project's own SNES engine yet (`SceneGbInputBits` only translates the 8 GB-layout buttons;
widening it is a deferred decision, see CLAUDE.md), so they're fixed to `u`/`i`/`o`/`p` here
purely so the emulator's pad has all 12 buttons wired for whenever that support lands - pressing
them currently has no effect in a running game.

Not cycle-accurate (SnesJs's own README says as much - DMA/HDMA/PPU/APU timing has known gaps),
so treat this as a quick in-app preview, not a reference emulator. Mesen remains the reference
used to verify the engine itself (see `appData/src/snes/README.md`).
