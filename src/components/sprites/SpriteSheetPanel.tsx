import React, { FC, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import electronActions from "../../store/features/electron/electronActions";
import { assetFilename } from "../../lib/helpers/gbstudio";
import { Button } from "../ui/buttons/Button";
import { ZoomButton } from "../ui/buttons/ZoomButton";
import { SplitPaneHeader } from "../ui/splitpane/SplitPaneHeader";
import l10n from "../../lib/helpers/l10n";

// Center column, middle: the full raw sprite sheet PNG + an "Edit..." button,
// same mechanism src/components/assets/ImageViewer.js already uses for
// Backgrounds (electronActions.openFile opens the project's default external
// image editor). See SPRITE_EDITOR_PROGRESS.md.
//
// User-asked: a zoom control of its own, on the right of this panel's own
// header - deliberately local component state, not the shared
// state.editor.zoomSprite the app toolbar's own zoom button drives
// (SpritePreview.tsx/MetaspriteCanvas.tsx) - this strip shows the WHOLE
// sheet at once, a different sizing need than a single 16x16 frame, so
// sharing one zoom value between them would fight over what either one
// actually wants.

const ZOOM_MIN = 25;
const ZOOM_MAX = 800;
const ZOOM_STEP = 25;

const Wrapper = styled.div`
  flex-shrink: 0;
  border-top: 1px solid ${(props) => props.theme.colors.sidebar.border};
`;

const Body = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
`;

// max-height: user-asked, 64px taller than the original 48px so zooming the
// sheet in doesn't immediately add a scrollbar to it.
const Strip = styled.div`
  flex-shrink: 0;
  max-height: 112px;
  overflow: auto;
  border: 1px solid ${(props) => props.theme.colors.sidebar.border};

  img {
    display: block;
    image-rendering: pixelated;
  }
`;

const Name = styled.div`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: ${(props) => props.theme.colors.secondaryText};
`;

interface SpriteSheetPanelProps {
  id: string;
}

export const SpriteSheetPanel: FC<SpriteSheetPanelProps> = ({ id }) => {
  const dispatch = useDispatch();
  const projectRoot = useSelector(
    (state: RootState) => state.document?.root || ""
  );
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const [zoom, setZoom] = useState(100);

  if (!sprite) {
    return null;
  }

  const onEdit = () => {
    dispatch(
      electronActions.openFile({
        filename: assetFilename(projectRoot, "sprites", sprite),
        type: "image",
      })
    );
  };

  const onZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const onZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  const onZoomReset = () => setZoom(100);

  return (
    <Wrapper>
      <SplitPaneHeader
        collapsed={false}
        buttons={
          <ZoomButton
            zoom={zoom}
            size="small"
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onZoomReset={onZoomReset}
          />
        }
      >
        {l10n("FIELD_SPRITE_SHEET")}
      </SplitPaneHeader>
      <Body>
        <Strip>
          <img
            alt=""
            src={`file://${assetFilename(projectRoot, "sprites", sprite)}?_v=${
              sprite._v || 0
            }`}
            style={{ height: `${Math.round(32 * (zoom / 100))}px` }}
          />
        </Strip>
        <Name>
          {sprite.filename} &mdash; {sprite.numFrames}{" "}
          {l10n("FIELD_SPRITE_FRAMES")}
        </Name>
        <Button size="small" onClick={onEdit}>
          {l10n("ASSET_EDIT")}
        </Button>
      </Body>
    </Wrapper>
  );
};
