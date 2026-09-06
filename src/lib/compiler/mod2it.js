/*
 * mod2it.js - 4-channel ProTracker `.mod` -> Impulse Tracker `.it`.
 *
 * GB Studio's music pipeline is ProTracker `.mod` (via `mod2gbt` for the GB
 * target). The SNES target's audio driver (PVSnesLib's snesmod, tool `smconv`)
 * only accepts `.it`. This upcasts a `.mod` to the simplest valid `.it` that
 * `smconv` handles: samples-only playback wrapped in one trivial pass-through
 * instrument per sample (the whole PVSnesLib ecosystem authors in Impulse /
 * Schism Tracker, which always write instruments - so does this, to stay on
 * the tested path), 4 channels, uncompressed 8-bit samples, IT packed patterns.
 *
 * A `.mod` is a strict subset of `.it`, so this is mostly mechanical. The
 * lossy parts (documented, verified approximately - see appData/src/snes/
 * README.md's M8 notes): Amiga (non-linear) pitch slides are emitted as IT
 * linear slides, and a few ProTracker effects have no clean IT equivalent.
 */

// ---- ProTracker period table (finetune 0), notes C-1..B-3 = index 0..35 ----
// prettier-ignore
const PT_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113
];
// index 12 (period 428, ProTracker "C-2") -> IT note 60 (C-5). So itNote = i+48.
const IT_NOTE_BASE = 48;

// Amiga clock / 2, PAL. period 428 -> 8287 Hz ~ the classic 8363 "middle C".
const AMIGA_CLOCK = 7093789.2;

const periodToItNote = period => {
  if (!period) return null;
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  }
  return best + IT_NOTE_BASE;
};

// MOD finetune is a signed nibble (-8..7), 1 unit = 1/8 semitone.
const finetuneToC5Speed = finetune => {
  const ft = finetune > 7 ? finetune - 16 : finetune;
  return Math.round((AMIGA_CLOCK / 428) * 2 ** (ft / (12 * 8)));
};

// ---- parse a 4-channel M.K. .mod ------------------------------------------
const parseMod = buf => {
  const tag = buf.toString("latin1", 1080, 1084);
  const channels = { "M.K.": 4, "M!K!": 4, FLT4: 4, "4CHN": 4 }[tag];
  if (!channels) {
    throw new Error(`mod2it: unsupported .mod tag "${tag}" (need 4-channel M.K.)`);
  }

  const title = buf.toString("latin1", 0, 20).replace(/\0.*$/, "");
  const samples = [];
  for (let i = 0; i < 31; i++) {
    const o = 20 + i * 30;
    const lengthWords = buf.readUInt16BE(o + 22);
    const finetune = buf[o + 24] & 0x0f;
    const volume = Math.min(64, buf[o + 25]);
    const loopStartWords = buf.readUInt16BE(o + 26);
    const loopLenWords = buf.readUInt16BE(o + 28);
    samples.push({
      name: buf.toString("latin1", o, o + 22).replace(/\0.*$/, ""),
      lengthBytes: lengthWords * 2,
      finetune,
      volume,
      loopStart: loopStartWords * 2,
      loopLen: loopLenWords * 2,
      pcm: null
    });
  }

  const songLength = buf[950];
  const orders = [];
  for (let i = 0; i < 128; i++) orders.push(buf[952 + i]);
  const usedOrders = orders.slice(0, songLength);
  const numPatterns = Math.max(0, ...orders) + 1;

  const patterns = [];
  let p = 1084;
  for (let pat = 0; pat < numPatterns; pat++) {
    const rows = [];
    for (let row = 0; row < 64; row++) {
      const cells = [];
      for (let ch = 0; ch < 4; ch++) {
        const b0 = buf[p];
        const b1 = buf[p + 1];
        const b2 = buf[p + 2];
        const b3 = buf[p + 3];
        p += 4;
        const period = ((b0 & 0x0f) << 8) | b1;
        const sample = (b0 & 0xf0) | ((b2 & 0xf0) >> 4);
        cells.push({ period, sample, effect: b2 & 0x0f, param: b3 });
      }
      rows.push(cells);
    }
    patterns.push(rows);
  }

  // sample PCM follows the patterns
  for (let i = 0; i < 31; i++) {
    const s = samples[i];
    if (s.lengthBytes > 0) {
      s.pcm = buf.slice(p, p + s.lengthBytes);
      p += s.lengthBytes;
    } else {
      s.pcm = Buffer.alloc(0);
    }
  }

  return { title, samples, usedOrders, numPatterns, patterns };
};

