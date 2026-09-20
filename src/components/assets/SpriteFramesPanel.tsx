import React, { FC } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import getSpriteAnimations from "../../lib/helpers/spriteAnimations";
import SpriteSheetCanvas from "../world/SpriteSheetCanvas";
import { FormSectionTitle } from "../ui/form/FormLayout";
import l10n from "../../lib/helpers/l10n";

interface SpriteFramesPanelProps {
  id: string;
  animationIndex: number;
  sidebarWidth: number;
}

// Docked over the right-hand content area, next to the big sprite preview
// (ImageViewer) rather than crammed into the narrow left file-list column -
// user-found: frame thumbnails need real room, not the left sidebar.
//
// Read-only, by design: an earlier pass let "+"/click add or remove a
// frame reference, editor-only (it never changed compiled ROM behaviour -
// scene.c has no per-animation frame table). On review that didn't hold
// up - for a directional (actor/actor_animated) sheet the engine hardcodes
// exactly 1 idle frame and 2 moving frames, so editing the list there
// could never do anything the compiled game would honour; for an Idle-only
// sheet it could only reorder/repeat/drop frames the PNG already has, not
// add real new content. Removed rather than leave a control that implies
// capability the engine doesn't have - see appData/src/snes/EVENTS.md.
const SpriteFramesPanel: FC<SpriteFramesPanelProps> = ({
  id,
  animationIndex,
  sidebarWidth,
}) => {
  const spriteSheet = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );

  if (!spriteSheet) {
    return null;
  }

  const animations = getSpriteAnimations(spriteSheet.type, spriteSheet.numFrames);
  const animation = animations[Math.min(animationIndex, animations.length - 1)];
  if (!animation) {
    return null;
  }

  return (
    <div className="SpriteFramesPanel" style={{ left: sidebarWidth + 10 }}>
      <FormSectionTitle>
        {l10n("FIELD_FRAMES_FOR", { name: animation.name })}
      </FormSectionTitle>
      <div className="SpriteFramesPanel__Frames">
        {animation.frames.map((frame) => (
          <div key={frame} className="SpriteFramesPanel__Frame">
            <SpriteSheetCanvas spriteSheetId={id} rawFrame={frame} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpriteFramesPanel;
