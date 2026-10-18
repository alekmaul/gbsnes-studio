import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import entitiesActions from "../../store/features/entities/entitiesActions";
import editorActions from "../../store/features/editor/editorActions";
import { SplitPaneHeader } from "../ui/splitpane/SplitPaneHeader";
import { Button } from "../ui/buttons/Button";
import l10n from "../../lib/helpers/l10n";
import { SpriteSheet } from "../../store/features/entities/entitiesTypes";

// M9 (SPRITE_EDITOR_PROGRESS.md) - center column, bottom: switches which
// frame MetaspriteCanvas is editing.
//
// User-found gap, traced to this whole effort's very first request ("how
// can I add a frame... for example explosion"): frame count used to be
// entirely derived from animationType with no way to grow it. Real
// addition, scoped to exactly the one case where growing it makes sense:
// "fixed" (SPRITE_STATIC, auto-cycle, no directional meaning) - "multi"/
// "multi_movement" stay locked at their real 3/6 poses, since adding a
// "5th direction" has no engine meaning. A "fixed" metasprite sheet's frame
// count comes from metasprites.length directly (freely extensible via
// addMetaspriteFrame/removeMetaspriteFrame below) instead of
// SpriteSheet.numFrames - numFrames is recomputed from the real PNG's
// pixel width on every asset rescan (confirmed in loadSpriteData.js), so
// anything stored there would silently revert on the next project reload;
// metasprites.length is never touched by that scan.

// Mirrors snesgfx.js's detectActorFrameCountAndType (the real compiled
// frame count) closely enough for editor display purposes - not imported
// directly since that module is Node-side (getPixels etc.), not browser-safe.
const frameCountFor = (sprite: SpriteSheet) => {
  if (sprite.animationType === "multi") {
    const sheetFrames = sprite.numFrames || 1;
    return sheetFrames >= 3 ? 3 : sheetFrames;
  }
  if (sprite.animationType === "multi_movement") {
    const sheetFrames = sprite.numFrames || 1;
    return sheetFrames >= 6 ? 6 : sheetFrames;
  }
  if (sprite.animationType === "fixed") {
    // Free-form frame count once metaspriteMode is on - see this file's
    // own header comment for why numFrames can't be the source of truth
    // here. Falls back to numFrames when metasprites hasn't been touched
    // yet (a freshly-switched-on sheet), matching the old auto behaviour
    // until the author actually adds/removes a frame.
    if (sprite.metaspriteMode && sprite.metasprites) {
      return Math.max(1, sprite.metasprites.length);
    }
    return sprite.numFrames || 1;
  }
  const sheetFrames = sprite.numFrames || 1;
  if (sheetFrames === 6) return 6;
  if (sheetFrames === 3) return 3;
  if (sheetFrames >= 2 && sheetFrames <= 6) return sheetFrames;
  return 1;
};

// Only "fixed" sheets get real add/remove-frame controls - see this file's
// own header comment for why "multi"/"multi_movement" don't.
const canEditFrameCount = (sprite: SpriteSheet) => sprite.animationType === "fixed";

const Wrapper = styled.div`
  height: 70px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid ${(props) => props.theme.colors.sidebar.border};
`;

const Strip = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  overflow-x: auto;
`;

interface ChipProps {
  selected?: boolean;
}

const Chip = styled.div<ChipProps>`
  width: 40px;
  height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  color: ${(props) =>
    props.selected ? props.theme.colors.highlightText : props.theme.colors.secondaryText};
  background: ${(props) =>
    props.selected ? props.theme.colors.highlight : "transparent"};
  border: 1px solid
    ${(props) =>
      props.selected ? props.theme.colors.highlight : props.theme.colors.sidebar.border};
`;

interface MetaspriteFramesTimelineProps {
  id: string;
  animStateId?: string;
}

export const MetaspriteFramesTimeline: FC<MetaspriteFramesTimelineProps> = ({
  id,
  animStateId,
}) => {
  const dispatch = useDispatch();
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const frameIndex = useSelector(
    (state: RootState) => state.editor.selectedMetaspriteFrameIndex
  );

  if (!sprite) {
    return null;
  }

  // Named animation states (v4 follow-up) - an AnimState's own frame count
  // is ALWAYS free-form (metasprites.length), regardless of its own
  // animationType choice: confirmed directly in compileSnesData.js's own
  // packFrames/stateDirEntries - framesLen there is always
  // convStates[s].metaspriteFrames.length, never capped at 3/6 the way a
  // plain sheet's "multi"/"multi_movement" frame count is. So unlike the
  // sheet-level frameCountFor/canEditFrameCount below (which still has to
  // reproduce the sheet's own real compiled frame-count rules), an
  // AnimState never needs that branching - always editable, always just
  // its own metasprites.length.
  const animState = animStateId
    ? sprite.animStates?.find((s) => s.id === animStateId)
    : undefined;
  const frameCount = animStateId
    ? Math.max(1, animState?.metasprites?.length || 1)
    : Math.max(1, frameCountFor(sprite));
  const frames = Array.from({ length: frameCount }, (_, i) => i);
  const editableFrameCount = animStateId ? true : canEditFrameCount(sprite);

  const onSelect = (i: number) => () => {
    dispatch(editorActions.setSelectedMetaspriteFrameIndex(i));
  };

  const onAddFrame = () => {
    dispatch(
      entitiesActions.addMetaspriteFrame({ spriteSheetId: id, animStateId })
    );
    // the new frame always lands at the end (frameCount, 0-indexed = the
    // array's new length - 1).
    dispatch(editorActions.setSelectedMetaspriteFrameIndex(frameCount));
  };

  const onRemoveFrame = () => {
    if (frameCount <= 1) {
      return;
    }
    dispatch(
      entitiesActions.removeMetaspriteFrame({
        spriteSheetId: id,
        animStateId,
        frameIndex,
      })
    );
    // keep the selection in bounds - removing the last frame should select
    // the new last frame, not fall off the end.
    if (frameIndex >= frameCount - 1) {
      dispatch(editorActions.setSelectedMetaspriteFrameIndex(frameCount - 2));
    }
  };

  return (
    <Wrapper>
      <SplitPaneHeader collapsed={false}>{l10n("FIELD_SPRITE_FRAMES")}</SplitPaneHeader>
      <Strip>
        {frames.map((i) => {
          const tileCount = animStateId
            ? animState?.metasprites?.[i]?.tiles.length || 0
            : sprite.metasprites?.[i]?.tiles.length || 0;
          return (
            <Chip key={i} selected={i === frameIndex} onClick={onSelect(i)}>
              {i + 1}
              {tileCount > 0 ? ` (${tileCount})` : ""}
            </Chip>
          );
        })}
        {editableFrameCount && (
          <Button
            size="small"
            variant="transparent"
            onClick={onAddFrame}
            title={l10n("FIELD_ADD_FRAME")}
          >
            +
          </Button>
        )}
        {editableFrameCount && frameCount > 1 && (
          <Button
            size="small"
            variant="transparent"
            onClick={onRemoveFrame}
            title={l10n("FIELD_REMOVE_FRAME")}
          >
            −
          </Button>
        )}
      </Strip>
    </Wrapper>
  );
};
