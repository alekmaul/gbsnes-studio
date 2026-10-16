import fs from "fs-extra";
import path from "path";
import uuid from "uuid/v4";
import loadAllBackgroundData from "./loadBackgroundData";
import loadAllSpriteData from "./loadSpriteData";
import loadAllMusicData from "./loadMusicData";
import loadAllFontData from "./loadFontData";
import loadAllEmoteData from "./loadEmoteData";
import loadAllSfxData from "./loadSfxData";
import migrateProject from "./migrateProject";
import { indexByFn, indexBy } from "../helpers/array";
import { setDefault } from "../helpers/setDefault";

const elemKey = (elem) => {
  return (elem.plugin ? `${elem.plugin}/` : "") + elem.filename;
};

const indexByFilename = indexByFn(elemKey);
const indexByInode = indexBy("inode");

const sortByName = (a, b) => {
  const aName = a.name.toUpperCase();
  const bName = b.name.toUpperCase();
  if (aName < bName) {
    return -1;
  }
  if (aName > bName) {
    return 1;
  }
  return 0;
};

const loadProject = async (projectPath) => {
  const json = migrateProject(await fs.readJson(projectPath));

  const projectRoot = path.dirname(projectPath);

  const [backgrounds, sprites, music, fonts, emotes, soundEffects] = await Promise.all([
    loadAllBackgroundData(projectRoot),
    loadAllSpriteData(projectRoot),
    loadAllMusicData(projectRoot),
    loadAllFontData(projectRoot),
    loadAllEmoteData(projectRoot),
    loadAllSfxData(projectRoot),
  ]);

  // Merge stored backgrounds data with file system data.
  // User-found (M9.4 follow-up): this used to spread the FRESH file-scan
  // object first and the SAVED project-json object second with only `id`
  // picked off it (`{...background, id: oldBackground.id}`) - the opposite
  // of the correct merge direction. Every field only the editor itself can
  // author (not re-derivable from the asset file on disk) was silently
  // discarded on every single project load, unconditionally - reproduced
  // with a Free-form (Metasprite) sprite sheet, whose metaspriteMode/
  // canvasWidth/canvasHeight/metasprites/metaspriteTiles fields have no
  // file-system equivalent at all, so they reverted to defaults the moment
  // the project was reopened. The `music` block below already had to patch
  // around this exact same bug once before, for just its own `settings`
  // field (see its own comment) - never generalized until now. Fixed by
  // spreading the SAVED object first (preserving every custom field) and
  // the fresh file-scan object second (so file-derived fields like
  // filename/numFrames/type/inode/_v still get refreshed), matching the
  // already-correct merge direction `entitiesState.ts`'s own `loadSprite`/
  // `loadBackground`/etc. reducers use for an in-session asset rescan
  // (`{...existingAsset, ...payload.data, id: existingId}}`) - this file
  // was the one place that merge direction was never applied.
  const oldBackgroundByFilename = indexByFilename(json.backgrounds || []);
  const oldBackgroundByInode = indexByInode(json.backgrounds || []);

  const fixedBackgroundIds = backgrounds
    .map((background) => {
      const oldBackground = oldBackgroundByFilename[elemKey(background)] || oldBackgroundByInode[background.inode];
      if (oldBackground) {
        return {
          ...oldBackground,
          ...background,
          id: oldBackground.id,
        };
      }
      return background;
    })
    .sort(sortByName);

  // Merge stored sprite data with file system data - see the backgrounds
  // comment above for the full story (this is the exact field this bug was
  // actually found with: a Free-form sprite sheet's metaspriteMode/
  // canvasWidth/canvasHeight/metasprites/metaspriteTiles).
  const oldSpriteByFilename = indexByFilename(json.spriteSheets || []);
  const oldSpriteByInode = indexByInode(json.spriteSheets || []);

  const fixedSpriteIds = sprites
    .map((sprite) => {
      const oldSprite = oldSpriteByFilename[elemKey(sprite)] || oldSpriteByInode[sprite.inode];
      if (oldSprite) {
        return {
          ...oldSprite,
          ...sprite,
          id: oldSprite.id,
        };
      }
      return sprite;
    })
    .sort(sortByName);

  // Merge stored music data with file system data - see the backgrounds
  // comment above for the full story. The explicit `settings` override
  // below predates that general fix (it's the one field this exact bug was
  // already caught and patched around before) - kept as a redundant-but-
  // harmless explicit override now that the general direction is fixed too,
  // rather than assuming `track`'s own fresh scan never sets `settings`.
  const oldMusicByFilename = indexByFilename(json.music || []);
  const oldMusicByInode = indexByInode(json.music || []);

  const fixedMusicIds = music
    .map((track) => {
      const oldTrack = oldMusicByFilename[elemKey(track)] || oldMusicByInode[track.inode];
      if (oldTrack) {
        return {
          ...oldTrack,
          ...track,
          id: oldTrack.id,
          settings: {
            ...oldTrack.settings
          }
        };
      }
      return track;
    })
    .sort(sortByName);

  // Merge stored font data with file system data - see the backgrounds
  // comment above for the full story.
  const oldFontByFilename = indexByFilename(json.fonts || []);
  const oldFontByInode = indexByInode(json.fonts || []);

  const fixedFontIds = fonts
    .map((font) => {
      const oldFont = oldFontByFilename[elemKey(font)] || oldFontByInode[font.inode];
      if (oldFont) {
        return {
          ...oldFont,
          ...font,
          id: oldFont.id,
        };
      }
      return font;
    })
    .sort(sortByName);

  // Merge stored emote data with file system data - see the backgrounds
  // comment above for the full story.
  const oldEmoteByFilename = indexByFilename(json.emotes || []);
  const oldEmoteByInode = indexByInode(json.emotes || []);

  const fixedEmoteIds = emotes
    .map((emote) => {
      const oldEmote = oldEmoteByFilename[elemKey(emote)] || oldEmoteByInode[emote.inode];
      if (oldEmote) {
        return {
          ...oldEmote,
          ...emote,
          id: oldEmote.id,
        };
      }
      return emote;
    })
    .sort(sortByName);

  // Merge stored sound-effect data with file system data - see the
  // backgrounds comment above for the full story.
  const oldSfxByFilename = indexByFilename(json.soundEffects || []);
  const oldSfxByInode = indexByInode(json.soundEffects || []);

  const fixedSfxIds = soundEffects
    .map((sfx) => {
      const oldSfx = oldSfxByFilename[elemKey(sfx)] || oldSfxByInode[sfx.inode];
      if (oldSfx) {
        return {
          ...oldSfx,
          ...sfx,
          id: oldSfx.id,
        };
      }
      return sfx;
    })
    .sort(sortByName);

  const addMissingEntityId = (entity) => {
    if (!entity.id) {
      return {
        ...entity,
        id: uuid(),
      };
    }
    return entity;
  };

  // Fix ids on actors and triggers
  const fixedScenes = (json.scenes || []).map((scene) => {
    return {
      ...scene,
      actors: scene.actors.map(addMissingEntityId),
      triggers: scene.triggers.map(addMissingEntityId),
    };
  });

  const fixedCustomEvents = (json.customEvents || []).map(addMissingEntityId);

  const fixedEngineFieldValues = (json.engineFieldValues || []);

  return {
    ...json,
    backgrounds: fixedBackgroundIds,
    spriteSheets: fixedSpriteIds,
    music: fixedMusicIds,
    fonts: fixedFontIds,
    emotes: fixedEmoteIds,
    soundEffects: fixedSfxIds,
    scenes: fixedScenes,
    customEvents: fixedCustomEvents,
    engineFieldValues: fixedEngineFieldValues
  };
};

export default loadProject;
