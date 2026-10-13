import React, { FC, useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import entitiesActions from "../../store/features/entities/entitiesActions";
import editorActions from "../../store/features/editor/editorActions";
import { assetFilename } from "../../lib/helpers/gbstudio";

// M9 (SPRITE_EDITOR_PROGRESS.md) - the free-form metasprite click-to-place
// canvas. Center column, top: replaces SpritePreview for a sheet with
// metaspriteMode on. Ported interaction-wise from GB Studio 3.2.1's own
// MetaspriteEditor.tsx (read directly from the real source, not guessed -
// see the wireframe sign-off), simplified to this engine's own scope: a
// single, plain y-down coordinate system (no GB-style y-up mirroring - this
// is a new mechanism with no existing convention to match), 16x16 tiles
// only (no 8x8/32x32 - see entitiesState.ts's own METASPRITE_TILE_SIZE
// comment), and tiles rendered directly from the source PNG via CSS
// background-position rather than a worker/4bpp decode pipeline (that
// machinery is compiler-side only - the browser already decodes PNGs for
// free, no reason to duplicate it here for authoring).

const TILE_SIZE = 16;

const Wrapper = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: repeating-conic-gradient(
      ${(props) => props.theme.colors.input.background} 0% 25%,
      ${(props) => props.theme.colors.document.background} 0% 50%
    )
    50% / 16px 16px;
`;

const CanvasArea = styled.div`
  position: relative;
  outline: 1px solid rgba(255, 255, 255, 0.15);
`;

interface TileProps {
  selected?: boolean;
}

const TileEl = styled.div<TileProps>`
  position: absolute;
  width: ${TILE_SIZE}px;
  height: ${TILE_SIZE}px;
  image-rendering: pixelated;
  cursor: grab;
  outline: 1px solid
    ${(props) => (props.selected ? props.theme.colors.highlight : "transparent")};
  box-shadow: ${(props) =>
    props.selected ? `0 0 0 1px ${props.theme.colors.highlight}` : "none"};
`;

const BoundsBox = styled.div`
  position: absolute;
  border: 1px dashed rgba(255, 193, 7, 0.7);
  background: rgba(255, 193, 7, 0.08);
  pointer-events: none;
`;

const SelectionRect = styled.div`
  position: absolute;
  background: rgba(128, 128, 128, 0.08);
  border: 1px solid rgba(128, 128, 128, 0.4);
  pointer-events: none;
`;

const StampGhost = styled.div`
  position: absolute;
  width: ${TILE_SIZE}px;
  height: ${TILE_SIZE}px;
  image-rendering: pixelated;
  opacity: 0.55;
  pointer-events: none;
  outline: 1px dashed rgba(255, 255, 255, 0.6);
`;

interface MetaspriteCanvasProps {
  id: string;
  zoom?: number;
}

export const MetaspriteCanvas: FC<MetaspriteCanvasProps> = ({
  id,
  zoom = 2,
}) => {
  const dispatch = useDispatch();
  const areaRef = useRef<HTMLDivElement>(null);
  const projectRoot = useSelector(
    (state: RootState) => state.document?.root || ""
  );
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const frameIndex = useSelector(
    (state: RootState) => state.editor.selectedMetaspriteFrameIndex
  );
  const selectedTileIds = useSelector(
    (state: RootState) => state.editor.selectedMetaspriteTileIds
  );
  const spriteTileSelection = useSelector(
    (state: RootState) => state.editor.spriteTileSelection
  );
  const metaspriteTool = useSelector(
    (state: RootState) => state.editor.metaspriteTool
  );

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(
    null
  );
  const dragStartPositions = useRef<Record<string, { x: number; y: number }>>(
    {}
  );
  const [dragging, setDragging] = useState(false);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const marqueeOrigin = useRef<{ x: number; y: number } | null>(null);

  const canvasWidth = sprite?.canvasWidth || TILE_SIZE;
  const canvasHeight = sprite?.canvasHeight || TILE_SIZE;
  const metasprite = sprite?.metasprites?.[frameIndex];
  const tileLookup = sprite?.metaspriteTiles || {};
  const tileIds = metasprite?.tiles || [];

  const imageUrl = sprite
    ? `file://${assetFilename(projectRoot, "sprites", sprite)}?_v=${
        sprite._v || 0
      }`
    : "";

  const toCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const bounds = areaRef.current?.getBoundingClientRect();
      if (!bounds) {
        return { x: 0, y: 0 };
      }
      return {
        x: (clientX - bounds.left) / zoom,
        y: (clientY - bounds.top) / zoom,
      };
    },
    [zoom]
  );

  const snap = (v: number) => Math.round(v / TILE_SIZE) * TILE_SIZE;

  const onCanvasMouseMove = useCallback(
    (e: MouseEvent) => {
      const p = toCanvasPoint(e.clientX, e.clientY);
      setCursor(p);

      if (dragging && selectedTileIds.length > 0 && dragOrigin) {
        const dx = p.x - dragOrigin.x;
        const dy = p.y - dragOrigin.y;
        dispatch(
          entitiesActions.moveMetaspriteTiles({
            spriteSheetId: id,
            metaspriteTiles: selectedTileIds.map((tileId) => {
              const start = dragStartPositions.current[tileId];
              return {
                metaspriteTileId: tileId,
                x: Math.round((start?.x ?? 0) + dx),
                y: Math.round((start?.y ?? 0) + dy),
              };
            }),
          })
        );
      } else if (marqueeOrigin.current) {
        const x = Math.min(marqueeOrigin.current.x, p.x);
        const y = Math.min(marqueeOrigin.current.y, p.y);
        const width = Math.abs(p.x - marqueeOrigin.current.x);
        const height = Math.abs(p.y - marqueeOrigin.current.y);
        setMarquee({ x, y, width, height });
        const hits = tileIds.filter((tileId) => {
          const tile = tileLookup[tileId];
          if (!tile) {
            return false;
          }
          return (
            tile.x + TILE_SIZE > x &&
            tile.x < x + width &&
            tile.y + TILE_SIZE > y &&
            tile.y < y + height
          );
        });
        dispatch(editorActions.setSelectedMetaspriteTileIds(hits));
      }
    },
    [
      toCanvasPoint,
      dragging,
      selectedTileIds,
      dragOrigin,
      dispatch,
      id,
      tileIds,
      tileLookup,
    ]
  );

  const onCanvasMouseUp = useCallback(() => {
    if (dragging) {
      dispatch(
        entitiesActions.removeMetaspriteTilesOutsideCanvas({
          spriteSheetId: id,
          frameIndex,
        })
      );
    }
    setDragging(false);
    setDragOrigin(null);
    marqueeOrigin.current = null;
    setMarquee(null);
  }, [dragging, dispatch, id, frameIndex]);

  useEffect(() => {
    if (dragging || marqueeOrigin.current) {
      window.addEventListener("mousemove", onCanvasMouseMove);
      window.addEventListener("mouseup", onCanvasMouseUp);
      return () => {
        window.removeEventListener("mousemove", onCanvasMouseMove);
        window.removeEventListener("mouseup", onCanvasMouseUp);
      };
    }
    return () => {};
  }, [dragging, onCanvasMouseMove, onCanvasMouseUp]);

  const onTileMouseDown = (
    tileId: string
  ) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (spriteTileSelection) {
      return; // a stamp is pending - clicking an existing tile still places
    }
    e.stopPropagation();
    if (e.shiftKey) {
      dispatch(editorActions.toggleSelectedMetaspriteTileId(tileId));
      return;
    }
    let ids = selectedTileIds;
    if (!selectedTileIds.includes(tileId)) {
      dispatch(editorActions.setSelectedMetaspriteTileId(tileId));
      ids = [tileId];
    }
    const positions: Record<string, { x: number; y: number }> = {};
    ids.forEach((selId) => {
      const t = tileLookup[selId];
      if (t) {
        positions[selId] = { x: t.x, y: t.y };
      }
    });
    dragStartPositions.current = positions;
    setDragOrigin(toCanvasPoint(e.clientX, e.clientY));
    setDragging(true);
  };

  const onCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const p = toCanvasPoint(e.clientX, e.clientY);
    if (spriteTileSelection && metaspriteTool === "place") {
      dispatch(
        entitiesActions.addMetaspriteTile({
          spriteSheetId: id,
          frameIndex,
          x: snap(p.x - TILE_SIZE / 2),
          y: snap(p.y - TILE_SIZE / 2),
          sliceX: spriteTileSelection.x,
          sliceY: spriteTileSelection.y,
        })
      );
      return;
    }
    if (metaspriteTool === "erase") {
      return;
    }
    dispatch(editorActions.resetSelectedMetaspriteTileIds());
    marqueeOrigin.current = p;
  };

  const onTileClickErase = (tileId: string) => (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (metaspriteTool !== "erase") {
      return;
    }
    e.stopPropagation();
    dispatch(
      entitiesActions.removeMetaspriteTiles({
        spriteSheetId: id,
        metaspriteTileIds: [tileId],
        frameIndex,
      })
    );
  };

  const onMouseMoveGhost = (e: React.MouseEvent<HTMLDivElement>) => {
    const p = toCanvasPoint(e.clientX, e.clientY);
    setCursor(p);
  };

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.nodeName !== "BODY") {
        return;
      }
      if (selectedTileIds.length === 0) {
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        dispatch(
          entitiesActions.removeMetaspriteTiles({
            spriteSheetId: id,
            metaspriteTileIds: selectedTileIds,
            frameIndex,
          })
        );
        return;
      }
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowUp") dy = -1;
      else if (e.key === "ArrowDown") dy = 1;
      else if (e.key === "ArrowLeft") dx = -1;
      else if (e.key === "ArrowRight") dx = 1;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        if (e.shiftKey) {
          dx *= TILE_SIZE;
          dy *= TILE_SIZE;
        }
        dispatch(
          entitiesActions.moveMetaspriteTilesRelative({
            spriteSheetId: id,
            metaspriteTileIds: selectedTileIds,
            x: dx,
            y: dy,
          })
        );
      }
    },
    [dispatch, id, selectedTileIds, frameIndex]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  if (!sprite) {
    return <Wrapper />;
  }

  const boundsX = sprite.boundsX || 0;
  const boundsY = sprite.boundsY || 0;
  const boundsWidth = sprite.boundsWidth || 16;
  const boundsHeight = sprite.boundsHeight || 16;

  // A plain boolean (e.g. `spriteTileSelection && cursor`) doesn't let
  // TypeScript narrow `cursor`/`spriteTileSelection` back to non-null at the
  // point they're actually read below - an object carrying the real values
  // (or null) does, since the narrowing happens in the same expression that
  // produces it.
  const ghostOrigin =
    spriteTileSelection && metaspriteTool === "place" && cursor
      ? {
          x: snap(cursor.x - TILE_SIZE / 2),
          y: snap(cursor.y - TILE_SIZE / 2),
        }
      : null;

  return (
    <Wrapper onMouseMove={onMouseMoveGhost}>
      <CanvasArea
        ref={areaRef}
        style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}
        onMouseDown={onCanvasMouseDown}
      >
        <BoundsBox
          style={{
            left: boundsX * zoom,
            top: boundsY * zoom,
            width: boundsWidth * zoom,
            height: boundsHeight * zoom,
          }}
        />
        {tileIds.map((tileId) => {
          const tile = tileLookup[tileId];
          if (!tile) {
            return null;
          }
          return (
            <TileEl
              key={tileId}
              selected={selectedTileIds.includes(tileId)}
              onMouseDown={onTileMouseDown(tileId)}
              onClick={onTileClickErase(tileId)}
              style={{
                left: tile.x * zoom,
                top: tile.y * zoom,
                width: TILE_SIZE * zoom,
                height: TILE_SIZE * zoom,
                backgroundImage: `url(${imageUrl})`,
                backgroundPosition: `${-tile.sliceX * zoom}px ${
                  -tile.sliceY * zoom
                }px`,
                backgroundSize: "auto",
                transform: `scale(${tile.flipX ? -1 : 1}, ${
                  tile.flipY ? -1 : 1
                })`,
                transformOrigin: "center",
              }}
            />
          );
        })}
        {ghostOrigin && spriteTileSelection && (
          <StampGhost
            style={{
              left: ghostOrigin.x * zoom,
              top: ghostOrigin.y * zoom,
              width: TILE_SIZE * zoom,
              height: TILE_SIZE * zoom,
              backgroundImage: `url(${imageUrl})`,
              backgroundPosition: `${-spriteTileSelection.x * zoom}px ${
                -spriteTileSelection.y * zoom
              }px`,
            }}
          />
        )}
        {marquee && (
          <SelectionRect
            style={{
              left: marquee.x * zoom,
              top: marquee.y * zoom,
              width: marquee.width * zoom,
              height: marquee.height * zoom,
            }}
          />
        )}
      </CanvasArea>
    </Wrapper>
  );
};
