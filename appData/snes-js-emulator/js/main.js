"use strict";

// Small global helpers the vendored SnesJs core (../snes/*.js) calls into -
// upstream's own js/main.js and js/trace.js used to provide these; we don't
// vendor either (see README.md), so they're reimplemented here, unchanged.
function clearArray(arr) {
  for (let i = 0; i < arr.length; i++) arr[i] = 0;
}
function log(text) {
  const el = document.getElementById("log");
  if (el) el.textContent = text;
  // eslint-disable-next-line no-console
  console.log(text);
}
function getByteRep(val) {
  return ("0" + val.toString(16)).slice(-2).toUpperCase();
}
function getWordRep(val) {
  return ("000" + val.toString(16)).slice(-4).toUpperCase();
}
function getLongRep(val) {
  return ("00000" + val.toString(16)).slice(-6).toUpperCase();
}

// Snes.setPad1Button{Pressed,Released}(n) - upstream's own button numbering.
const BUTTON = {
  b: 0,
  y: 1,
  select: 2,
  start: 3,
  up: 4,
  down: 5,
  left: 6,
  right: 7,
  a: 8,
  x: 9,
  l: 10,
  r: 11
};

// customControls is templated in by buildProject.js from the project's own
// Settings > Controls page - same shape as the GB template. X/Y/L/R have no
// project setting (the SNES engine doesn't read them yet), so they're fixed.
const FIXED_KEYS = { y: ["u"], x: ["i"], l: ["o"], r: ["p"] };

const keyToButton = {};
function bindKeys(name, keys) {
  (keys || []).forEach(key => {
    keyToButton[String(key).toLowerCase()] = BUTTON[name];
  });
}
bindKeys("up", customControls.up);
bindKeys("down", customControls.down);
bindKeys("left", customControls.left);
bindKeys("right", customControls.right);
bindKeys("a", customControls.a);
bindKeys("b", customControls.b);
bindKeys("start", customControls.start);
bindKeys("select", customControls.select);
bindKeys("y", FIXED_KEYS.y);
bindKeys("x", FIXED_KEYS.x);
bindKeys("l", FIXED_KEYS.l);
bindKeys("r", FIXED_KEYS.r);

const canvas = document.getElementById("output");
canvas.width = 512;
canvas.height = 480;
const ctx = canvas.getContext("2d");
const imgData = ctx.getImageData(0, 0, 512, 480);

const snes = new Snes(); // eslint-disable-line no-undef
const audioHandler = new AudioHandler(); // eslint-disable-line no-undef

// ---------------------------------------------------------------------------
// Cartridge SRAM persistence. The SNES engine's SAVE_DATA / LOAD_DATA opcodes
// write to battery-backed cartridge SRAM; SnesJs keeps it in snes.cart.sram
// but has no persistence of its own, so a page reload would lose every save.
// Mirror it into localStorage (keyed by the game's title so two projects on
// the same origin don't collide) and flush on an interval + when the page is
// hidden or unloaded.
// ---------------------------------------------------------------------------
const SAVE_KEY = "gbstudio-snes-sram:" + (document.title || "game");
let sramDirty = false;
let lastSramHash = 0;

