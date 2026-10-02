import fs from "fs-extra";
import Path from "path";
import { modToIt } from "../../../../src/lib/compiler/mod2it";
import ItModule from "../../../../src/lib/vendor/scriptracker/it_module";

const MOD = Path.join(
  __dirname,
  "..",
  "..",
  "..",
  "projects",
  "Test_SoundEffects",
  "assets",
  "music",
  "template.mod"
);

// A minimal, hand-built IT buffer in "old"/sample-direct mode (InstrumentCount 0) - one sample, one
// pattern with a single note on row 0, no instrument block at all. Mirrors the real shape
// ITRulz_Outside.it had before the user re-exported it (see itValidate.js/compileSnesMusic.test.js).
const buildNoInstrumentIt = () => {
  const SAMPLE_PCM = Buffer.from([10, 20, 30, 40]);
  const sampleHeader = Buffer.alloc(80);
  sampleHeader.write("IMPS", 0, "latin1");
  sampleHeader[0x12] = 0x01; // HasSample
  sampleHeader[0x13] = 64; // default volume
  sampleHeader.write("beep", 0x14, "latin1");
  sampleHeader[0x2e] = 0x01; // signed
  sampleHeader.writeUInt32LE(SAMPLE_PCM.length, 0x30); // length
  sampleHeader.writeUInt32LE(8363, 0x3c); // C5Speed

  // One pattern, one row, channel 0: note C-5 (IT raw note 59), instrument/sample 1, no volume/effect.
  const patternBody = Buffer.from([
    0x81, // chvar: channel 1 (0-based 0), high bit set -> a mask byte follows
    0x03, // mask: bit0 note-new | bit1 instrument-new
    59, // note
    1, // sample/instrument number
    0x00, // end of row
  ]);
  const patternHeader = Buffer.alloc(8);
  patternHeader.writeUInt16LE(patternBody.length, 0);
  patternHeader.writeUInt16LE(1, 2); // 1 row

  const header = Buffer.alloc(0xc0);
  header.write("IMPM", 0, "latin1");
  header.writeUInt16LE(1, 0x20); // ordNum
  header.writeUInt16LE(0, 0x22); // insNum
  header.writeUInt16LE(1, 0x24); // smpNum
  header.writeUInt16LE(1, 0x26); // patNum
  header[0x32] = 6; // initial speed
  header[0x33] = 125; // initial tempo

  const order = Buffer.from([0]);
  const samplePtrOffset = 0xc0 + order.length;
  const samplePtrTable = Buffer.alloc(4);
  const patternPtrTable = Buffer.alloc(4);

  const sampleBlockOffset = samplePtrOffset + samplePtrTable.length + patternPtrTable.length;
  const sampleDataOffset = sampleBlockOffset + sampleHeader.length;
  sampleHeader.writeUInt32LE(sampleDataOffset, 0x48); // SamplePointer
  samplePtrTable.writeUInt32LE(sampleBlockOffset, 0);

  const patternBlockOffset = sampleDataOffset + SAMPLE_PCM.length;
  patternPtrTable.writeUInt32LE(patternBlockOffset, 0);

  return Buffer.concat([
    header,
    order,
    samplePtrTable,
    patternPtrTable,
    sampleHeader,
    SAMPLE_PCM,
    patternHeader,
    patternBody,
  ]);
};

describe("ItModule", () => {
  test("parses a real, instrument-mode .it (modToIt's own output) without crashing", () => {
    const buf = modToIt(fs.readFileSync(MOD));
    const mod = new ItModule(buf);

    expect(mod.type).toBe("it");
    expect(mod.channels).toBe(64);
    expect(mod.orders.length).toBeGreaterThan(0);
    expect(mod.instruments).toHaveLength(31);
    expect(mod.patterns.length).toBeGreaterThan(0);

    // Every instrument is a pass-through to its own sample (mod2it.js's own 1:1 convention) - sample 0
    // should carry real, non-silent decoded PCM data.
    const firstSample = mod.instruments[0].samples[0];
    expect(firstSample.sample.length).toBeGreaterThan(0);
    expect(firstSample.sample.some((v) => v !== 0)).toBe(true);
    firstSample.sample.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    });

    // A pass-through instrument's sampleKeyMap should resolve every note to its own single sample.
    expect(mod.instruments[0].sampleKeyMap[60]).toBe(1);
  });

  test("a sample-direct ('old'/no-instrument) .it synthesizes one pass-through instrument per sample", () => {
    const mod = new ItModule(buildNoInstrumentIt());

    expect(mod.instruments).toHaveLength(1);
    expect(mod.instruments[0].samples).toHaveLength(1);
    expect(mod.instruments[0].samples[0].name.replace(/\0+$/, "")).toBe("beep");
    expect(mod.instruments[0].samples[0].sample).toHaveLength(4);

    expect(mod.patterns).toHaveLength(1);
    const pattern = mod.patterns[0];
    expect(pattern.rows).toBe(1);
    // IT raw note 59 -> generic 1-based note 60.
    expect(pattern.note[0][0]).toBe(60);
    expect(pattern.instrument[0][0]).toBe(1);
  });

  test("a compressed sample is left silent rather than decoded or crashed on", () => {
    const buf = Buffer.from(buildNoInstrumentIt());
    // Sample header starts right after header(0xc0) + order(1) + 2 pointer tables(4+4) = 0xc9.
    const sampleHeaderOffset = 0xc0 + 1 + 4 + 4;
    buf[sampleHeaderOffset + 0x12] |= 0x08; // set the Compressed flag

    const mod = new ItModule(buf);
    expect(mod.instruments[0].samples[0].sample).toEqual([]);
  });

  test("an empty pattern pointer (0) decodes to a blank 64-row pattern, not a crash", () => {
    const buf = buildNoInstrumentIt();
    // Zero out the pattern pointer table entry.
    const patternPtrOffset = 0xc0 + 1 + 4;
    buf.writeUInt32LE(0, patternPtrOffset);

    const mod = new ItModule(buf);
    expect(mod.patterns[0].rows).toBe(64);
    expect(mod.patterns[0].note[0][0]).toBe(0);
  });
});
