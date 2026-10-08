import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import cx from "classnames";
import { RootState } from "../../store/configureStore";
import entitiesActions from "../../store/features/entities/entitiesActions";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import { Button } from "../ui/buttons/Button";
import { NumberField } from "../ui/form/NumberField";
import { PlusIcon, CloseIcon } from "../ui/icons/Icons";
import l10n from "../../lib/helpers/l10n";

interface SpriteAnimationTimelineProps {
  spriteSheetId: string;
  animationStateId: string;
  subStateId: string;
  selectedFrameId?: string;
  onSelectFrame: (frameId: string) => void;
}

// Bottom timeline: every frame in the selected sub-state, in order, each a
// small clickable chip (tile count shown as a quick at-a-glance summary - a
// real pixel thumbnail would need the same source-image compositing
// SpriteEditorCanvas already does; not duplicated here for this first
// draft). "+" appends a new empty frame (addSpriteFrame); each chip's own
// "x" removes just that frame (removeSpriteFrame, a no-op on the last
// remaining one - see that reducer's own comment). The Speed field is a
// bulk setter (setSpriteSubStateFrameDuration) - "global speed" per the
// spec, not a per-frame override UI (each frame's own durationMs is still
// the real stored value, so a future per-frame control remains possible
// without a data-model change).
export const SpriteAnimationTimeline: FC<SpriteAnimationTimelineProps> = ({
  spriteSheetId,
  animationStateId,
  subStateId,
  selectedFrameId,
  onSelectFrame,
}) => {
  const dispatch = useDispatch();
  const spriteSheet = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, spriteSheetId)
  );
  const animationState = spriteSheet?.animationStates?.find(
    (a) => a.id === animationStateId
  );
  const subState = animationState?.subStates.find((s) => s.id === subStateId);

  if (!subState) {
    return null;
  }

  const frames = subState.frames;
  // Only meaningful to show a single value when every frame already shares
  // one - otherwise leave the field blank rather than implying a uniform
  // speed that isn't actually there.
  const uniformDuration = frames.every((f) => f.durationMs === frames[0].durationMs)
    ? frames[0].durationMs
    : undefined;

  const onAddFrame = () => {
    dispatch(
      entitiesActions.addSpriteFrame({ spriteSheetId, animationStateId, subStateId })
    );
  };

  const onRemoveFrame = (frameId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(
      entitiesActions.removeSpriteFrame({
        spriteSheetId,
        animationStateId,
        subStateId,
        frameId,
      })
    );
  };

  const onChangeDuration = (e: React.ChangeEvent<HTMLInputElement>) => {
    const durationMs = parseInt(e.currentTarget.value, 10);
    if (Number.isNaN(durationMs) || durationMs <= 0) {
      return;
    }
    dispatch(
      entitiesActions.setSpriteSubStateFrameDuration({
        spriteSheetId,
        animationStateId,
        subStateId,
        durationMs,
      })
    );
  };

  return (
    <div className="SpriteAnimationTimeline">
      <div className="SpriteAnimationTimeline__Frames">
        {frames.map((frame, index) => (
          <div
            key={frame.id}
            onClick={() => onSelectFrame(frame.id)}
            className={cx("SpriteAnimationTimeline__Frame", {
              "SpriteAnimationTimeline__Frame--Active": frame.id === selectedFrameId,
            })}
          >
            <span className="SpriteAnimationTimeline__FrameIndex">{index + 1}</span>
            <span className="SpriteAnimationTimeline__FrameTileCount">
              {frame.tiles.length}
            </span>
            <button
              type="button"
              className="SpriteAnimationTimeline__FrameRemove"
              onClick={onRemoveFrame(frame.id)}
              title={l10n("FIELD_REMOVE")}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
        <Button
          variant="transparent"
          size="small"
          onClick={onAddFrame}
          title={l10n("FIELD_ADD_FRAME")}
        >
          <PlusIcon />
        </Button>
      </div>
      <div className="SpriteAnimationTimeline__Speed">
        <NumberField
          name="subStateFrameDuration"
          label={l10n("FIELD_SPEED")}
          value={uniformDuration}
          placeholder={l10n("FIELD_SPEED")}
          min={10}
          onChange={onChangeDuration}
        />
      </div>
    </div>
  );
};
