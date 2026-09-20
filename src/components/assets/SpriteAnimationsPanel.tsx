import React, { FC, useEffect, useState } from "react";
import cx from "classnames";
import { useSelector } from "react-redux";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import getSpriteAnimations from "../../lib/helpers/spriteAnimations";
import SpriteSheetCanvas from "../world/SpriteSheetCanvas";
import { FormSectionTitle } from "../ui/form/FormLayout";
import l10n from "../../lib/helpers/l10n";

interface SpriteAnimationsPanelProps {
  id: string;
}

// Read-only "ANIMATIONS" + "FRAMES: <name>" panel, modelled on GB Studio
// 3.2.1's own sprite editor (see appData/src/snes/EVENTS.md's sibling doc
// and the plan for the real .gbsproj structure this was designed against).
// Not editable: this fork's frame layout is entirely derived from a sprite
// sheet's own PNG width (snesgfx.js) with no pixel/canvas tool to back an
// "add frame" action, so getSpriteAnimations is a pure label over the
// engine's existing convention - selecting an animation here never changes
// project data, only which frame thumbnails are shown below.
const SpriteAnimationsPanel: FC<SpriteAnimationsPanelProps> = ({ id }) => {
  const spriteSheet = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const animations = spriteSheet
    ? getSpriteAnimations(spriteSheet.type, spriteSheet.numFrames)
    : [];
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [id]);

  if (!spriteSheet || animations.length === 0) {
    return null;
  }

  const selected = animations[Math.min(selectedIndex, animations.length - 1)];

  return (
    <div>
      <FormSectionTitle>{l10n("FIELD_ANIMATIONS")}</FormSectionTitle>
      {animations.map((animation, index) => (
        <div
          key={animation.name}
          onClick={() => setSelectedIndex(index)}
          className={cx("FilesSidebar__ListItem", {
            "FilesSidebar__ListItem--Active": index === selectedIndex,
          })}
        >
          {animation.name}
        </div>
      ))}
      <FormSectionTitle>
        {l10n("FIELD_FRAMES_FOR", { name: selected.name })}
      </FormSectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", padding: "0 10px" }}>
        {Array.from({ length: selected.frameCount }).map((_, frame) => (
          <SpriteSheetCanvas
            // eslint-disable-next-line react/no-array-index-key
            key={frame}
            spriteSheetId={id}
            direction={selected.direction}
            frame={frame}
          />
        ))}
      </div>
    </div>
  );
};

export default SpriteAnimationsPanel;
