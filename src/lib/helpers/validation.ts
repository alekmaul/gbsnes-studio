import l10n from "./l10n";
import { divisibleBy8 } from "./8bit";
import { assetFilename } from "./gbstudio";
import snesgfx from "../compiler/snesgfx";
import target from "../compiler/targets";
import { Background } from "../../store/features/entities/entitiesTypes";

const MIN_IMAGE_WIDTH = target.screenTileWidth * 8;
const MIN_IMAGE_HEIGHT = target.screenTileHeight * 8;
const MAX_IMAGE_WIDTH = target.maxBackgroundWidth;
const MAX_IMAGE_HEIGHT = target.maxBackgroundHeight;
const MAX_TILESET_TILES = target.maxTilesetTiles;

interface BackgroundInfo {
  numTiles: number;
  warnings: string[];
}

export const getBackgroundInfo = async (
  background: Background,
  projectPath: string,
  precalculatedTilesetLength?: number
): Promise<BackgroundInfo> => {
  const warnings: string[] = [];

  let tilesetLength = precalculatedTilesetLength;
  if (!tilesetLength) {
    const filename = assetFilename(projectPath, "backgrounds", background);
    const conv = await snesgfx.imageToBGData(filename);
    tilesetLength = conv.tileCount;
  }

  if (
    background.imageWidth < MIN_IMAGE_WIDTH ||
    background.imageHeight < MIN_IMAGE_HEIGHT
  ) {
    warnings.push(l10n("WARNING_BACKGROUND_TOO_SMALL"));
  }
  if (background.imageWidth > MAX_IMAGE_WIDTH) {
    warnings.push(
      l10n("WARNING_BACKGROUND_TOO_WIDE", {
        width: background.imageWidth,
        maxWidth: MAX_IMAGE_WIDTH,
      })
    );
  }
  if (background.imageHeight > MAX_IMAGE_HEIGHT) {
    warnings.push(
      l10n("WARNING_BACKGROUND_TOO_TALL", {
        height: background.imageHeight,
        maxHeight: MAX_IMAGE_HEIGHT,
      })
    );
  }
  if (
    !divisibleBy8(background.imageWidth) ||
    !divisibleBy8(background.imageHeight)
  ) {
    warnings.push(l10n("WARNING_BACKGROUND_NOT_MULTIPLE_OF_8"));
  }
  if (tilesetLength > MAX_TILESET_TILES) {
    warnings.push(
      l10n("WARNING_BACKGROUND_TOO_MANY_TILES", {
        tilesetLength,
        maxTilesetLength: MAX_TILESET_TILES,
      })
    );
  }
  return {
    warnings,
    numTiles: tilesetLength,
  };
};
