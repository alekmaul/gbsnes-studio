import l10n from "./l10n";

// Named-animation labels over this engine's existing, purely file-width-
// derived frame convention (snesgfx.js imageToSpriteData / scene.c
// actor_render_tile+frames_len_for - neither changed by this module, just
// named). GB Studio 3.2.1 has a real, independently-editable per-animation
// frame list (its own Metasprite/tile-composition system); this fork has no
// pixel/canvas editor to back that, so getSpriteAnimations is read-only -
// it labels the frames a sprite sheet's own PNG width already produces, it
// does not let a project define new ones.
//
// getSpriteAnimations(type, numFrames) -> [{ name, direction, frameCount }].
// `direction` + a 0..frameCount-1 `frame` are exactly the props
// SpriteSheetCanvas/its worker (src/components/world/SpriteSheetCanvas.*)
// already take to render one thumbnail (directionToFrame in gbstudio.js
// resolves them the same way described below), so no separate rendering
// path is needed to preview an animation's frames.
//
// - "actor" (3 frames): one pose per direction, no walk cycle - down/up/side
//   in that file order (side flips for the opposite direction, same as the
//   engine). 3 animations, 1 frame each.
// - "actor_animated" (6 frames): two walk-cycle poses per direction, laid
//   out [down-a, down-b, up-a, up-b, side-a, side-b]. 6 animations: an
//   "Idle <direction>" (1 frame, pose A) and a "Moving <direction>" (2
//   frames, poses A+B) per direction - Idle and Moving in the same
//   direction share their first physical frame, exactly like the engine's
//   own render logic (idle is not separate art from the first walk pose).
// - "static" / "animated" (1-6 frames, no direction): a single "Idle"
//   animation covering every frame (matches a duck's 2-frame auto-cycle, a
//   torch's 4-frame cycle, or a static 1-frame sprite).
const getSpriteAnimations = (type, numFrames) => {
  if (type === "actor") {
    return [
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_DOWN") }), direction: "down", frameCount: 1 },
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_UP") }), direction: "up", frameCount: 1 },
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_RIGHT") }), direction: "right", frameCount: 1 },
    ];
  }
  if (type === "actor_animated") {
    return [
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_DOWN") }), direction: "down", frameCount: 1 },
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_UP") }), direction: "up", frameCount: 1 },
      { name: l10n("FIELD_IDLE_DIR", { direction: l10n("FIELD_DIRECTION_RIGHT") }), direction: "right", frameCount: 1 },
      { name: l10n("FIELD_MOVING_DIR", { direction: l10n("FIELD_DIRECTION_DOWN") }), direction: "down", frameCount: 2 },
      { name: l10n("FIELD_MOVING_DIR", { direction: l10n("FIELD_DIRECTION_UP") }), direction: "up", frameCount: 2 },
      { name: l10n("FIELD_MOVING_DIR", { direction: l10n("FIELD_DIRECTION_RIGHT") }), direction: "right", frameCount: 2 },
    ];
  }
  return [{ name: l10n("FIELD_IDLE"), direction: "down", frameCount: Math.max(1, numFrames || 1) }];
};

export default getSpriteAnimations;
