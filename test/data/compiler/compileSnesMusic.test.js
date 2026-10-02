import fs from "fs-extra";
import os from "os";
import Path from "path";
import { parseMod, modToIt } from "../../../src/lib/compiler/mod2it";
import buildProject from "../../../src/lib/compiler/buildProject";
import { pvsneslibVendorDir } from "../../../src/consts";

// Flip sample `index`'s compression flag bit in an otherwise well-formed .it
// buffer - same offsets itValidate.js itself reads. Used to build a synthetic
// "smconv would crash on this" fixture without a real compressed-sample
// binary checked into the repo.
const setSampleCompressed = (buf, index) => {
  const ordNum = buf.readUInt16LE(0x20);
  const insNum = buf.readUInt16LE(0x22);
  const sampleTableStart = 0xc0 + ordNum + insNum * 4;
  const samplePtr = buf.readUInt32LE(sampleTableStart + index * 4);
  const flagsOffset = samplePtr + 18;
  buf[flagsOffset] |= 0x08;
};

// A minimal, header-only IT buffer with InstrumentCount 0 - enough to trip
// itValidate.js's "saved without instruments" check before the build ever
// needs a real pattern/sample body (the check fires, and the build fails,
// before smconv is ever invoked).
const noInstrumentIt = () => {
  const buf = Buffer.alloc(0xc2);
  buf.write("IMPM", 0, "latin1");
  buf.writeUInt16LE(0, 0x20); // ordNum
  buf.writeUInt16LE(0, 0x22); // insNum
  buf.writeUInt16LE(1, 0x24); // smpNum
  buf.writeUInt16LE(0, 0x26); // patNum
  return buf;
};

const PROJECTS = Path.join(__dirname, "..", "..", "projects");
const MOD = Path.join(
  PROJECTS,
  "Test_SoundEffects",
  "assets",
  "music",
  "template.mod"
);

// ---- mod2it: pure converter, always runs -------------------------------------
describe("mod2it", () => {
  const modBuf = fs.readFileSync(MOD);

  test("parseMod reads a 4-channel M.K. module", () => {
    const mod = parseMod(modBuf);
    expect(mod.samples).toHaveLength(31);
    expect(mod.numPatterns).toBeGreaterThan(0);
    expect(mod.usedOrders.length).toBeGreaterThan(0);
    // every order points at a real pattern
    mod.usedOrders.forEach((o) => expect(o).toBeLessThan(mod.numPatterns));
    // at least one sample carries PCM
    expect(mod.samples.some((s) => s.pcm && s.pcm.length > 0)).toBe(true);
  });

  test("modToIt emits a well-formed IMPM file", () => {
    const it = modToIt(modBuf);
    expect(it.slice(0, 4).toString("latin1")).toBe("IMPM");
    const ordNum = it.readUInt16LE(0x20);
    const insNum = it.readUInt16LE(0x22);
    const smpNum = it.readUInt16LE(0x24);
    const patNum = it.readUInt16LE(0x26);
    expect(smpNum).toBe(31);
    expect(insNum).toBe(31); // one pass-through instrument per sample
    expect(patNum).toBeGreaterThan(0);
    // instrument / sample / pattern offset tables sit inside the file
    const off = 0xc0 + ordNum;
    for (let i = 0; i < insNum + smpNum + patNum; i++) {
      const ptr = it.readUInt32LE(off + i * 4);
      expect(ptr).toBeGreaterThan(0);
      expect(ptr).toBeLessThan(it.length);
    }
    // each instrument block starts with "IMPI", each sample with "IMPS"
    expect(it.slice(off, off + 4).length).toBe(4);
    const insPtr0 = it.readUInt32LE(off);
    expect(it.slice(insPtr0, insPtr0 + 4).toString("latin1")).toBe("IMPI");
    const smpPtr0 = it.readUInt32LE(off + insNum * 4);
    expect(it.slice(smpPtr0, smpPtr0 + 4).toString("latin1")).toBe("IMPS");
  });
});

// ---- toolchain-gated: smconv soundbank + full project -> bootable .sfc --------
const vendored = pvsneslibVendorDir();
const maybe = fs.existsSync(vendored) ? describe : describe.skip;

