import fs from "fs-extra";
import os from "os";
import Path from "path";
import { parseMod, modToIt } from "../../../src/lib/compiler/mod2it";
import compileSnesMusic from "../../../src/lib/compiler/compileSnesMusic";
import buildProject from "../../../src/lib/compiler/buildProject";
import { buildToolsRoot } from "../../../src/consts";

const PROJECTS = Path.join(__dirname, "..", "..", "projects");
const MOD = Path.join(PROJECTS, "Test_SoundEffects", "assets", "music", "template.mod");

// ---- mod2it: pure converter, always runs -------------------------------------
describe("mod2it", () => {
  const modBuf = fs.readFileSync(MOD);

  test("parseMod reads a 4-channel M.K. module", () => {
    const mod = parseMod(modBuf);
    expect(mod.samples).toHaveLength(31);
    expect(mod.numPatterns).toBeGreaterThan(0);
    expect(mod.usedOrders.length).toBeGreaterThan(0);
    // every order points at a real pattern
    mod.usedOrders.forEach(o => expect(o).toBeLessThan(mod.numPatterns));
    // at least one sample carries PCM
    expect(mod.samples.some(s => s.pcm && s.pcm.length > 0)).toBe(true);
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
const vendored = Path.join(
  buildToolsRoot,
  `${process.platform}-${process.arch}`,
  "pvsneslib"
);
const maybe = fs.existsSync(vendored) ? describe : describe.skip;

maybe("compileSnesMusic (smconv) + buildProject", () => {
  test(
    "project .mod music -> regenerated soundbank -> bootable ROM",
    async () => {
      const dir = Path.join(PROJECTS, "Test_SoundEffects");
      const gbs = fs.readdirSync(dir).find(x => x.endsWith(".gbsproj"));
      const p = JSON.parse(fs.readFileSync(Path.join(dir, gbs), "utf8"));
      p.name = "SNESMUSICTEST";
      p.settings = { ...p.settings, target: "snes" };
      // force the first scene to play the project's own track
      p.scenes[0].script = [
        {
          command: "EVENT_MUSIC_PLAY",
          args: { musicId: p.music[0].id, loop: true }
        },
        { command: "EVENT_END" }
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
          warnings: m => warnings.push(m)
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
          warnings.filter(w => /could not convert|not found/i.test(w))
        ).toEqual([]);
      } finally {
        await fs.remove(outputRoot);
      }
    },
    180000
  );

  test("no project music is a no-op (keeps the committed soundbank)", async () => {
    const outputRoot = await fs.mkdtemp(
      Path.join(os.tmpdir(), "gbs-snes-nomusic-")
    );
    try {
      await compileSnesMusic({
        music: [],
        projectRoot: PROJECTS,
        buildRoot: outputRoot,
        progress: () => {},
        warnings: () => {}
      });
      // nothing was written
      expect(fs.existsSync(Path.join(outputRoot, "res", "soundbank.bnk"))).toBe(
        false
      );
    } finally {
      await fs.remove(outputRoot);
    }
  });
});
