import fs from "fs-extra";
import path from "path";
import uuid from "uuid/v4";
import loadAllBackgroundData from "./loadBackgroundData";
import loadAllSpriteData from "./loadSpriteData";
import loadAllMusicData from "./loadMusicData";
import loadAllFontData from "./loadFontData";
import loadAllEmoteData from "./loadEmoteData";
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

  const [backgrounds, sprites, music, fonts, emotes] = await Promise.all([
    loadAllBackgroundData(projectRoot),
    loadAllSpriteData(projectRoot),
    loadAllMusicData(projectRoot),
    loadAllFontData(projectRoot),
    loadAllEmoteData(projectRoot),
  ]);

  // Merge stored backgrounds data with file system data
  const oldBackgroundByFilename = indexByFilename(json.backgrounds || []);
  const oldBackgroundByInode = indexByInode(json.backgrounds || []);

  const fixedBackgroundIds = backgrounds
    .map((background) => {
      const oldBackground = oldBackgroundByFilename[elemKey(background)] || oldBackgroundByInode[background.inode];
      if (oldBackground) {
        return {
          ...background,
          id: oldBackground.id,
        };
      }
      return background;
    })
    .sort(sortByName);

  // Merge stored sprite data with file system data
  const oldSpriteByFilename = indexByFilename(json.spriteSheets || []);
  const oldSpriteByInode = indexByInode(json.spriteSheets || []);

  const fixedSpriteIds = sprites
    .map((sprite) => {
      const oldSprite = oldSpriteByFilename[elemKey(sprite)] || oldSpriteByInode[sprite.inode];
      if (oldSprite) {
        return {
          ...sprite,
          id: oldSprite.id,
        };
      }
      return sprite;
    })
    .sort(sortByName);

  // Merge stored music data with file system data
  const oldMusicByFilename = indexByFilename(json.music || []);
  const oldMusicByInode = indexByInode(json.music || []);

  const fixedMusicIds = music
    .map((track) => {
      const oldTrack = oldMusicByFilename[elemKey(track)] || oldMusicByInode[track.inode];
      if (oldTrack) {
        return {
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

  // Merge stored font data with file system data
  const oldFontByFilename = indexByFilename(json.fonts || []);
  const oldFontByInode = indexByInode(json.fonts || []);

  const fixedFontIds = fonts
    .map((font) => {
      const oldFont = oldFontByFilename[elemKey(font)] || oldFontByInode[font.inode];
      if (oldFont) {
        return {
          ...font,
          id: oldFont.id,
        };
      }
      return font;
    })
    .sort(sortByName);

  // Merge stored emote data with file system data
  const oldEmoteByFilename = indexByFilename(json.emotes || []);
  const oldEmoteByInode = indexByInode(json.emotes || []);

  const fixedEmoteIds = emotes
    .map((emote) => {
      const oldEmote = oldEmoteByFilename[elemKey(emote)] || oldEmoteByInode[emote.inode];
      if (oldEmote) {
        return {
          ...emote,
          id: oldEmote.id,
        };
      }
      return emote;
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
    scenes: fixedScenes,
    customEvents: fixedCustomEvents,
    engineFieldValues: fixedEngineFieldValues
  };
};

export default loadProject;