const loadProject = (dir) => {
  const gbs = fs.readdirSync(dir).find((x) => x.endsWith(".gbsproj"));
  return JSON.parse(fs.readFileSync(Path.join(dir, gbs), "utf8"));
};

maybe("compileSnesMusic (smconv) + buildProject", () => {
  test(
    "project .mod music -> regenerated soundbank -> bootable ROM",
    async () => {
      const dir = Path.join(PROJECTS, "Test_SoundEffects");
      const p = loadProject(dir);
      p.name = "SNESMUSICTEST";
      p.settings = { ...p.settings, target: "snes" };
      // force the first scene to play the project's own track
      p.scenes[0].script = [
        {
          command: "EVENT_MUSIC_PLAY",
          args: { musicId: p.music[0].id, loop: true },
        },
        { command: "EVENT_END" },
      ];

      const outputRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), "gbs-snes-music-")
      );
      const warnings = [];
      try {
        await buildProject(p, {
          projectRoot: dir,
          outputRoot,
          progress: () => {},
          warnings: (m) => warnings.push(m),
        });

        const rom = await fs.readFile(
          Path.join(outputRoot, "build", "rom", "game.sfc")
        );
        expect(rom.length).toBe(8 * 0x8000);
        expect(rom[0x7fd5]).toBe(0x30); // LoROM | FastROM

        // the soundbank was rebuilt from the project's .mod
        const sbH = await fs.readFile(
          Path.join(outputRoot, "res", "soundbank.h"),
          "utf8"
        );
        expect(sbH).toMatch(/MOD_EFFECTSSFX\s+0/);
        expect(sbH).toMatch(/MOD_MUS0\s+1/);
        const assetsH = await fs.readFile(
          Path.join(outputRoot, "src", "assets.h"),
          "utf8"
        );
        expect(assetsH).toMatch(/#define NUM_MUSIC_TRACKS 1/);
        // this track needs > 32 KB combined with the effects module: 2 banks
        const banksH = await fs.readFile(
          Path.join(outputRoot, "res", "soundbank_banks.h"),
          "utf8"
        );
        expect(banksH).toMatch(/MUSIC_SET_BANKS/);

        expect(
          warnings.filter((w) => /could not convert|not found/i.test(w))
        ).toEqual([]);
      } finally {
        await fs.remove(outputRoot);
      }
    },
    180000
  );

  test(
    "project .it music is passed to smconv as-is, not re-run through mod2it",
    async () => {
      const fixtureDir = Path.join(PROJECTS, "Test_SoundEffects");
      const p = loadProject(fixtureDir);
      p.name = "SNESMUSICITTEST";
      p.settings = { ...p.settings, target: "snes" };

      // A temp project root with its own assets/music/*.it - keeps a real
      // binary fixture out of the repo (modToIt() is already independently
      // tested above; reused here only as a convenient, real way to get
      // valid IT bytes, not re-testing that conversion itself).
      const projectRoot = await fs.mkdtemp(Path.join(os.tmpdir(), "gbs-it-proj-"));
      await fs.copy(Path.join(fixtureDir, "assets"), Path.join(projectRoot, "assets"));
      const modBuf = await fs.readFile(
        Path.join(fixtureDir, "assets", "music", "template.mod")
      );
      const itBytes = modToIt(modBuf);
      await fs.writeFile(
        Path.join(projectRoot, "assets", "music", "template.it"),
        itBytes
      );
      p.music[0].filename = "template.it";

      p.scenes[0].script = [
        {
          command: "EVENT_MUSIC_PLAY",
          args: { musicId: p.music[0].id, loop: true },
        },
        { command: "EVENT_END" },
      ];

      const outputRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), "gbs-snes-music-it-")
      );
      const warnings = [];
      try {
        await buildProject(p, {
          projectRoot,
          outputRoot,
          progress: () => {},
          warnings: (m) => warnings.push(m),
        });

        const rom = await fs.readFile(
          Path.join(outputRoot, "build", "rom", "game.sfc")
        );
        expect(rom[0x7fd5]).toBe(0x30); // LoROM | FastROM

        // passed through byte-identical, not re-converted.
        const compiledIt = await fs.readFile(
          Path.join(outputRoot, "obj", "music", "mus0.it")
        );
        expect(compiledIt.equals(itBytes)).toBe(true);

        expect(
          warnings.filter((w) => /could not (convert|read)|not found/i.test(w))
        ).toEqual([]);
      } finally {
        await fs.remove(projectRoot);
        await fs.remove(outputRoot);
      }
    },
    180000
  );

  test(
    "a .it with a compressed sample stops the build with a clear error, not a crash (v4 fix)",
    async () => {
      // Real-world regression: smconv's own IT loader (itloader.cpp,
      // Sample::LoadData) never allocates a compressed sample's PCM buffer,
      // then falls through - a null-pointer access violation (observed:
      // exit code 3221225477 = 0xC0000005 on Windows) that takes the whole
      // soundbank build down, not just this one track. itValidate.js catches
      // this before the file ever reaches smconv and fails the build with a
      // normal, actionable Error instead.
      const fixtureDir = Path.join(PROJECTS, "Test_SoundEffects");
      const p = loadProject(fixtureDir);
      p.name = "SNESMUSICITCOMPRESSEDTEST";
      p.settings = { ...p.settings, target: "snes" };

      const projectRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), "gbs-it-compressed-proj-")
      );
      await fs.copy(
        Path.join(fixtureDir, "assets"),
        Path.join(projectRoot, "assets")
      );
      const modBuf = await fs.readFile(
        Path.join(fixtureDir, "assets", "music", "template.mod")
      );
      const itBytes = Buffer.from(modToIt(modBuf));
      setSampleCompressed(itBytes, 0);
      await fs.writeFile(
        Path.join(projectRoot, "assets", "music", "template.it"),
        itBytes
      );
      p.music[0].filename = "template.it";

      p.scenes[0].script = [
        {
          command: "EVENT_MUSIC_PLAY",
          args: { musicId: p.music[0].id, loop: true },
        },
        { command: "EVENT_END" },
      ];

      const outputRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), "gbs-snes-music-it-compressed-")
      );
      try {
        await expect(
          buildProject(p, {
            projectRoot,
            outputRoot,
            progress: () => {},
            warnings: () => {},
          })
        ).rejects.toThrow(/IT compression/i);
      } finally {
        await fs.remove(projectRoot);
        await fs.remove(outputRoot);
      }
    },
    180000
  );

  test(
    "a .it saved without instruments stops the build with a clear error, not a silent, unplayable track (v4 fix)",
    async () => {
      // Real-world regression (user-found, confirmed with a real PVSnesLib
      // sample for comparison): an .it with InstrumentCount 0 ("old"/
      // sample-direct mode) builds and links with no error or warning, but
      // the track is permanently silent in-game - confirmed via real Mesen
      // SPC-voice state (every voice stayed at envVolume 0 the whole time
      // this track "played", while PVSnesLib's own pollen8.it example
      // through this exact pipeline shows real voices ramping up). Root
      // cause confirmed from smconv's own upstream source: the compiled
      // soundbank's per-instrument pointer table is built 1:1 from the
      // source file's own InstrumentCount, so InstrumentCount 0 means every
      // slot is written as the "no instrument" placeholder - there is
      // nothing for any pattern cell to ever resolve to. itValidate.js
      // catches this before the file ever reaches smconv.
      const fixtureDir = Path.join(PROJECTS, "Test_SoundEffects");
      const p = loadProject(fixtureDir);
      p.name = "SNESMUSICITNOINSTRUMENTSTEST";
      p.settings = { ...p.settings, target: "snes" };

      const projectRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), "gbs-it-noinstruments-proj-")
      );
      await fs.copy(
        Path.join(fixtureDir, "assets"),
        Path.join(projectRoot, "assets")
      );
      await fs.writeFile(
        Path.join(projectRoot, "assets", "music", "template.it"),
        noInstrumentIt()
      );
      p.music[0].filename = "template.it";

      p.scenes[0].script = [
        {
          command: "EVENT_MUSIC_PLAY",
          args: { musicId: p.music[0].id, loop: true },
        },
        { command: "EVENT_END" },
      ];

      const outputRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), "gbs-snes-music-it-noinstruments-")
      );
      try {
        await expect(
          buildProject(p, {
            projectRoot,
            outputRoot,
            progress: () => {},
            warnings: () => {},
          })
        ).rejects.toThrow(/without instruments/i);
      } finally {
        await fs.remove(projectRoot);
        await fs.remove(outputRoot);
      }
    },
    180000
  );
});
