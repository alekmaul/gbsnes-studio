import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import entitiesActions from "../../store/features/entities/entitiesActions";
import getSpriteAnimations from "../../lib/helpers/spriteAnimations";
import SpriteSheetCanvas from "../world/SpriteSheetCanvas";
import { FormSectionTitle } from "../ui/form/FormLayout";
import { Button } from "../ui/buttons/Button";
import { PlusIcon, CloseIcon } from "../ui/icons/Icons";
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
// Editor-only frame curation (user request, scoped down from full parity
// with GB Studio 3.2.1's tile-composition system): each box references an
// EXISTING absolute frame index (0..numFrames-1) from the sheet's own
// strip, via SpriteSheetCanvas's rawFrame prop - "+" appends the next
// strip frame, clicking a box removes it. This edits and persists
// SpriteSheet.animationFrames, but does not change compiled ROM behaviour
// (scene.c has no per-animation frame table) - see
// appData/src/snes/EVENTS.md and the plan this was scoped against.
const SpriteFramesPanel: FC<SpriteFramesPanelProps> = ({
  id,
  animationIndex,
  sidebarWidth,
}) => {
  const dispatch = useDispatch();
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
  const customFrames = spriteSheet.animationFrames?.[animationIndex];
  const frames = customFrames || animation.frames;

  const onAdd = () => {
    const last = frames[frames.length - 1];
    const nextFrame =
      last === undefined ? 0 : (last + 1) % Math.max(1, spriteSheet.numFrames);
    dispatch(
      entitiesActions.addAnimationFrame({
        spriteSheetId: id,
        animationIndex,
        frame: nextFrame,
      })
    );
  };

  const onRemove = (position: number) => {
    dispatch(
      entitiesActions.removeAnimationFrame({
        spriteSheetId: id,
        animationIndex,
        position,
      })
    );
  };

  return (
    <div className="SpriteFramesPanel" style={{ left: sidebarWidth + 10 }}>
      <FormSectionTitle>
        {l10n("FIELD_FRAMES_FOR", { name: animation.name })}
        <Button
          variant="transparent"
          size="small"
          onClick={onAdd}
          title={l10n("FIELD_ADD_STATE")}
        >
          <PlusIcon />
        </Button>
      </FormSectionTitle>
      <div className="SpriteFramesPanel__Frames">
        {frames.map((frame, position) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={position}
            className="SpriteFramesPanel__Frame"
            onClick={() => onRemove(position)}
            title={l10n("FIELD_REMOVE")}
          >
            <SpriteSheetCanvas spriteSheetId={id} rawFrame={frame} />
            <CloseIcon />
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpriteFramesPanel;
