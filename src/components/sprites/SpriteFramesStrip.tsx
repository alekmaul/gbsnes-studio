import React, { FC } from "react";
import { useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import SpriteSheetCanvas from "../world/SpriteSheetCanvas";
import { SplitPaneHeader } from "../ui/splitpane/SplitPaneHeader";
import l10n from "../../lib/helpers/l10n";

// Center column, bottom: a read-only breakdown of the sheet's own real raw
// frames (rawFrame bypasses the direction-based convention - see
// SpriteSheetCanvas.worker.ts's own comment), purely for visual confirmation.
// Not editable - this engine has no per-frame tile placement to edit.
// See SPRITE_EDITOR_PROGRESS.md.

const Wrapper = styled.div`
  flex-shrink: 0;
  border-top: 1px solid ${(props) => props.theme.colors.sidebar.border};
  background: ${(props) => props.theme.colors.sidebar.well.background};
`;

const Strip = styled.div`
  display: flex;
  gap: 6px;
  padding: 8px 14px 10px;
`;

const Chip = styled.div`
  width: 28px;
  height: 28px;
  border: 1px solid ${(props) => props.theme.colors.sidebar.border};

  canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
`;

interface SpriteFramesStripProps {
  id: string;
}

export const SpriteFramesStrip: FC<SpriteFramesStripProps> = ({ id }) => {
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );

  if (!sprite) {
    return null;
  }

  const frames = Array.from({ length: sprite.numFrames }, (_, i) => i);

  return (
    <Wrapper>
      <SplitPaneHeader collapsed={false}>
        {l10n("FIELD_SPRITE_FRAMES")}
      </SplitPaneHeader>
      <Strip>
        {frames.map((rawFrame) => (
          <Chip key={rawFrame}>
            <SpriteSheetCanvas spriteSheetId={id} rawFrame={rawFrame} />
          </Chip>
        ))}
      </Strip>
    </Wrapper>
  );
};
