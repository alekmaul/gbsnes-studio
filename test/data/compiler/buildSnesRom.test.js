import fs from "fs-extra";
import os from "os";
import Path from "path";
import buildSnesRom, { filterLog } from "../../../src/lib/compiler/buildSnesRom";
import { engineRoot, buildToolsRoot } from "../../../src/consts";

const vendored = Path.join(
  buildToolsRoot,
  `${process.platform}-${process.arch}`,
  "pvsneslib"
);
const hasToolchain = fs.existsSync(vendored);

// Integration test: drives the real PVSnesLib toolchain, so it only runs on a
// platform that has the vendored toolchain checked in.
const maybe = hasToolchain ? describe : describe.skip;

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
        warnings: msg => warnings.push(msg)
      });

      expect(romPath).toBe(
        Path.join(buildRoot, "build", "rom", "game.sfc")
      );

      const rom = await fs.readFile(romPath);
      // 8 LoROM banks of 32 KB
      expect(rom.length).toBe(8 * 0x8000);

      // Internal header lives at $7FC0 for LoROM
      const title = rom.toString("ascii", 0x7fc0, 0x7fc0 + 21).replace(/\0+$/, "");
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
