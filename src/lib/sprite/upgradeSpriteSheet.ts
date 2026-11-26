// Gives a sprite sheet loaded from a project file the states/animations/
// frames structure of GB Studio 3.2.1, converting sheets saved without it.
import { createBlankState, DetectedSprite, detectClassic } from "./detect";
import {
  SpriteSheetData,
  SpriteStateData,
} from "../../store/features/entities/entitiesTypes";

// Settings of earlier versions of this fork's sprite editor which have no
// meaning any more
const OBSOLETE_KEYS = [
  "metaspriteMode",
  "metasprites",
  "metaspriteTiles",
  "animStates",
];

export const hasSpriteStates = (sheet: any): boolean =>
  Array.isArray(sheet.states) &&
  sheet.states.length > 0 &&
  sheet.states.every((state: any) => Array.isArray(state.animations));

export const toStateData = (detected: DetectedSprite): SpriteStateData => {
  const tiles = new Map(detected.metaspriteTiles.map((t) => [t.id, t]));
  const metasprites = new Map(
    detected.metasprites.map((m) => [
      m.id,
      { ...m, tiles: m.tiles.map((id) => tiles.get(id)!) },
    ])
  );
  const animations = new Map(
    detected.spriteAnimations.map((a) => [
      a.id,
      { ...a, frames: a.frames.map((id) => metasprites.get(id)!) },
    ])
  );
  return {
    ...detected.state,
    animations: detected.state.animations.map((id) => animations.get(id)!),
  };
};

const upgradeSpriteSheet = (sheet: any): SpriteSheetData => {
  const upgraded = { ...sheet };
  const needsStates = !hasSpriteStates(sheet);

  // Saved by the earlier editor: its canvas belonged to the removed settings
  if (needsStates) {
    OBSOLETE_KEYS.forEach((key) => delete upgraded[key]);
    const isClassic = sheet.height === 16;
    const detected = isClassic
      ? detectClassic(sheet.width, {
          animationType: sheet.animationType,
          frameSequence: sheet.frameSequence,
        })
      : createBlankState();
    upgraded.states = [toStateData(detected)];
    upgraded.canvasWidth = isClassic ? 16 : 32;
    upgraded.canvasHeight = isClassic ? 16 : 32;
  }

  return upgraded;
};

export default upgradeSpriteSheet;
