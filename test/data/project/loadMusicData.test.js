import fs from "fs-extra";
import os from "os";
import Path from "path";
import loadAllMusicData from "../../../src/lib/project/loadMusicData";

test("discovers both .mod and .it project music tracks", async () => {
  const projectRoot = await fs.mkdtemp(Path.join(os.tmpdir(), "gbs-loadmusic-"));
  const musicDir = Path.join(projectRoot, "assets", "music");
  await fs.ensureDir(musicDir);
  await fs.writeFile(Path.join(musicDir, "song.mod"), Buffer.from("fake mod"));
  await fs.writeFile(Path.join(musicDir, "tune.IT"), Buffer.from("fake it"));
  // a non-music file in the same directory must not be picked up
  await fs.writeFile(Path.join(musicDir, "notes.txt"), "not a track");

  try {
    const tracks = await loadAllMusicData(projectRoot);
    const names = tracks.map((t) => t.filename).sort();
    expect(names).toEqual(["song.mod", "tune.IT"]);
    // the display name has its extension stripped regardless of which one
    const byFilename = Object.fromEntries(tracks.map((t) => [t.filename, t.name]));
    expect(byFilename["song.mod"]).toBe("song");
    expect(byFilename["tune.IT"]).toBe("tune");
  } finally {
    await fs.remove(projectRoot);
  }
});
