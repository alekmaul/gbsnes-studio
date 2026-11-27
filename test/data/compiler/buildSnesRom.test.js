import fs from "fs-extra";
import os from "os";
import Path from "path";
import buildSnesRom, {
  filterLog,
  makefileWithSettings,
  toolchainStamp,
} from "../../../src/lib/compiler/buildSnesRom";
import { engineRoot, pvsneslibVendorDir } from "../../../src/consts";

const vendored = pvsneslibVendorDir();
const hasToolchain = fs.existsSync(vendored);

// Integration test: drives the real PVSnesLib toolchain, so it only runs on a
// platform that has the vendored toolchain checked in.
const maybe = hasToolchain ? describe : describe.skip;

describe("toolchainStamp", () => {
  test("changes when a program or the library of the toolchain does", async () => {
    const root = await fs.mkdtemp(Path.join(os.tmpdir(), "gbs-stamp-"));
    const write = (file, content) =>
      fs.outputFile(Path.join(root, file), content);
    try {
      await write("devkitsnes/bin/816-tcc", "a");
      await write("devkitsnes/tools/816-opt", "b");
      await write("pvsneslib/lib/LoROM_FastROM/libc.obj", "c");
      const first = await toolchainStamp(root);
      expect(await toolchainStamp(root)).toBe(first);

      await write("devkitsnes/tools/constify", "d");
      const added = await toolchainStamp(root);
      expect(added).not.toBe(first);

      await write("pvsneslib/lib/LoROM_FastROM/libc.obj", "longer");
      expect(await toolchainStamp(root)).not.toBe(added);
    } finally {
      await fs.remove(root);
    }
  });
});

describe("filterLog", () => {
  const ESC = String.fromCharCode(27);

  test("swallows the 816-opt version banner (printed on every file even with -q)", () => {
    expect(
      filterLog(`${ESC}[97m816opt${ESC}[0m: (2.0.0) version 20260818\r`)
    ).toBe("");
  });

  test("swallows the wla/wlalink box banner lines", () => {
    expect(filterLog("-----------------------------------")).toBe("");
    expect(filterLog("WLA-65816 Macro Assembler v9.11")).toBe("");
  });

  test("keeps real diagnostics, stripped of ANSI codes and leading path", () => {
    expect(filterLog("C:/tmp/build/src/game.c:42: warning: real thing")).toBe(
      "game.c:42: warning: real thing"
    );
  });
});

describe("makefileWithSettings", () => {
  const engineMakefile = () =>
    fs.readFileSync(Path.join(engineRoot, "snes", "Makefile"), "utf8");
  const options = {
    title: "My Game: \"one\" & two/three",
    fastrom: true,
    romSize: "0A",
    romBanks: 32,
    sramSize: "05",
    country: "02",
  };
  // the value make will see: one assignment each, before snes_rules
  const value = (makefile, name) => {
    const lines = makefile
      .split(/\r?\n/)
      .filter((l) => new RegExp(`^(export )?${name} *[:?]?=`).test(l));
    expect(lines.length).toBe(1);
    expect(makefile.indexOf(lines[0])).toBeLessThan(
      makefile.indexOf("include ${PVSNESLIB_HOME}")
    );
    return lines[0].split("=")[1].trim();
  };

  test("writes the project's cartridge settings into the engine Makefile", () => {
    const out = makefileWithSettings(engineMakefile(), options);
    expect(value(out, "ROMBANKS")).toBe("32");
    expect(value(out, "ROMSIZE")).toBe("0A");
    expect(value(out, "SRAMSIZE")).toBe("05");
    expect(value(out, "CARTRIDGETYPE")).toBe("02");
    expect(value(out, "COUNTRY")).toBe("02");
    expect(value(out, "FASTROM")).toBe("1");
    // nothing make or the shell would interpret
    expect(value(out, "ROMTITLE")).toBe("MY GAME:  ONE    TWO");
    expect(out).toContain("export ROMNAME  := game");
  });

  test("writes a ROM only, slow cartridge, and can be applied again", () => {
    const out = makefileWithSettings(
      makefileWithSettings(engineMakefile(), options),
      { ...options, fastrom: false, sramSize: "00" }
    );
    expect(value(out, "FASTROM")).toBe("0");
    expect(value(out, "CARTRIDGETYPE")).toBe("00");
    expect(value(out, "SRAMSIZE")).toBe("00");
  });

  test("leaves alone a Makefile without snes_rules", () => {
    expect(makefileWithSettings("all:\n\techo\n", options)).toBeNull();
  });
});

maybe("buildSnesRom", () => {
  let buildRoot;

  beforeAll(async () => {
    buildRoot = await fs.mkdtemp(Path.join(os.tmpdir(), "gbs-snes-"));
    await fs.copy(Path.join(engineRoot, "snes"), buildRoot);
  });

  afterAll(async () => {
    if (buildRoot) await fs.remove(buildRoot);
  });

  test(
    "builds the engine skeleton into a bootable LoROM/FastROM .sfc",
    async () => {
      const warnings = [];
      const { romPath } = await buildSnesRom({
        buildRoot,
        data: { name: "SNESBUILDTEST", settings: {} },
        progress: () => {},
        warnings: (msg) => warnings.push(msg),
      });

      expect(romPath).toBe(Path.join(buildRoot, "build", "rom", "game.sfc"));

      const rom = await fs.readFile(romPath);
      // 8 LoROM banks of 32 KB
      expect(rom.length).toBe(8 * 0x8000);

      // Internal header lives at $7FC0 for LoROM
      const title = rom
        .toString("ascii", 0x7fc0, 0x7fc0 + 21)
        .replace(/\0+$/, "");
      expect(title.trim()).toBe("SNESBUILDTEST");

      // Map mode byte: $20 LoROM | $10 FastROM
      expect(rom[0x7fd5]).toBe(0x30);

      // The symbol file should have been produced and de-colon'd for Mesen
      const sym = await fs.readFile(
        Path.join(buildRoot, "build", "rom", "game.sym"),
        "utf8"
      );
      expect(sym).toMatch(/\bmain\b/);
      expect(sym).not.toMatch(/^[0-9a-f]{6}:/im);
    },
    120000
  );
});