// ---- ProTracker effect -> IT effect --------------------------------------
// IT command numbers: A..Z = 1..26. Volume-column commands are handled
// separately (return { vol } instead of { cmd, param }).
const IT_CMD = {};
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => {
  IT_CMD[c] = i + 1;
});

const convertEffect = (effect, param) => {
  const hi = param >> 4;
  const lo = param & 0x0f;
  switch (effect) {
    case 0x0:
      return param ? { cmd: IT_CMD.J, param } : null; // arpeggio
    case 0x1:
      return { cmd: IT_CMD.F, param }; // porta up
    case 0x2:
      return { cmd: IT_CMD.E, param }; // porta down
    case 0x3:
      return { cmd: IT_CMD.G, param }; // tone porta
    case 0x4:
      return { cmd: IT_CMD.H, param }; // vibrato
    case 0x5:
      return { cmd: IT_CMD.L, param }; // tone porta + vol slide
    case 0x6:
      return { cmd: IT_CMD.K, param }; // vibrato + vol slide
    case 0x7:
      return { cmd: IT_CMD.R, param }; // tremolo
    case 0x8:
      return { cmd: IT_CMD.X, param }; // set pan (rarely meaningful in PT)
    case 0x9:
      return { cmd: IT_CMD.O, param }; // sample offset
    case 0xa:
      return { cmd: IT_CMD.D, param }; // volume slide
    case 0xb:
      return { cmd: IT_CMD.B, param }; // position jump
    case 0xc:
      return { vol: Math.min(64, param) }; // set volume -> volume column
    case 0xd:
      return { cmd: IT_CMD.C, param: hi * 10 + lo }; // pattern break (BCD -> row)
    case 0xf:
      return param < 0x20
        ? { cmd: IT_CMD.A, param } // set speed
        : { cmd: IT_CMD.T, param }; // set tempo
    case 0xe:
      switch (hi) {
        case 0x1:
          return { cmd: IT_CMD.F, param: 0xf0 | lo }; // fine porta up
        case 0x2:
          return { cmd: IT_CMD.E, param: 0xf0 | lo }; // fine porta down
        case 0x3:
          return { cmd: IT_CMD.S, param: 0x10 | lo }; // glissando
        case 0x4:
          return { cmd: IT_CMD.S, param: 0x30 | lo }; // vibrato waveform
        case 0x5:
          return { cmd: IT_CMD.S, param: 0x20 | lo }; // set finetune
        case 0x6:
          return { cmd: IT_CMD.S, param: 0xb0 | lo }; // pattern loop
        case 0x7:
          return { cmd: IT_CMD.S, param: 0x40 | lo }; // tremolo waveform
        case 0x9:
          return { cmd: IT_CMD.Q, param: lo }; // retrigger
        case 0xa:
          return { cmd: IT_CMD.D, param: (lo << 4) | 0x0f }; // fine vol up
        case 0xb:
          return { cmd: IT_CMD.D, param: 0xf0 | lo }; // fine vol down
        case 0xc:
          return { cmd: IT_CMD.S, param: 0xc0 | lo }; // note cut
        case 0xd:
          return { cmd: IT_CMD.S, param: 0xd0 | lo }; // note delay
        case 0xe:
          return { cmd: IT_CMD.S, param: 0xe0 | lo }; // pattern delay
        default:
          return null; // E0x filter, E8x, EFx invert loop - no SNES equivalent
      }
    default:
      return null;
  }
};

