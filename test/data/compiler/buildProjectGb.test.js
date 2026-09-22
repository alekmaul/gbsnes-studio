import fs from "fs-extra";
import Path from "path";

jest.mock("electron", () => {
  const app = { getPath: () => require("os").tmpdir(), getLocale: () => "en" };
  return { app, remote: { app } };
});
// User-found: on Windows, real failures always land under C:\tmp\<guid>\...
// (getTmp.js's own fallback path, used when the real Electron temp path has
// a space, contains ".itch", or is too long), not the default per-user
// AppData\Local\Temp. Force that same base path here to reproduce
// faithfully - but only on win32: C:\tmp isn't a valid/portable path on
// Linux/macOS, and this test's own toolchain gate (`maybe`, below) means it
// genuinely runs on every platform that has a vendored GBDK toolchain, not
// Windows only - hardcoding C:\tmp unconditionally broke CI's Linux test
// job outright (exit 127 - a real regression from this test itself, not
// from the code it's testing).
// jest.mock()'s factory can't reference an outer-scope const
// (babel-plugin-jest-hoist forbids it), so the platform check is inlined
// here rather than factored into a shared TMP_BASE constant.
jest.mock("../../../src/lib/helpers/getTmp", () => () => {
  const base =
    global.process.platform === "win32" ? "C:\\tmp" : require("os").tmpdir();
  require("fs-extra").ensureDirSync(base);
  return base;
});

// eslint-disable-next-line import/first
import buildProject from "../../../src/lib/compiler/buildProject";
// eslint-disable-next-line import/first
import { buildToolsRoot } from "../../../src/consts";

const PROJECTS = Path.join(__dirname, "..", "..", "projects");

// Real, permanent end-to-end coverage for the GB target - unlike SNES
// (compileSnesMusic.test.js etc.), no such test existed before this
// session, and writing it caught two real, previously undiscovered bugs
// that no amount of unit testing would have: buildMakeBat.js hardcoded a
// stale relative lcc path ("..\_gbs\gbdk\bin\lcc") that never followed the
// "-v2"/"-v3" toolchain cache renames, and makeBuild.js spawned "make.bat"
// by bare name, which only resolves via Windows' cwd search - disabled by
// the documented NoDefaultCurrentDirectoryInExePath security hardening
// setting (confirmed set on a real test machine here). Both are fixed now;
// both went unnoticed because manual testing kept getting stopped earlier
// by the game.h/data_ptrs.c EPERM bugs, and no automated test had ever
// exercised a real `make.bat` run all the way through before this one.
const vendored = `${buildToolsRoot}/${process.platform}-${process.arch}/gbdk`;
const maybe = fs.existsSync(vendored) ? describe : describe.skip;

maybe("buildProject (gb) - real toolchain end to end", () => {
  test(
    "a project with its own music builds to a bootable game.gb",
    async () => {
      const dir = Path.join(PROJECTS, "Test_SoundEffects");
      const gbs = fs.readdirSync(dir).find(x => x.endsWith(".gbsproj"));
      const data = JSON.parse(fs.readFileSync(Path.join(dir, gbs), "utf8"));
      data.name = "GBBUILDTEST";
      // GB target is the default (no settings.target override).

      // Match buildGame.js's real construction exactly: Path.normalize(`${getTmp()}/${buildUUID}`)
      const uuid = require("crypto").randomBytes(16).toString("hex");
      const tmpBase = process.platform === "win32" ? "C:\\tmp" : require("os").tmpdir();
      const outputRoot = Path.normalize(`${tmpBase}/${uuid}`);
      const warnings = [];
      try {
        await buildProject(data, {
          projectRoot: dir,
          outputRoot,
          progress: () => {},
          warnings: m => warnings.push(m)
        });

        const rom = await fs.readFile(Path.join(outputRoot, "build", "rom", "game.gb"));
        expect(rom.length).toBeGreaterThan(0);
        // A real GB ROM header: the Nintendo logo bytes at 0x104 always
        // start 0xCE 0xED 0x66 0x66.
        expect(rom.slice(0x104, 0x108)).toEqual(
          Buffer.from([0xce, 0xed, 0x66, 0x66])
        );

        // The exact writes that hit real Windows EPERM bugs actually landed:
        // game.h and data_ptrs.c both reflect real, non-placeholder content.
        const gameHeader = await fs.readFile(
          Path.join(outputRoot, "include", "game.h"),
          "utf8"
        );
        expect(gameHeader).toMatch(/#define/);
        const dataPtrs = await fs.readFile(
          Path.join(outputRoot, "src", "data", "data_ptrs.c"),
          "utf8"
        );
        expect(dataPtrs).toMatch(/music_banks/);

        expect(warnings).toEqual([]);
      } finally {
        await fs.remove(outputRoot);
      }
    },
    180000
  );
});
