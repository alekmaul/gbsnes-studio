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
export const RETRYABLE_CODES = ["EPERM", "EBUSY", "EACCES"];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Generic retry-with-exponential-backoff around any fs operation that can
// hit the transient-lock codes above. Shared by writeFileWithRetry (below)
// and writeFileAtomic.js (which retries both the temp-file write and the
// rename-over-destination step independently).
export const retryOnTransientFsError = async (
  fn,
  attempts = 12,
  baseDelayMs = 200,
  maxDelayMs = 2000
) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
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

// NOTE: kept for existing call sites, but writeFileAtomic.js (which writes
// to a fresh temp path and renames it over the destination, rather than
// repeatedly re-opening the exact path something else just wrote) is the
// preferred fix for this bug class now - see its own header comment for
// why a longer retry budget on this function alone (v1.1.7) still wasn't
// enough (user-confirmed against the real packaged v1.1.7 Windows build).
const writeFileWithRetry = (path, data, options, attempts, baseDelayMs, maxDelayMs) =>
  retryOnTransientFsError(
    () => fs.writeFile(path, data, options),
    attempts,
    baseDelayMs,
    maxDelayMs
  );

export default writeFileWithRetry;
