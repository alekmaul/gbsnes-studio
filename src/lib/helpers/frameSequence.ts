import { SpriteSheet } from "../../store/features/entities/entitiesTypes";

// Editable frame list on normal (non-Free-form) sprite sheets - the editor
// side of SpriteSheet.frameSequence. Must mirror what compileSnesData.js
// and snesgfx.js's detectActorFrameCountAndType actually compile.

export const MAX_SEQUENCE_FRAMES = 6;

type FrameSheet = Pick<
  SpriteSheet,
  "numFrames" | "animationType" | "metaspriteMode" | "frameSequence"
>;

// A static auto-cycle sheet: "Fixed", or auto-detected (anything but the
// 3/6-frame directional widths). Directional and Free-form sheets keep their
// fixed frame meaning.
export const isFrameSequenceEligible = (sheet: FrameSheet): boolean => {
  if (sheet.metaspriteMode) return false;
  if (sheet.animationType === "fixed") return true;
  if (sheet.animationType) return false;
  return sheet.numFrames !== 3 && sheet.numFrames !== 6;
};

// How many of the PNG's frames the compiler keeps (detectActorFrameCountAndType):
// 2-6 frames are all kept, 1 frame or more than 6 keep only frame 0.
export const imageFrameCount = (sheet: FrameSheet): number =>
  sheet.numFrames >= 2 && sheet.numFrames <= MAX_SEQUENCE_FRAMES ? sheet.numFrames : 1;

// The frames that actually play, as PNG frame indices.
export const effectiveFrameSequence = (sheet: FrameSheet): number[] => {
  const available = imageFrameCount(sheet);
  const all = Array.from({ length: available }, (_, i) => i);
  if (!isFrameSequenceEligible(sheet) || !sheet.frameSequence) return all;
  const seq = sheet.frameSequence
    .filter((f) => Number.isInteger(f) && f >= 0 && f < available)
    .slice(0, MAX_SEQUENCE_FRAMES);
  return seq.length > 0 ? seq : all;
};
