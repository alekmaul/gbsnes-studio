import Path from "path";
import os from "os";
import fs from "fs-extra";
import makeBuild from "../../../src/lib/compiler/makeBuild";
import { buildToolsRoot } from "../../../src/consts";

// Regression (GB target only - the SNES pipeline is unaffected, it has its
// own separate build path): `new Promise(async (resolve, reject) => {...})`
// with no top-level try/catch is a well-known trap - if the async executor
// throws before calling resolve/reject, that rejection has nowhere to go and
// the outer Promise never settles. User-found on a real Windows VM: the
// build UI froze forever right after compileMusic.js's last progress() line,
// with nothing from makeBuild.js ever appearing - 0% CPU/disk, no error ever
// shown. Root cause: any throw inside makeBuild()'s async body (here, a
// missing include/game.h - buildRoot has no ejected GB engine tree at all)
// had nowhere to go. Verifies the fix: the returned Promise must reject (not
// hang) within the test timeout - it would have timed out against the old
// code.
const vendored = `${buildToolsRoot}/${process.platform}-${process.arch}/gbdk`;
const maybe = fs.existsSync(vendored) ? describe : describe.skip;

maybe("makeBuild", () => {
  test(
    "rejects instead of hanging forever when something inside throws before spawning",
    async () => {
      const buildRoot = fs.mkdtempSync(
        Path.join(os.tmpdir(), "gbs-makebuild-broken-")
      );
      try {
        await expect(
          makeBuild({
            buildRoot,
            data: { name: "Test", settings: {} },
            cartSize: 64,
            progress: () => {},
            warnings: () => {}
          })
        ).rejects.toBeDefined();
      } finally {
        fs.removeSync(buildRoot);
      }
    },
    180000
  );
});
