import fs from "fs-extra";
import Path from "path";
import { modToIt } from "../../../src/lib/compiler/mod2it";
import validateIt from "../../../src/lib/compiler/itValidate";

const MOD = Path.join(
  __dirname,
  "..",
  "..",
  "projects",
  "Test_SoundEffects",
  "assets",
  "music",
  "template.mod"
);

// Flip sample `index`'s compression flag bit in a buffer laid out the way
// modToIt() (and any real IT file) lays it out - same offsets validateIt()
// itself reads, used here only to build a synthetic "bad" fixture without a
// real compressed-sample binary checked into the repo.
const setSampleCompressed = (buf, index) => {
  const ordNum = buf.readUInt16LE(0x20);
  const insNum = buf.readUInt16LE(0x22);
  const sampleTableStart = 0xc0 + ordNum + insNum * 4;
  const samplePtr = buf.readUInt32LE(sampleTableStart + index * 4);
  const flagsOffset = samplePtr + 18;
  buf[flagsOffset] |= 0x08;
};

// A minimal, otherwise-valid IT header with a given instrument/sample count
// - enough for validateIt()'s own checks, not a full playable module. Used
// to test the insNum===0 ("old"/sample-direct IT mode) check in isolation.
const minimalItHeader = ({ insNum, smpNum }) => {
  const buf = Buffer.alloc(0xc2);
  buf.write("IMPM", 0, "latin1");
  buf.writeUInt16LE(0, 0x20); // ordNum
  buf.writeUInt16LE(insNum, 0x22);
  buf.writeUInt16LE(smpNum, 0x24);
  buf.writeUInt16LE(0, 0x26); // patNum
  return buf;
};

describe("itValidate", () => {
  const validIt = modToIt(fs.readFileSync(MOD));

  test("a well-formed, uncompressed .it reports no problems", () => {
    expect(validateIt(validIt)).toEqual([]);
  });

  test("an .it saved without instruments (old/sample-direct mode) is reported", () => {
    const problems = validateIt(minimalItHeader({ insNum: 0, smpNum: 31 }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/without instruments/);
  });

  test("an .it with instruments (new instrument mode) reports no instrument problem", () => {
    const problems = validateIt(minimalItHeader({ insNum: 17, smpNum: 17 }));
    expect(problems.filter((p) => /without instruments/.test(p))).toEqual([]);
  });

  test("insNum 0 with no samples at all is not flagged (nothing to play, nothing missing)", () => {
    const problems = validateIt(minimalItHeader({ insNum: 0, smpNum: 0 }));
    expect(problems).toEqual([]);
  });

  test("a compressed sample is reported, not thrown", () => {
    const buf = Buffer.from(validIt);
    setSampleCompressed(buf, 0);
    const problems = validateIt(buf);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/sample 1 uses IT compression/);
  });

  test("multiple compressed samples are all reported", () => {
    const buf = Buffer.from(validIt);
    setSampleCompressed(buf, 0);
    setSampleCompressed(buf, 2);
    const problems = validateIt(buf);
    expect(problems).toHaveLength(2);
  });

  test("throws on a buffer that isn't an IT file at all", () => {
    expect(() => validateIt(Buffer.from("not an it file"))).toThrow(
      /not a valid/i
    );
  });

  test("throws on a truncated header", () => {
    expect(() => validateIt(validIt.slice(0, 0x50))).toThrow(/not a valid/i);
  });
});
