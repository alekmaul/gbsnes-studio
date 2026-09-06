import fs from "fs-extra";
import os from "os";
import Path from "path";
import buildProject from "../../../src/lib/compiler/buildProject";
import { snesEmulatorRoot, buildToolsRoot } from "../../../src/consts";

const DIR = Path.join(__dirname, "..", "..", "projects", "Test_ActorInvoke");

// The committed SNES web-player template is self-contained (no build needed).
describe("SNES web-player template", () => {
  test("index.html has the shell, start gate and touch pad; main.js persists SRAM", () => {
    const html = fs.readFileSync(
      Path.join(snesEmulatorRoot, "index.html"),
      "utf8"
    );
    expect(html).toMatch(/id="start_button"/);
    expect(html).toMatch(/id="pad"/);
    expect(html).toMatch(/data-btn="start"/);
    expect(html).toMatch(/___CUSTOM_CONTROLS___/); // still a placeholder pre-build

    const main = fs.readFileSync(
      Path.join(snesEmulatorRoot, "js", "main.js"),
      "utf8"
    );
    expect(main).toMatch(/localStorage/);
    expect(main).toMatch(/snes\.cart\.sram/);
    expect(main).toMatch(/setPointerCapture/); // touch pad multi-touch
    expect(main).toMatch(/function layoutScreen/); // JS sizing, not CSS aspect-ratio
  });

  test("css avoids features the in-app Chromium lacks (aspect-ratio, inset, flex gap)", () => {
    const css = fs.readFileSync(
      Path.join(snesEmulatorRoot, "css", "style.css"),
      "utf8"
    );
    expect(css).not.toMatch(/aspect-ratio\s*:/);
    expect(css).not.toMatch(/\binset\s*:/);
    // no `gap:` on the flex rows (margins are used instead)
    expect(css).not.toMatch(/^\s*gap\s*:/m);
  });
});

// Toolchain-gated: the full web export (needs buildSnesRom).
const vendored = Path.join(
  buildToolsRoot,
  `${process.platform}-${process.arch}`,
  "pvsneslib"
);
const maybe = fs.existsSync(vendored) ? describe : describe.skip;

maybe("buildProject (snes, web) end to end", () => {
  test(
    "templated player + ROM land in build/web",
    async () => {
      const gbs = fs.readdirSync(DIR).find(x => x.endsWith(".gbsproj"));
      const p = JSON.parse(fs.readFileSync(Path.join(DIR, gbs), "utf8"));
      p.name = "Web Player Demo";
      p.settings = {
        ...p.settings,
        target: "snes",
        customControlsUp: ["ArrowUp", "w"]
      };
      const outputRoot = await fs.mkdtemp(
        Path.join(os.tmpdir(), "gbs-snes-web-")
      );
      try {
        await buildProject(p, {
          buildType: "web",
          projectRoot: DIR,
          outputRoot,
          progress: () => {},
          warnings: () => {}
        });
        const web = Path.join(outputRoot, "build", "web");
        expect(fs.existsSync(Path.join(web, "rom", "game.sfc"))).toBe(true);
        expect(fs.existsSync(Path.join(web, "js", "main.js"))).toBe(true);
        const html = fs.readFileSync(Path.join(web, "index.html"), "utf8");
        expect(html).not.toMatch(/___(PROJECT_NAME|CUSTOM_CONTROLS)___/);
        expect(html).toMatch(/Web Player Demo/);
        expect(html).toMatch(/"up":\["ArrowUp","w"\]/);
      } finally {
        await fs.remove(outputRoot);
      }
    },
    180000
  );
});
