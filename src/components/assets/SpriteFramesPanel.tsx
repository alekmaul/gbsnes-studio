import React, { FC } from "react";
import SpriteSheetCanvas from "../world/SpriteSheetCanvas";
import { FormSectionTitle } from "../ui/form/FormLayout";
import l10n from "../../lib/helpers/l10n";
import { SpriteAnimation } from "./SpriteAnimationsPanel";

interface SpriteFramesPanelProps {
  id: string;
  animation: SpriteAnimation;
  sidebarWidth: number;
}

// Docked over the right-hand content area, next to the big sprite preview
// (ImageViewer) rather than crammed into the narrow left file-list column -
// user-found: frame thumbnails need real room, not the left sidebar.
const SpriteFramesPanel: FC<SpriteFramesPanelProps> = ({
  id,
  animation,
  sidebarWidth,
}) => {
  return (
    <div
      className="SpriteFramesPanel"
      style={{ left: sidebarWidth + 10 }}
    >
      <FormSectionTitle>
        {l10n("FIELD_FRAMES_FOR", { name: animation.name })}
      </FormSectionTitle>
      <div className="SpriteFramesPanel__Frames">
        {Array.from({ length: animation.frameCount }).map((_, frame) => (
          <SpriteSheetCanvas
            // eslint-disable-next-line react/no-array-index-key
            key={frame}
            spriteSheetId={id}
            direction={animation.direction}
            frame={frame}
          />
        ))}
      </div>
    </div>
  );
};

export default SpriteFramesPanel;