// ---- IT packed pattern ---------------------------------------------------
const packPattern = rows => {
  const out = [];
  const lastMask = [0, 0, 0, 0];
  const lastNote = [0, 0, 0, 0];
  const lastInstr = [0, 0, 0, 0];
  const lastVol = [0, 0, 0, 0];
  const lastCmd = [0, 0, 0, 0];
  const lastParam = [0, 0, 0, 0];

  for (const cells of rows) {
    [0, 1, 2, 3].forEach(ch => {
      const c = cells[ch];
      const note = c.period ? periodToItNote(c.period) : null;
      const instr = c.sample || null; // 1-based; also the instrument number
      const fx = convertEffect(c.effect, c.param);
      const vol = fx && fx.vol !== undefined ? fx.vol : null;
      const cmd = fx && fx.cmd !== undefined ? fx.cmd : null;
      const param = cmd !== null ? fx.param & 0xff : null;

      if (note === null && instr === null && vol === null && cmd === null) {
        return; // empty cell
      }

      let mask = 0;
      const fields = [];
      if (note !== null) {
        if (note === lastNote[ch]) {
          mask |= 0x10;
        } else {
          mask |= 0x01;
          fields.push(note);
          lastNote[ch] = note;
        }
      }
      if (instr !== null) {
        if (instr === lastInstr[ch]) {
          mask |= 0x20;
        } else {
          mask |= 0x02;
          fields.push(instr);
          lastInstr[ch] = instr;
        }
      }
      if (vol !== null) {
        if (vol === lastVol[ch]) {
          mask |= 0x40;
        } else {
          mask |= 0x04;
          fields.push(vol);
          lastVol[ch] = vol;
        }
      }
      if (cmd !== null) {
        if (cmd === lastCmd[ch] && param === lastParam[ch]) {
          mask |= 0x80;
        } else {
          mask |= 0x08;
          fields.push(cmd, param);
          lastCmd[ch] = cmd;
          lastParam[ch] = param;
        }
      }

      if (mask === lastMask[ch]) {
        out.push(ch + 1); // channel var, no new mask
      } else {
        out.push((ch + 1) | 0x80, mask);
        lastMask[ch] = mask;
      }
      out.push(...fields);
    });
    out.push(0); // end of row
  }
  return Buffer.from(out);
};

