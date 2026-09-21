import fs from "fs-extra";

// Windows-only class of bug (user-found: "EPERM: operation not permitted,
// open '...\\src\\assets.h'" building a SNES ROM) - ejectBuild.js wipes and
// recreates the whole build output directory on every build
// (rimraf -> ensureDir -> copy()), then buildProject.js immediately
// overwrites some of those just-created files again (assets.h/.c, the
// per-scene data.asm chunks, ...). On Windows, antivirus/Search Indexer
// routinely grabs a brief lock on a file right after it's created or
// modified to scan it - a plain fs.writeFile() landing in that window
// fails with EPERM even though nothing is actually wrong with the path or
// permissions. graceful-fs (which fs-extra is built on) only retries
// EMFILE/ENFILE, not EPERM, so this slips through untouched. A short
// retry-with-backoff is the standard, well-established workaround other
// Node.js build tools (webpack, electron-builder, ...) use for this exact
// situation - it does nothing on Linux/macOS (this error code doesn't
// happen there for this reason) and costs nothing when there's no lock.
const RETRYABLE_CODES = ["EPERM", "EBUSY", "EACCES"];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const writeFileWithRetry = async (path, data, options, attempts = 5, delayMs = 150) => {
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
      // eslint-disable-next-line no-await-in-loop
      await delay(delayMs);
    }
  }
  throw lastError;
};

export default writeFileWithRetry;
