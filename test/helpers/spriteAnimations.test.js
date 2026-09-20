import getSpriteAnimations from "../../src/lib/helpers/spriteAnimations";

test("a single-frame static sprite (e.g. sage) has one Idle animation of 1 frame", () => {
  const animations = getSpriteAnimations("static", 1);
  expect(animations).toEqual([
    { name: "Idle", direction: "down", frameCount: 1 },
  ]);
});

test("a 2-frame animated sprite (e.g. duck) has one Idle animation of 2 frames", () => {
  const animations = getSpriteAnimations("animated", 2);
  expect(animations).toEqual([
    { name: "Idle", direction: "down", frameCount: 2 },
  ]);
});

test("a 4-frame animated sprite (e.g. a torch) has one Idle animation of 4 frames", () => {
  const animations = getSpriteAnimations("animated", 4);
  expect(animations).toEqual([
    { name: "Idle", direction: "down", frameCount: 4 },
  ]);
});

test("a 3-frame actor sheet has one 1-frame idle animation per direction, no walk cycle", () => {
  const animations = getSpriteAnimations("actor", 3);
  expect(animations).toEqual([
    { name: "Idle Down", direction: "down", frameCount: 1 },
    { name: "Idle Up", direction: "up", frameCount: 1 },
    { name: "Idle Right", direction: "right", frameCount: 1 },
  ]);
});

test("a 6-frame actor_animated sheet has Idle (1 frame) and Moving (2 frames) per direction, sharing their first frame", () => {
  const animations = getSpriteAnimations("actor_animated", 6);
  expect(animations).toEqual([
    { name: "Idle Down", direction: "down", frameCount: 1 },
    { name: "Idle Up", direction: "up", frameCount: 1 },
    { name: "Idle Right", direction: "right", frameCount: 1 },
    { name: "Moving Down", direction: "down", frameCount: 2 },
    { name: "Moving Up", direction: "up", frameCount: 2 },
    { name: "Moving Right", direction: "right", frameCount: 2 },
  ]);
  // Idle and Moving in the same direction start from the same physical
  // frame (frame 0 of that direction) - the engine has no separate idle
  // art, this must stay honest about that rather than implying 9 distinct
  // frames like GB Studio 3.2.1's own default player sprite.
  expect(animations[0].direction).toBe(animations[3].direction);
});

test("an unrecognised/undefined type falls back to a single Idle animation", () => {
  expect(getSpriteAnimations(undefined, 1)).toEqual([
    { name: "Idle", direction: "down", frameCount: 1 },
  ]);
});