function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function sramHash(bytes) {
  // cheap FNV-1a so we only write localStorage when the save actually changed
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

function restoreSram() {
  if (!snes.cart || !snes.cart.hasSram) return;
  let stored;
  try {
    stored = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return; // storage disabled (private mode etc.)
  }
  if (!stored) return;
  try {
    const bytes = base64ToBytes(stored);
    if (bytes.length === snes.cart.sram.length) {
      snes.cart.sram.set(bytes);
      lastSramHash = sramHash(snes.cart.sram);
      log("Loaded saved game");
    }
  } catch (e) {
    /* corrupt entry - ignore, it'll be overwritten on the next save */
  }
}

function flushSram() {
  if (!snes.cart || !snes.cart.hasSram) return;
  const h = sramHash(snes.cart.sram);
  if (h === lastSramHash) return;
  try {
    localStorage.setItem(SAVE_KEY, bytesToBase64(snes.cart.sram));
    lastSramHash = h;
  } catch (e) {
    /* quota / disabled - nothing we can do, keep running */
  }
}

setInterval(function pollSram() {
  if (running) flushSram();
}, 5000);
window.addEventListener("pagehide", flushSram);
window.addEventListener("beforeunload", flushSram);

// ---------------------------------------------------------------------------
// Run loop
// ---------------------------------------------------------------------------
let loopId = 0;
let running = false;
let started = false;

function runFrame() {
  snes.runFrame(false);
  snes.setPixels(imgData.data);
  ctx.putImageData(imgData, 0, 0);
  snes.setSamples(
    audioHandler.sampleBufferL,
    audioHandler.sampleBufferR,
    audioHandler.samplesPerFrame
  );
  audioHandler.nextBuffer();
}

function update() {
  runFrame();
  loopId = requestAnimationFrame(update);
}

function startLoop() {
  if (loopId || !started) return;
  audioHandler.start();
  audioHandler.resume();
  running = true;
  updatePauseUi();
  loopId = requestAnimationFrame(update);
}

function stopLoop() {
  if (!loopId) return;
  cancelAnimationFrame(loopId);
  audioHandler.stop();
  loopId = 0;
  running = false;
  flushSram();
  updatePauseUi();
}

function togglePause() {
  if (!started) return;
  if (running) stopLoop();
  else startLoop();
}

// Auto-pause when the tab is hidden; only auto-resume if the player hadn't
// paused it themselves.
let autoPaused = false;
document.addEventListener("visibilitychange", function onVis() {
  if (document.hidden) {
    if (running) {
      autoPaused = true;
      stopLoop();
    }
  } else if (autoPaused) {
    autoPaused = false;
    startLoop();
  }
});

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const startOverlay = document.getElementById("start_overlay");
const pauseOverlay = document.getElementById("pause_overlay");
const startButton = document.getElementById("start_button");
const startHint = document.getElementById("start_hint");

function updatePauseUi() {
  pauseOverlay.hidden = !started || running;
}

function beginPlay() {
  if (started) {
    // already running - the overlay is the pause overlay now
    startLoop();
    return;
  }
  started = true;
  startOverlay.hidden = true;
  startLoop();
}

startButton.addEventListener("click", beginPlay);
pauseOverlay.addEventListener("click", function resumeFromOverlay() {
  startLoop();
});

document.getElementById("btn_pause").addEventListener("click", togglePause);
document.getElementById("btn_reset").addEventListener("click", function reset() {
  snes.reset(false); // soft reset; cart.reset(false) keeps SRAM in memory
});
document.getElementById("btn_full").addEventListener("click", function full() {
  const el = document.getElementById("snes_shell");
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen();
});

// ---- touch controls ----
const padEl = document.getElementById("pad");
const padToggle = document.getElementById("btn_pad");
const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

function setPad(visible) {
  padEl.hidden = !visible;
  padToggle.setAttribute("data-on", visible ? "1" : "0");
}
setPad(coarse);
padToggle.addEventListener("click", function toggle() {
  setPad(padEl.hidden);
});

// pointerdown on a [data-btn] element presses that button; releasing anywhere
// (pointerup / pointercancel / pointerleave off the element) releases it. Track
// per-pointer so multi-touch (d-pad + face button) works.
const activePointers = {};

function pressBtn(name) {
  const n = BUTTON[name];
  if (n !== undefined) snes.setPad1ButtonPressed(n);
}
function releaseBtn(name) {
  const n = BUTTON[name];
  if (n !== undefined) snes.setPad1ButtonReleased(n);
}

function padTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.dataset && el.dataset.btn ? el : null;
}

padEl.addEventListener("pointerdown", function onDown(e) {
  const el = padTarget(e.clientX, e.clientY);
  if (!el) return;
  e.preventDefault();
  if (!started) beginPlay();
  try {
    padEl.setPointerCapture(e.pointerId); // keep move/up on #pad if the finger slides off
  } catch (err) {
    /* not supported - move/up handlers still cover the common case */
  }
  activePointers[e.pointerId] = el.dataset.btn;
  el.classList.add("pressed");
  pressBtn(el.dataset.btn);
});

padEl.addEventListener("pointermove", function onMove(e) {
  if (!(e.pointerId in activePointers)) return;
  const prev = activePointers[e.pointerId];
  const el = padTarget(e.clientX, e.clientY);
  const next = el ? el.dataset.btn : null;
  if (next === prev) return;
  if (prev) {
    releaseBtn(prev);
    const p = padEl.querySelector('[data-btn="' + prev + '"]');
    if (p) p.classList.remove("pressed");
  }
  if (next) {
    pressBtn(next);
    el.classList.add("pressed");
    activePointers[e.pointerId] = next;
  } else {
    delete activePointers[e.pointerId];
  }
});

function endPointer(e) {
  const name = activePointers[e.pointerId];
  if (!name) return;
  delete activePointers[e.pointerId];
  releaseBtn(name);
  const p = padEl.querySelector('[data-btn="' + name + '"]');
  if (p) p.classList.remove("pressed");
}
padEl.addEventListener("pointerup", endPointer);
padEl.addEventListener("pointercancel", endPointer);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
fetch("rom/game.sfc")
  .then(response => response.arrayBuffer())
  .then(buffer => {
    const rom = new Uint8Array(buffer);
    if (snes.loadRom(rom, false)) {
      snes.reset(true);
      restoreSram();
      startHint.textContent = coarse
        ? "On-screen controls below"
        : "Arrow keys to move";
      // one frame so the overlay sits over real content, not a black canvas
      runFrame();
    } else {
      log("Failed to load rom/game.sfc");
      startButton.disabled = true;
    }
  })
  .catch(err => {
    log("Failed to fetch rom/game.sfc: " + err);
    startButton.disabled = true;
  });

window.addEventListener("keydown", function onKeyDown(e) {
  audioHandler.resume(); // Chrome autoplay policy needs a user gesture
  if (!started && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    beginPlay();
    return;
  }
  const button = keyToButton[e.key.toLowerCase()];
  if (button !== undefined) {
    e.preventDefault();
    snes.setPad1ButtonPressed(button);
  }
});

window.addEventListener("keyup", function onKeyUp(e) {
  const button = keyToButton[e.key.toLowerCase()];
  if (button !== undefined) {
    e.preventDefault();
    snes.setPad1ButtonReleased(button);
  }
});
