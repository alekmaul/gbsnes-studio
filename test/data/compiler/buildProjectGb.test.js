import fs from "fs-extra";
import os from "os";
import Path from "path";

jest.mock("electron", () => {
  const app = { getPath: () => require("os").tmpdir(), getLocale: () => "en" };
  return { app, remote: { app } };
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

      const outputRoot = await fs.mkdtemp(Path.join(os.tmpdir(), "gbs-gb-build-"));
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
