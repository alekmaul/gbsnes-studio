import ScripTracker from "../../../../src/lib/vendor/scriptracker/scriptracker";

// jsdom has no real AudioContext, so the constructor logs an error and returns early - but
// notePeriodsGB (and every prototype method) is still usable on the resulting instance, which is
// all getPeriodForNote needs.
describe("ScripTracker.getPeriodForNote", () => {
  const player = new ScripTracker();

  test("an in-range note (0-71) returns the table's own value unchanged - no behaviour change for existing content", () => {
    for (let note = 0; note < player.notePeriodsGB.length; note++) {
      expect(player.getPeriodForNote(note)).toBe(player.notePeriodsGB[note]);
    }
  });

  test("a note past the table's end extrapolates instead of returning undefined/NaN", () => {
    // Real-world regression: a project .it used notes up to 79 (more than half its notes fell
    // past index 71), which previously read notePeriodsGB[79] -> undefined -> NaN pitch -> the
    // whole channel went permanently silent.
    const period = player.getPeriodForNote(79);
    expect(Number.isFinite(period)).toBe(true);
    expect(Number.isNaN(period)).toBe(false);
  });

  test("extrapolation is continuous at the table boundary (no pitch jump/seam)", () => {
    const lastIndex = player.notePeriodsGB.length - 1;
    expect(player.getPeriodForNote(lastIndex)).toBe(player.notePeriodsGB[lastIndex]);

    const freqAt = (period) => (131072 * 1.8) / (2048 - period);
    const freqLast = freqAt(player.getPeriodForNote(lastIndex));
    const freqNext = freqAt(player.getPeriodForNote(lastIndex + 1));
    const freqOctaveUp = freqAt(player.getPeriodForNote(lastIndex + 12));

    // One semitone up should be a small step, not a discontinuity.
    expect(freqNext).toBeGreaterThan(freqLast);
    expect(freqNext / freqLast).toBeLessThan(1.1);
    // A full octave (12 semitones) up should be almost exactly double, matching the same
    // equal-tempered relationship the table's own values already follow.
    expect(freqOctaveUp / freqLast).toBeCloseTo(2, 1);
  });

  test("pitch keeps rising monotonically well past the old table ceiling", () => {
    let previous = player.getPeriodForNote(70);
    for (let note = 71; note <= 96; note++) {
      const period = player.getPeriodForNote(note);
      expect(period).toBeGreaterThan(previous);
      previous = period;
    }
  });
});
