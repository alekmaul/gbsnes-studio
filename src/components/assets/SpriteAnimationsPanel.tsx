import React, { FC } from "react";
import cx from "classnames";
import { FormSectionTitle } from "../ui/form/FormLayout";
import l10n from "../../lib/helpers/l10n";

export interface SpriteAnimation {
  name: string;
  direction: string;
  frameCount: number;
}

interface SpriteAnimationsPanelProps {
  animations: SpriteAnimation[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

// Left-dock "ANIMATIONS" list only - a dumb, controlled list (selection
// lives in SpritesPage.js, which also needs it to know what to show in the
// FRAMES panel docked over on the right, next to the actual sprite preview
// image - see SpriteFramesPanel.tsx).
const SpriteAnimationsPanel: FC<SpriteAnimationsPanelProps> = ({
  animations,
  selectedIndex,
  onSelect,
}) => {
  if (animations.length === 0) {
    return null;
  }

  return (
    <div>
      <FormSectionTitle>{l10n("FIELD_ANIMATIONS")}</FormSectionTitle>
      {animations.map((animation, index) => (
        <div
          key={animation.name}
          onClick={() => onSelect(index)}
          className={cx("FilesSidebar__ListItem", {
            "FilesSidebar__ListItem--Active": index === selectedIndex,
          })}
        >
          {animation.name}
        </div>
      ))}
    </div>
  );
};

export default SpriteAnimationsPanel;
