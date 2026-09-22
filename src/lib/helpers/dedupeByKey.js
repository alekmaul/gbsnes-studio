// Upstream GB Studio (v4.2.1, "Fix for issue where Windows would attempt to
// remove tmp _gbsbuild while still keeping file handles open") hit and
// fixed the same class of bug we've been chasing on both the GB and SNES
// sides here: extracting a vendored toolchain out of app.asar into a
// *shared*, persistent temp cache directory (reused across builds/app
// sessions) has more than one call site (ensureBuildTools.js for GBDK,
// buildSnesRom.js's resolvePvsHome() for PVSnesLib) and both had it their
// own way, so calling either again before a previous call to the SAME
// destination had finished (or before a previous build's spawned process
// still holding a file handle open somewhere under it had exited) could
// race a second rmdir()/copy() against the first - a real Windows EPERM
// (Windows won't let you delete/recreate something that's still open),
// not the antivirus/indexer theory earlier fixes here assumed. Their fix
// added in-flight-promise reuse; this is the same idea, factored out so
// both call sites share one implementation instead of two divergent ones.
const inFlight = new Map();

const dedupeByKey = (key, fn) => {
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
};

export default dedupeByKey;
