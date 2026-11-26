// Ported from GB Studio 3.2.1's src/lib/sprite/detect.ts (detectClassic and
// the blank-state creation from entitiesState.ts's
// fixAllSpritesWithMissingStates). One SNES difference: a classic 16x16
// frame is a single 16x16 hardware sprite here, where GB uses two 8x16 ones.
import uuid from "uuid";
import {
  animationIndexBySpriteType,
  filterAnimationsBySpriteType,
} from "../../components/sprites/helpers";
import {
  Metasprite,
  MetaspriteTile,
  SpriteAnimation,
  SpriteAnimationType,
  SpriteState,
} from "../../store/features/entities/entitiesTypes";

const FRAME_SIZE = 16;
const NUM_ANIMATIONS = 8;

export interface DetectedSprite {
  state: SpriteState;
  spriteAnimations: SpriteAnimation[];
  metasprites: Metasprite[];
  metaspriteTiles: MetaspriteTile[];
}

export interface DetectOptions {
  stateId?: string;
  // Settings saved by earlier versions of this fork's sprite editor
  animationType?: string;
  frameSequence?: number[];
}

const blankMetasprite = (): Metasprite => ({ id: uuid(), tiles: [] });

const emptyAnimations = (): SpriteAnimation[] =>
  Array.from(Array(NUM_ANIMATIONS)).map(() => ({ id: uuid(), frames: [] }));

// Every animation needs at least one frame
const fillEmptyAnimations = (
  animations: SpriteAnimation[],
  metasprites: Metasprite[]
) => {
  for (const animation of animations) {
    if (animation.frames.length === 0) {
      const metasprite = blankMetasprite();
      animation.frames.push(metasprite.id);
      metasprites.push(metasprite);
    }
  }
};

// Default state given to a sheet that can't be detected from its image
export const createBlankState = (stateId?: string): DetectedSprite => {
  const animations = emptyAnimations();
  const metasprites: Metasprite[] = [];
  fillEmptyAnimations(animations, metasprites);
  return {
    state: {
      id: stateId || uuid(),
      name: "",
      animationType: "multi_movement",
      flipLeft: true,
      animations: animations.map((a) => a.id),
    },
    spriteAnimations: animations,
    metasprites,
    metaspriteTiles: [],
  };
};

// Classic format: a single 16px high strip of 16x16 frames
export const detectClassic = (
  width: number,
  options: DetectOptions = {}
): DetectedSprite => {
  const numFrames = Math.floor(width / FRAME_SIZE);

  const animations = emptyAnimations();
  const metasprites: Metasprite[] = [];
  const metaspriteTiles: MetaspriteTile[] = [];

  // Each frame of an animation gets its own metasprite so that editing one
  // never changes another
  const addFrame = (animationIndex: number, frameIndex: number) => {
    const tile: MetaspriteTile = {
      id: uuid(),
      x: 0,
      y: 0,
      sliceX: frameIndex * FRAME_SIZE,
      sliceY: 0,
      size: 16,
      flipX: false,
      flipY: false,
      priority: false,
    };
    const metasprite: Metasprite = { id: uuid(), tiles: [tile.id] };
    metaspriteTiles.push(tile);
    metasprites.push(metasprite);
    animations[animationIndex].frames.push(metasprite.id);
  };

  let animationType: SpriteAnimationType = "fixed";
  let flipLeft = false;

  if (numFrames === 3 && options.animationType !== "fixed") {
    animationType = "multi";
    flipLeft = true;
    addFrame(0, 2);
    addFrame(2, 1);
    addFrame(3, 0);
  } else if (numFrames === 6 && options.animationType !== "fixed") {
    animationType = "multi_movement";
    flipLeft = true;
    // Idle
    addFrame(0, 4);
    addFrame(2, 2);
    addFrame(3, 0);
    // Moving
    addFrame(4, 5);
    addFrame(4, 4);
    addFrame(6, 3);
    addFrame(6, 2);
    addFrame(7, 1);
    addFrame(7, 0);
  } else {
    const sequence = (options.frameSequence || []).filter(
      (f) => Number.isInteger(f) && f >= 0 && f < numFrames
    );
    const frames = sequence.length
      ? sequence
      : Array.from({ length: numFrames }, (_, i) => i);
    frames.forEach((frameIndex) => addFrame(0, frameIndex));
  }

  fillEmptyAnimations(animations, metasprites);

  return {
    state: {
      id: options.stateId || uuid(),
      name: "",
      animationType,
      flipLeft,
      animations: animations.map((a) => a.id),
    },
    spriteAnimations: animations,
    metasprites,
    metaspriteTiles,
  };
};

// Frame ids shown by a state, in the order the editor lists its animations
export const visibleAnimationIds = (state: SpriteState): string[] =>
  filterAnimationsBySpriteType(
    state.animations,
    state.animationType,
    state.flipLeft
  );

export { animationIndexBySpriteType };
