import { normalize, denormalize, schema } from "normalizr";
import {
  ProjectEntitiesData,
  EntitiesState,
  EntityKey,
  SpriteSheet,
  SpriteSheetData,
  Metasprite,
  MetaspriteTile,
  SpriteAnimation,
  SpriteState,
} from "./entitiesTypes";
import { EntityId, Dictionary } from "@reduxjs/toolkit";

const backgroundSchema = new schema.Entity("backgrounds");
const musicSchema = new schema.Entity("music");
const actorSchema = new schema.Entity("actors");
const triggerSchema = new schema.Entity("triggers");
/*
// Normalise events
const eventSchema = new schema.Entity("events");
eventSchema.define({
  children: {
    true: [eventSchema],
    false: [eventSchema],
    script: [eventSchema]
  }
});
*/
const metaspriteTilesSchema = new schema.Entity("metaspriteTiles");
const metaspritesSchema = new schema.Entity("metasprites", {
  tiles: [metaspriteTilesSchema],
});
const spriteAnimationsSchema = new schema.Entity("spriteAnimations", {
  frames: [metaspritesSchema],
});
const spriteStatesSchema = new schema.Entity("spriteStates", {
  animations: [spriteAnimationsSchema],
});
const spriteSheetsSchema = new schema.Entity("spriteSheets", {
  states: [spriteStatesSchema],
});
const fontsSchema = new schema.Entity("fonts");
const emotesSchema = new schema.Entity("emotes");
const soundEffectsSchema = new schema.Entity("soundEffects");
const variablesSchema = new schema.Entity("variables");
const sceneSchema = new schema.Entity("scenes", {
  actors: [actorSchema],
  triggers: [triggerSchema],
  // script: [eventSchema],
});
const customEventsSchema = new schema.Entity("customEvents");
const engineFieldValuesSchema = new schema.Entity("engineFieldValues");

const projectSchema = {
  scenes: [sceneSchema],
  backgrounds: [backgroundSchema],
  music: [musicSchema],
  spriteSheets: [spriteSheetsSchema],
  fonts: [fontsSchema],
  emotes: [emotesSchema],
  soundEffects: [soundEffectsSchema],
  variables: [variablesSchema],
  customEvents: [customEventsSchema],
  engineFieldValues: [engineFieldValuesSchema]
};

type ProjectSchemaKey = keyof typeof projectSchema;

export const normalizeEntities = (projectData: ProjectEntitiesData) => {
  return normalize(projectData, projectSchema);
};

export const denormalizeEntities = (
  state: EntitiesState
): ProjectEntitiesData => {
  const input: Record<ProjectSchemaKey, EntityId[]> = {
    scenes: state.scenes.ids,
    backgrounds: state.backgrounds.ids,
    spriteSheets: state.spriteSheets.ids,
    customEvents: state.customEvents.ids,
    music: state.music.ids,
    fonts: state.fonts.ids,
    emotes: state.emotes.ids,
    soundEffects: state.soundEffects.ids,
    variables: state.variables.ids,
    engineFieldValues: state.engineFieldValues.ids,
  };
  const entities: Record<EntityKey, Dictionary<any>> = {
    actors: state.actors.entities,
    triggers: state.triggers.entities,
    scenes: state.scenes.entities,
    backgrounds: state.backgrounds.entities,
    spriteSheets: state.spriteSheets.entities,
    metasprites: state.metasprites.entities,
    metaspriteTiles: state.metaspriteTiles.entities,
    spriteAnimations: state.spriteAnimations.entities,
    spriteStates: state.spriteStates.entities,
    customEvents: state.customEvents.entities,
    music: state.music.entities,
    fonts: state.fonts.entities,
    emotes: state.emotes.entities,
    soundEffects: state.soundEffects.entities,
    variables: state.variables.entities,
    engineFieldValues: state.engineFieldValues.entities
  };
  return denormalize(input, projectSchema, entities);
};

export const denormalizeSprite = ({
  sprite,
  metasprites,
  metaspriteTiles,
  spriteAnimations,
  spriteStates,
}: {
  sprite: SpriteSheet;
  metasprites: Dictionary<Metasprite>;
  metaspriteTiles: Dictionary<MetaspriteTile>;
  spriteAnimations: Dictionary<SpriteAnimation>;
  spriteStates: Dictionary<SpriteState>;
}): SpriteSheetData => {
  const entities = {
    metasprites,
    metaspriteTiles,
    spriteAnimations,
    spriteStates,
  };
  return denormalize(sprite, spriteSheetsSchema, entities);
};

// 8x8 tiles of video memory the frames of a sprite sheet show, each picture
// counted once. The build may need fewer: it also reuses mirrored and
// identical pixels.
export const countSpriteSheetTiles = (
  entities: EntitiesState,
  spriteSheet?: SpriteSheet
): number => {
  const slices = new Map<string, number>();
  spriteSheet?.states?.forEach((stateId) => {
    entities.spriteStates.entities[stateId]?.animations.forEach((animId) => {
      entities.spriteAnimations.entities[animId]?.frames.forEach((frameId) => {
        entities.metasprites.entities[frameId]?.tiles.forEach((tileId) => {
          const tile = entities.metaspriteTiles.entities[tileId];
          if (tile) {
            slices.set(
              `${tile.sliceX},${tile.sliceY},${tile.size}`,
              tile.size === 16 ? 4 : 1
            );
          }
        });
      });
    });
  });
  return Array.from(slices.values()).reduce((total, n) => total + n, 0);
};
