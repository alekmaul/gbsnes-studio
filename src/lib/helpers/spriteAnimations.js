import l10n from "./l10n";

// Named-animation labels over this engine's existing, purely file-width-
// derived frame convention (snesgfx.js imageToSpriteData / scene.c
// actor_render_tile+frames_len_for - neither changed by this module, just
// named). GB Studio 3.2.1 composes each frame from individually
// repositionable tiles (a real Metasprite system); this fork's sprite
// sheets are already a plain strip of N 16x16 frames, so "which frames
// belong to this animation" is just a list of absolute frame indices
// (0..numFrames-1) into that strip - no pixel/canvas tool needed to
// reference an *existing* frame, unlike composing new art.
//
// getSpriteAnimations(type, numFrames) -> [{ name, frames: number[] }]
// `frames` is the DEFAULT list this animation would show absent any
// project-level customisation (SpriteSheet.animationFrames, entitiesState.ts)
// - a project can override it per-animation via the editor's Frames panel
// (an editor-only curation of *existing* strip frames; it does not change
// what the compiled ROM plays - see appData/src/snes/EVENTS.md).
//
// - "actor" (3 frames): one pose per direction, no walk cycle - down/up/side
//   in that file order (side flips for the opposite direction, same as the
//   engine). 3 animations, 1 frame each: frame 0/1/2.
// - "actor_animated" (6 frames): two walk-cycle poses per direction, laid
//   out [down-a, down-b, up-a, up-b, side-a, side-b] (frames 0-5). 6
//   animations: an "Idle <direction>" (1 frame, pose A) and a
//   "Moving <direction>" (2 frames, poses A+B) per direction - Idle and
//   Moving in the same direction share their first physical frame, exactly
//   like the engine's own render logic (idle is not separate art from the
//   first walk pose).
// - "static" / "animated" (1-6 frames, no direction): a single "Idle"
//   animation covering every frame 0..numFrames-1 (matches a duck's 2-frame
//   auto-cycle, a torch's 4-frame cycle, or a static 1-frame sprite).
const getSpriteAnimations = (type, numFrames) => {
  if (type === "actor") {
    return [
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_DOWN") }), frames: [0] },
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_UP") }), frames: [1] },
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_RIGHT") }), frames: [2] },
    ];
  }
  if (type === "actor_animated") {
    return [
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_DOWN") }), frames: [0] },
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_UP") }), frames: [2] },
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_RIGHT") }), frames: [4] },
      { name: l10n("FIELD_MOVING_DIR", { direction: l10n("FIELD_DIRECTION_DOWN") }), frames: [0, 1] },
      { name: l10n("FIELD_MOVING_DIR", { direction: l10n("FIELD_DIRECTION_UP") }), frames: [2, 3] },
      { name: l10n("FIELD_MOVING_DIR", { direction: l10n("FIELD_DIRECTION_RIGHT") }), frames: [4, 5] },
    ];
  }
  const count = Math.max(1, numFrames || 1);
  return [
    {
      name: l10n("FIELD_IDLE"),
      frames: Array.from({ length: count }, (_, i) => i),
    },
  ];
};

export default getSpriteAnimations;
