import dedupeByKey from "../../src/lib/helpers/dedupeByKey";

// Regression: extracting a shared toolchain cache (GBDK via
// ensureBuildTools.js, PVSnesLib via buildSnesRom.js's resolvePvsHome())
// from more than one call site, or across overlapping builds, could have
// two calls independently start their own rmdir()/copy() against the exact
// same destination directory - a real Windows EPERM if one raced the
// other's still-open file handles (the same class of bug upstream GB
// Studio fixed in v4.2.1: "Fix for issue where Windows would attempt to
// remove tmp _gbsbuild while still keeping file handles open"). dedupeByKey
// makes concurrent calls for the same key share one in-flight promise
// instead of racing.
describe("dedupeByKey", () => {
  test("two concurrent calls for the same key share one execution", async () => {
    let calls = 0;
    const fn = () =>
      new Promise(resolve => {
        calls += 1;
        setTimeout(() => resolve("done"), 10);
      });

    const [a, b] = await Promise.all([
      dedupeByKey("same-key", fn),
      dedupeByKey("same-key", fn)
    ]);

    expect(calls).toBe(1);
    expect(a).toBe("done");
    expect(b).toBe("done");
  });

  test("different keys run independently", async () => {
    let calls = 0;
    const fn = () => {
      calls += 1;
      return Promise.resolve(calls);
    };

    const [a, b] = await Promise.all([
      dedupeByKey("key-a", fn),
      dedupeByKey("key-b", fn)
    ]);

    expect(calls).toBe(2);
    expect(a).not.toBe(b);
  });

  test("a later call for the same key, after the first has settled, runs again", async () => {
    let calls = 0;
    const fn = () => {
      calls += 1;
      return Promise.resolve(calls);
    };

    const first = await dedupeByKey("sequential-key", fn);
    const second = await dedupeByKey("sequential-key", fn);

    expect(calls).toBe(2);
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  test("a rejection is shared by concurrent callers and does not get stuck", async () => {
    let calls = 0;
    const fn = () => {
      calls += 1;
      return Promise.reject(new Error("boom"));
    };

    await expect(
      Promise.all([dedupeByKey("failing-key", fn), dedupeByKey("failing-key", fn)])
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);

    // The key is freed after settling (even on rejection) - a later call
    // for the same key must try again, not stay stuck on the old failure.
    await expect(dedupeByKey("failing-key", fn)).rejects.toThrow("boom");
    expect(calls).toBe(2);
  });
});
