/*
 * itValidate.js - pre-flight checks for a project's own `.it` file, run
 * before compileSnesMusic.js ever hands it to `smconv`.
 *
 * Two known, confirmed-from-real-upstream-source ways a real-world .it can
 * reach `smconv` and build "successfully" while being broken:
 *
 * 1. A *compressed* IT sample (very common in real-world/downloaded .it
 *    files; most modern trackers default to compression on export) crashes
 *    `smconv` outright. `itloader.cpp`'s `Sample::LoadData` prints
 *    "unsupported compressed samples" but then falls through without ever
 *    allocating the sample's PCM buffer (the `new s8[]`/`new s16[]` call
 *    only happens in the *uncompressed* branch) - every later use of that
 *    sample dereferences a null pointer (confirmed: exit code 3221225477 =
 *    0xC0000005 = STATUS_ACCESS_VIOLATION on Windows). `smconv` builds every
 *    soundbank module (effects + every project song) in one invocation, so
 *    one bad .it crashes every other, valid track's build too.
 *
 * 2. An .it saved **without instruments** ("old"/sample-direct IT mode,
 *    `InstrumentCount` 0 in the header - common when a tracker's "use
 *    instruments" option was never turned on) builds and links with no
 *    error or warning at all, but is permanently silent in-game. Confirmed
 *    from `it2spc.cpp`: the exported soundbank's per-instrument pointer
 *    table is sized `max_instruments` (64) and filled from `Instruments`,
 *    a vector built 1:1 from the source file's own `InstrumentCount`
 *    (`itloader.cpp`'s `Module::Module`); with `InstrumentCount == 0` that
 *    vector is empty, so every slot in the compiled table is written as
 *    `0xFF` (`i < Instruments.size() ? ... : 0xFF`) - there is no working
 *    instrument for any pattern cell to resolve to, ever. The pattern data
 *    itself converts fine (smconv's pattern unpacker never looks at
 *    `InstrumentCount`), so the module "builds" at a plausible, non-zero
 *    size and the ROM boots and plays other tracks normally - only this
 *    one track is silent, with nothing in the build log to say why.
 *    Verified directly: PVSnesLib's own working example
 *    (`snes-examples/audio/music/res/pollen8.it`, `InstrumentCount ==
 *    SampleCount == 17`) plays real SPC voices in Mesen through this exact
 *    pipeline; a real user .it with `InstrumentCount == 0` builds the same
 *    way but every SPC voice stays silent the whole time it's "playing".
 *
 * This only parses the fixed IT header + the sample pointer table (not
 * patterns/instruments) - the minimum needed to read each sample's own
 * Flags byte, and the header's own instrument count, before `smconv` ever
 * sees the file. mod2it.js's own output is never checked (and never needs
 * to be) - it only ever emits uncompressed 8-bit PCM with one pass-through
 * instrument per sample, by construction.
 */

// Real-format constants, matching mod2it.js's own test assertions for the
// same fixed IT header layout (ordNum/insNum/smpNum/patNum at 0x20/22/24/26,
// pointer tables starting right after the order table at 0xc0 + ordNum).
const HEADER_SAMPLE_COUNT_OFFSET = 0x24;
const ORDER_TABLE_START = 0xc0;
// Within one 80-byte IMPS sample header: "IMPS"(4) + DOSFilename(12) +
// reserved(1) + GlobalVolume(1) = 18 bytes in, the Flags byte - bit 3 (0x08)
// is the compression flag (itloader.cpp: `Compressed = !!(Flags & 8);`).
const SAMPLE_FLAGS_OFFSET = 18;
const SAMPLE_COMPRESSED_BIT = 0x08;

// Returns a list of human-readable problems (empty if the file looks safe to
// hand to smconv), or throws if it isn't even a well-formed IT file at all
// (caller should treat that the same as any other unreadable track).
const validateIt = (buf) => {
  if (buf.length < 0xc0 || buf.toString("latin1", 0, 4) !== "IMPM") {
    throw new Error("not a valid Impulse Tracker (.it) file");
  }
  const ordNum = buf.readUInt16LE(0x20);
  const insNum = buf.readUInt16LE(0x22);
  const smpNum = buf.readUInt16LE(HEADER_SAMPLE_COUNT_OFFSET);

  const problems = [];
  if (insNum === 0 && smpNum > 0) {
    problems.push(
      "saved without instruments (old/sample-direct IT mode) - smconv needs a matching instrument per sample or the track builds silently with no playable sound; re-export with instruments enabled (e.g. in OpenMPT: Song > Convert to Instruments)"
    );
  }
  const sampleTableStart = ORDER_TABLE_START + ordNum + insNum * 4;
  for (let i = 0; i < smpNum; i++) {
    const ptrOffset = sampleTableStart + i * 4;
    if (ptrOffset + 4 > buf.length) break; // truncated/malformed - let smconv's own error surface
    const samplePtr = buf.readUInt32LE(ptrOffset);
    const flagsOffset = samplePtr + SAMPLE_FLAGS_OFFSET;
    if (samplePtr === 0 || flagsOffset >= buf.length) continue; // unused sample slot
    const flags = buf[flagsOffset];
    if (flags & SAMPLE_COMPRESSED_BIT) {
      problems.push(`sample ${i + 1} uses IT compression`);
    }
  }
  return problems;
};

export default validateIt;
