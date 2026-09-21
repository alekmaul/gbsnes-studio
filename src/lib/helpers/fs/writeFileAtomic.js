import fs from "fs-extra";
import Path from "path";
import crypto from "crypto";
import { retryOnTransientFsError } from "./writeFileWithRetry";

// v1.1.6 and v1.1.7 both retried a *second* fs.writeFile() to the exact
// path ejectBuild.js's copy() had just written moments earlier (assets.h,
// assets.c, the per-scene .as data files - the engine template ships
// committed dummy versions of these, immediately overwritten with the
// real compiled content). Even v1.1.7's ~20s exponential backoff still
// reproduced the identical "EPERM: operation not permitted, open
// '...\\src\\assets.h'" on a real packaged Windows build (user-confirmed,
// same file, same error, after the longer retry budget shipped) - which
// rules out a simple "an AV scan clears eventually" race: repeatedly
// re-opening the exact same just-written path for writing never clears,
// no matter how long or how many times. The likely mechanism is a
// livelock, not a timing window - a real-time AV minifilter can re-flag a
// path as "needs scanning" on every open attempt it observes, including
// each of our own failed retries, so waiting longer never helps.
//
// The standard, well-established fix for this exact class of Windows
// EPERM (the same approach used by npm's own `write-file-atomic` package,
// and by tools like webpack for the same reason) is to never re-open the
// flagged destination path for writing at all: write the real content to
// a brand-new temp file next to it (a path nothing has touched or
// flagged before), then fs.rename() the temp file over the destination.
// A rename is a directory-entry move, not a content open-for-write, so it
// isn't subject to the same per-open content-scan hook - and even if a
// rename over an existing (possibly still-locked) destination hits a
// transient error too, it's retried independently.
const writeFileAtomic = async (
  path,
  data,
  options,
  { attempts, baseDelayMs, maxDelayMs } = {}
) => {
  const dir = Path.dirname(path);
  const base = Path.basename(path);
  const tmpPath = Path.join(
    dir,
    `.${base}.tmp-${crypto.randomBytes(6).toString("hex")}`
  );
  await retryOnTransientFsError(
    () => fs.writeFile(tmpPath, data, options),
    attempts,
    baseDelayMs,
    maxDelayMs
  );
  try {
    await retryOnTransientFsError(
      () => fs.rename(tmpPath, path),
      attempts,
      baseDelayMs,
      maxDelayMs
    );
  } catch (e) {
    await fs.remove(tmpPath).catch(() => {});
    throw e;
  }
};

export default writeFileAtomic;
