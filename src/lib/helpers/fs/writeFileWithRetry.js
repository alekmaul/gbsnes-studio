import fs from "fs-extra";

// Windows-only class of bug (user-found: "EPERM: operation not permitted,
// open '...\\src\\assets.h'" building a SNES ROM) - ejectBuild.js wipes and
// recreates the whole build output directory on every build
// (rimraf -> ensureDir -> copy()), then buildProject.js immediately
// overwrites some of those just-created files again (assets.h/.c, the
// per-scene data.asm chunks, ...). On Windows, antivirus/Search Indexer
// routinely grabs a lock on a file right after it's created or modified to
// scan it - a plain fs.writeFile() landing in that window fails with EPERM
// even though nothing is actually wrong with the path or permissions.
// graceful-fs (which fs-extra is built on) only retries EMFILE/ENFILE, not
// EPERM, so this slips through untouched.
//
// A first version of this helper retried 5 times over a flat ~600ms total
// and still reproduced in the field (user-confirmed against the real
// v1.1.6 packaged Windows build, not a stale download - the release asset
// genuinely contained this fix). ejectBuild's "Copy core" step just wrote
// out the *entire* engine tree (upwards of a hundred files) in one go
// immediately beforehand, and a real-time AV scan of a freshly-written
// directory that size can hold a lock for multiple seconds, not
// milliseconds - 600ms was never going to be enough. Backing off
// exponentially (200ms, 400ms, 800ms, ... capped at 2s/step) across many
// more attempts gives it up to ~20s of real headroom before giving up,
// still bounded so a genuinely broken path fails loudly rather than
// hanging forever. Does nothing on Linux/macOS (this error code doesn't
// happen there for this reason) and costs nothing when there's no lock.
const RETRYABLE_CODES = ["EPERM", "EBUSY", "EACCES"];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const writeFileWithRetry = async (
  path,
  data,
  options,
  attempts = 12,
  baseDelayMs = 200,
  maxDelayMs = 2000
) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fs.writeFile(path, data, options);
      return;
    } catch (e) {
      lastError = e;
      if (!RETRYABLE_CODES.includes(e.code) || i === attempts - 1) {
        throw e;
      }
      const waitMs = Math.min(baseDelayMs * 2 ** i, maxDelayMs);
      // eslint-disable-next-line no-await-in-loop
      await delay(waitMs);
    }
  }
  throw lastError;
};

export default writeFileWithRetry;
