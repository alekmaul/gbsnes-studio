import { detectClassic } from "../../src/lib/sprite/detect";
import { DetectedSprite } from "../../src/lib/sprite/detect";

// The source image frame shown by each frame of an animation
const sourceFrames = (detected: DetectedSprite, animationIndex: number) =>
  detected.spriteAnimations[animationIndex].frames.map((frameId) => {
    const metasprite = detected.metasprites.find((m) => m.id === frameId)!;
    const tile = detected.metaspriteTiles.find(
      (t) => t.id === metasprite.tiles[0]
    );
    return tile ? tile.sliceX / 16 : null;
  });

const allSourceFrames = (detected: DetectedSprite) =>
  detected.spriteAnimations.map((_, i) => sourceFrames(detected, i));

test("detects a 6 frame sheet as multi direction with movement", () => {
  const detected = detectClassic(96);
  expect(detected.state.animationType).toBe("multi_movement");
  expect(detected.state.flipLeft).toBe(true);
  // right, left, up, down idle then moving; left mirrors right
  expect(allSourceFrames(detected)).toEqual([
    [4],
    [null],
    [2],
    [0],
    [5, 4],
    [null],
    [3, 2],
    [1, 0],
  ]);
});

test("detects a 3 frame sheet as multi direction", () => {
  const detected = detectClassic(48);
  expect(detected.state.animationType).toBe("multi");
  expect(sourceFrames(detected, 0)).toEqual([2]);
  expect(sourceFrames(detected, 2)).toEqual([1]);
  expect(sourceFrames(detected, 3)).toEqual([0]);
});

test("detects other widths as one fixed animation", () => {
  const detected = detectClassic(64);
  expect(detected.state.animationType).toBe("fixed");
  expect(sourceFrames(detected, 0)).toEqual([0, 1, 2, 3]);
});

test("keeps an earlier frame list, with one metasprite per entry", () => {
  const detected = detectClassic(32, { frameSequence: [0, 1, 1, 7] });
  expect(sourceFrames(detected, 0)).toEqual([0, 1, 1]);
  expect(new Set(detected.spriteAnimations[0].frames).size).toBe(3);
});

test("keeps an earlier fixed override on a 3 frame sheet", () => {
  const detected = detectClassic(48, { animationType: "fixed" });
  expect(detected.state.animationType).toBe("fixed");
  expect(sourceFrames(detected, 0)).toEqual([0, 1, 2]);
});
