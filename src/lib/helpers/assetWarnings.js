import l10n from "./l10n";
import { divisibleBy8 } from "./8bit";
import { getTarget } from "../compiler/targets";

/*
 * Editor-side sanity warnings for a background image, shown in the Backgrounds
 * page (components/assets/ImageViewer.js). The size bounds come from the
 * compile target: at least the screen, at most the scene tilemap. Game Boy and
 * SNES have different screens (160x144 vs 256x224), so a background that is
 * fine for one can be flagged for the other.
 */
export const backgroundWarnings = (file, targetId = "gb") => {
  const warnings = [];
  if (!file) {
    return warnings;
  }
  const target = getTarget(targetId);
  const minWidth = target.screenTileWidth * 8;
  const minHeight = target.screenTileHeight * 8;
  const maxWidth = target.maxBackgroundWidth;
  const maxHeight = target.maxBackgroundHeight;

  if (file.imageWidth < minWidth || file.imageHeight < minHeight) {
    warnings.push(
      l10n("WARNING_BACKGROUND_TOO_SMALL", {
        width: minWidth,
        height: minHeight
      })
    );
  }
  if (file.imageWidth > maxWidth || file.imageHeight > maxHeight) {
    warnings.push(
      l10n("WARNING_BACKGROUND_TOO_LARGE", {
        width: maxWidth,
        height: maxHeight
      })
    );
  }
  if (!divisibleBy8(file.imageWidth) || !divisibleBy8(file.imageHeight)) {
    warnings.push(l10n("WARNING_BACKGROUND_NOT_MULTIPLE_OF_8"));
  }
  return warnings;
};

export default backgroundWarnings;
