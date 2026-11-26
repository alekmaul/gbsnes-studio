// Sprite data in the system clipboard (formats of GB Studio 3.2.1)
import { clipboard } from "electron";
import {
  Metasprite,
  MetaspriteTile,
  SpriteAnimation,
  SpriteState,
} from "../entities/entitiesTypes";

export const ClipboardTypeMetaspriteTiles = "gbsnes.metaspritetiles";
export const ClipboardTypeMetasprites = "gbsnes.metasprites";
export const ClipboardTypeSpriteState = "gbsnes.spritestate";

export type SpriteClipboard =
  | {
      __type: typeof ClipboardTypeMetaspriteTiles;
      metaspriteTiles: MetaspriteTile[];
    }
  | {
      __type: typeof ClipboardTypeMetasprites;
      metasprites: Metasprite[];
      metaspriteTiles: MetaspriteTile[];
    }
  | {
      __type: typeof ClipboardTypeSpriteState;
      spriteState: SpriteState;
      animations: SpriteAnimation[];
      metasprites: Metasprite[];
      metaspriteTiles: MetaspriteTile[];
    };

export type SpriteClipboardFormat = SpriteClipboard["__type"];

const formats: string[] = [
  ClipboardTypeMetaspriteTiles,
  ClipboardTypeMetasprites,
  ClipboardTypeSpriteState,
];

export const writeSpriteClipboard = (data: SpriteClipboard) => {
  clipboard.writeText(JSON.stringify(data, null, 4));
};

export const readSpriteClipboard = (): SpriteClipboard | undefined => {
  try {
    const data = JSON.parse(clipboard.readText());
    return data && formats.includes(data.__type) ? data : undefined;
  } catch (e) {
    return undefined;
  }
};

export const readSpriteClipboardFormat = ():
  | SpriteClipboardFormat
  | undefined => readSpriteClipboard()?.__type;