// ---- write the .it ------------------------------------------------------
const writeIt = mod => {
  const smpNum = mod.samples.length; // keep 1:1 numbering, empty slots included
  const insNum = smpNum;
  const patNum = mod.numPatterns;
  const ordNum = mod.usedOrders.length + 1; // + terminator

  const HEADER = 0xc0;
  const ordBytes = ordNum;
  const insTableOff = HEADER + ordBytes;
  const smpTableOff = insTableOff + insNum * 4;
  const patTableOff = smpTableOff + smpNum * 4;
  let cursor = patTableOff + patNum * 4;

  const insOffsets = [];
  const insBlocks = [];
  for (let i = 0; i < insNum; i++) {
    insOffsets.push(cursor);
    const b = Buffer.alloc(554);
    b.write("IMPI", 0, "latin1");
    b[0x11] = 0; // NNA = cut (MOD-like)
    b[0x18] = 128; // global volume
    b[0x19] = 32; // default pan, centred
    b.writeUInt16LE(0x0214, 0x1c); // tracker version
    b[0x1e] = 1; // number of samples
    b.write((mod.samples[i].name || "").slice(0, 25), 0x20, "latin1");
    b[0x3c] = 0; // MIDI channel
    for (let n = 0; n < 120; n++) {
      b[0x40 + n * 2] = n; // note
      b[0x40 + n * 2 + 1] = i + 1; // -> sample i+1
    }
    // three disabled envelopes (82 bytes each) already zeroed by alloc
    insBlocks.push(b);
    cursor += b.length;
  }

  const smpOffsets = [];
  const smpBlocks = [];
  const smpDataOffsets = [];
  for (let i = 0; i < smpNum; i++) {
    smpOffsets.push(cursor);
    const s = mod.samples[i];
    const b = Buffer.alloc(80);
    b.write("IMPS", 0, "latin1");
    b[0x11] = 64; // global volume
    let flg = 0;
    if (s.lengthBytes > 0) flg |= 0x01; // sample present
    if (s.loopLen > 2) flg |= 0x10; // loop on
    b[0x12] = flg;
    b[0x13] = s.volume; // default volume
    b.write((s.name || "").slice(0, 25), 0x14, "latin1");
    b[0x2e] = 0x01; // Cvt: signed samples (MOD 8-bit is signed)
    b[0x2f] = 32; // default pan
    b.writeUInt32LE(s.lengthBytes, 0x30); // length in samples (8-bit -> == bytes)
    b.writeUInt32LE(s.loopStart, 0x34);
    b.writeUInt32LE(
      flg & 0x10 ? s.loopStart + s.loopLen : s.lengthBytes,
      0x38
    );
    b.writeUInt32LE(finetuneToC5Speed(s.finetune), 0x3c);
    // 0x48 sample pointer - filled below once we know the data layout
    smpBlocks.push(b);
    cursor += b.length;
  }

  const patOffsets = [];
  const patBlocks = [];
  for (let i = 0; i < patNum; i++) {
    const packed = packPattern(mod.patterns[i]);
    patOffsets.push(cursor);
    const b = Buffer.alloc(8 + packed.length);
    b.writeUInt16LE(packed.length, 0);
    b.writeUInt16LE(64, 2); // rows
    packed.copy(b, 8);
    patBlocks.push(b);
    cursor += b.length;
  }

  // sample data at the end
  for (let i = 0; i < smpNum; i++) {
    smpDataOffsets.push(cursor);
    smpBlocks[i].writeUInt32LE(mod.samples[i].pcm.length ? cursor : 0, 0x48);
    cursor += mod.samples[i].pcm.length;
  }

  // ---- assemble ----
  const head = Buffer.alloc(HEADER);
  head.write("IMPM", 0, "latin1");
  head.write((mod.title || "gbstudio").slice(0, 25), 0x04, "latin1");
  head.writeUInt16LE(0x1004, 0x1e); // pattern row hilight
  head.writeUInt16LE(ordNum, 0x20);
  head.writeUInt16LE(insNum, 0x22);
  head.writeUInt16LE(smpNum, 0x24);
  head.writeUInt16LE(patNum, 0x26);
  head.writeUInt16LE(0x0214, 0x28); // Cwt/v
  head.writeUInt16LE(0x0214, 0x2a); // Cmwt
  // Flags: bit0 stereo, bit2 use instruments (we emit them), bit3 linear slides
  head.writeUInt16LE(0x0001 | 0x0004 | 0x0008, 0x2c);
  head.writeUInt16LE(0x0000, 0x2e); // Special
  head[0x30] = 128; // global volume
  head[0x31] = 48; // mixing volume
  head[0x32] = 6; // initial speed
  head[0x33] = 125; // initial tempo
  head[0x34] = 128; // panning separation
  head[0x35] = 0; // pitch wheel depth
  const chPan = [0, 64, 64, 0];
  for (let i = 0; i < 64; i++) {
    head[0x40 + i] = i < 4 ? chPan[i] : 32; // channel pan
    head[0x80 + i] = 64; // channel volume
  }

  const orders = Buffer.alloc(ordNum, 255);
  mod.usedOrders.forEach((o, i) => {
    orders[i] = o;
  });

  const insTable = Buffer.alloc(insNum * 4);
  insOffsets.forEach((o, i) => insTable.writeUInt32LE(o, i * 4));
  const smpTable = Buffer.alloc(smpNum * 4);
  smpOffsets.forEach((o, i) => smpTable.writeUInt32LE(o, i * 4));
  const patTable = Buffer.alloc(patNum * 4);
  patOffsets.forEach((o, i) => patTable.writeUInt32LE(o, i * 4));

  return Buffer.concat([
    head,
    orders,
    insTable,
    smpTable,
    patTable,
    ...insBlocks,
    ...smpBlocks,
    ...patBlocks,
    ...mod.samples.map(s => s.pcm)
  ]);
};

const modToIt = modBuffer => writeIt(parseMod(modBuffer));

module.exports = { modToIt, parseMod, writeIt };
