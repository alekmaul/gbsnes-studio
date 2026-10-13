import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import editorActions from "../../store/features/editor/editorActions";
import { SplitPaneHeader } from "../ui/splitpane/SplitPaneHeader";
import l10n from "../../lib/helpers/l10n";
import { SpriteSheet } from "../../store/features/entities/entitiesTypes";

// M9 (SPRITE_EDITOR_PROGRESS.md) - center column, bottom: switches which
// frame MetaspriteCanvas is editing. A metaspriteMode sheet doesn't get its
// own separate frame-count concept (see entitiesTypes.ts's own comment on
// SpriteSheet.metaspriteMode) - frame count is still exactly what
// animationType says. No add/remove-frame controls here for that reason;
// clicking a frame that has no tiles yet just starts it empty
// (MetaspriteCanvas/addMetaspriteTile create the Metasprite record on
// demand).

// Mirrors snesgfx.js's detectActorFrameCountAndType (the real compiled
// frame count) closely enough for editor display purposes - not imported
// directly since that module is Node-side (getPixels etc.), not browser-safe.
const frameCountFor = (sprite: SpriteSheet) => {
  const sheetFrames = sprite.numFrames || 1;
  if (sprite.animationType === "multi") {
    return sheetFrames >= 3 ? 3 : sheetFrames;
  }
  if (sprite.animationType === "multi_movement") {
    return sheetFrames >= 6 ? 6 : sheetFrames;
  }
  if (sprite.animationType === "fixed") {
    return sheetFrames;
  }
  if (sheetFrames === 6) return 6;
  if (sheetFrames === 3) return 3;
  if (sheetFrames >= 2 && sheetFrames <= 6) return sheetFrames;
  return 1;
};

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
}

export const MetaspriteFramesTimeline: FC<MetaspriteFramesTimelineProps> = ({
  id,
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

  const frameCount = Math.max(1, frameCountFor(sprite));
  const frames = Array.from({ length: frameCount }, (_, i) => i);

  const onSelect = (i: number) => () => {
    dispatch(editorActions.setSelectedMetaspriteFrameIndex(i));
  };

  return (
    <Wrapper>
      <SplitPaneHeader collapsed={false}>{l10n("FIELD_SPRITE_FRAMES")}</SplitPaneHeader>
      <Strip>
        {frames.map((i) => {
          const tileCount = sprite.metasprites?.[i]?.tiles.length || 0;
          return (
            <Chip key={i} selected={i === frameIndex} onClick={onSelect(i)}>
              {i + 1}
              {tileCount > 0 ? ` (${tileCount})` : ""}
            </Chip>
          );
        })}
      </Strip>
    </Wrapper>
  );
};
