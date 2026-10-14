import React, { FC, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import editorActions from "../../store/features/editor/editorActions";
import electronActions from "../../store/features/electron/electronActions";
import { assetFilename } from "../../lib/helpers/gbstudio";
import { Button } from "../ui/buttons/Button";
import { ZoomButton } from "../ui/buttons/ZoomButton";
import { SplitPaneHeader } from "../ui/splitpane/SplitPaneHeader";
import l10n from "../../lib/helpers/l10n";

// M9 (SPRITE_EDITOR_PROGRESS.md) - center column, "TILES" panel: the source
// PNG shown as a pickable 16x16 grid. Clicking a cell sets
// editor.spriteTileSelection (the pending "stamp" MetaspriteCanvas then
// places on the next canvas click) - same two-step pick-then-place flow the
// signed-off wireframe shows. Keeps SpriteSheetPanel's own "Edit" button
// (opens the file in the OS's default graphics editor) - the exact addition
// the user asked for on the wireframe before signing off.

const TILE_SIZE = 16;
const ZOOM_MIN = 100;
const ZOOM_MAX = 1600;
const ZOOM_STEP = 100;

const Wrapper = styled.div`
  height: 190px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid ${(props) => props.theme.colors.sidebar.border};
  background: ${(props) => props.theme.colors.sidebar.well.background};
`;

const Body = styled.div`
  flex: 1;
  overflow: auto;
  padding: 8px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

// Mirrors SpriteSheetPanel's own Body row - user-asked: the Edit button must
// stay in the same place it's always been (a footer row, right-aligned)
// rather than move into the header when Free-form is toggled on and this
// panel replaces SpriteSheetPanel.
const Footer = styled.div`
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 8px 14px;
  border-top: 1px solid ${(props) => props.theme.colors.sidebar.border};
`;

const Grid = styled.div`
  position: relative;
  flex-shrink: 0;
  image-rendering: pixelated;

  img {
    display: block;
    image-rendering: pixelated;
  }
`;

interface CellProps {
  selected?: boolean;
}

const Cell = styled.div<CellProps>`
  position: absolute;
  width: ${TILE_SIZE}px;
  height: ${TILE_SIZE}px;
  box-shadow: ${(props) =>
    props.selected
      ? `0 0 0 2px ${props.theme.colors.highlight} inset`
      : "none"};
  cursor: pointer;

  :hover {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  }
`;

interface MetaspriteTilePaletteProps {
  id: string;
}

export const MetaspriteTilePalette: FC<MetaspriteTilePaletteProps> = ({
  id,
}) => {
  const dispatch = useDispatch();
  const projectRoot = useSelector(
    (state: RootState) => state.document?.root || ""
  );
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const spriteTileSelection = useSelector(
    (state: RootState) => state.editor.spriteTileSelection
  );
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  // Local zoom, not state.editor.zoomSprite - this panel shows the WHOLE
  // source sheet at once (can be much bigger than one 16x16 frame), a
  // different sizing need than the single-frame preview/canvas that field
  // drives (SpritePreview.tsx/MetaspriteCanvas.tsx). 400% (4x) default -
  // large enough to click a tile reliably without being the full panel's
  // own former hardcoded 4x.
  const [zoomPct, setZoomPct] = useState(400);
  const zoom = zoomPct / 100;

  if (!sprite) {
    return null;
  }

  const imageUrl = `file://${assetFilename(projectRoot, "sprites", sprite)}?_v=${
    sprite._v || 0
  }`;

  const onEdit = () => {
    dispatch(
      electronActions.openFile({
        filename: assetFilename(projectRoot, "sprites", sprite),
        type: "image",
      })
    );
  };

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setNaturalSize({
      width: e.currentTarget.naturalWidth,
      height: e.currentTarget.naturalHeight,
    });
  };

  const cols = Math.floor(naturalSize.width / TILE_SIZE);
  const rows = Math.floor(naturalSize.height / TILE_SIZE);
  const cells = [];
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const x = tx * TILE_SIZE;
      const y = ty * TILE_SIZE;
      cells.push({ x, y });
    }
  }

  const onPickCell = (x: number, y: number) => () => {
    dispatch(
      editorActions.setSpriteTileSelection({
        x,
        y,
        width: TILE_SIZE,
        height: TILE_SIZE,
      })
    );
  };

  const onZoomIn = () =>
    setZoomPct((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const onZoomOut = () =>
    setZoomPct((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  const onZoomReset = () => setZoomPct(400);

  return (
    <Wrapper>
      <SplitPaneHeader
        collapsed={false}
        buttons={
          <ZoomButton
            zoom={zoomPct}
            size="small"
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onZoomReset={onZoomReset}
          />
        }
      >
        {l10n("FIELD_TILES")} — {sprite.filename}
      </SplitPaneHeader>
      <Body>
        <Grid
          style={{
            width: naturalSize.width * zoom,
            height: naturalSize.height * zoom,
          }}
        >
          <img
            alt=""
            src={imageUrl}
            onLoad={onLoad}
            style={{
              width: naturalSize.width * zoom,
              height: naturalSize.height * zoom,
            }}
          />
          {cells.map(({ x, y }) => (
            <Cell
              key={`${x}_${y}`}
              selected={
                !!spriteTileSelection &&
                spriteTileSelection.x === x &&
                spriteTileSelection.y === y
              }
              onClick={onPickCell(x, y)}
              style={{
                left: x * zoom,
                top: y * zoom,
                width: TILE_SIZE * zoom,
                height: TILE_SIZE * zoom,
              }}
            />
          ))}
        </Grid>
      </Body>
      <Footer>
        <Button size="small" onClick={onEdit}>
          {l10n("ASSET_EDIT")}
        </Button>
      </Footer>
    </Wrapper>
  );
};
