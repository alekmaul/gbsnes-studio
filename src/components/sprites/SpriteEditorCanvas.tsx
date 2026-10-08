import React, { FC, useEffect, useRef, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../store/configureStore";
import entitiesActions from "../../store/features/entities/entitiesActions";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import { MetaspriteTile } from "../../store/features/entities/entitiesTypes";
import { assetFilename } from "../../lib/helpers/gbstudio";
import { Select } from "../ui/form/Select";
import { CheckboxField } from "../ui/form/CheckboxField";
import { FormField, FormRow } from "../ui/form/FormLayout";
import { Button } from "../ui/buttons/Button";
import { CloseIcon } from "../ui/icons/Icons";
import l10n from "../../lib/helpers/l10n";

interface SpriteEditorCanvasProps {
  spriteSheetId: string;
  animationStateId: string;
  subStateId: string;
  frameId: string;
}

// Hardware fact, not a style choice - see entitiesTypes.ts's own comment on
// MetaspriteTile: every tile this engine's OBJ hardware can place is a full
// 16x16 "large" sprite (OBJ_SIZE8_L16), no smaller/larger size to support.
const TILE_SIZE = 16;
// Working area: an 8x8 grid of 16px cells (128x128px) - generous for a
// single actor-sized composition without needing a zoom/pan control yet.
const GRID_TILES = 8;
const CANVAS_SIZE = TILE_SIZE * GRID_TILES;

// `MetaspriteTile.x/y` are frame-origin-relative (entitiesTypes.ts's own
// comment on the field, and the real convention compileSnesSprites.ts's
// t_metasprite `dx`/`dy` records rely on - "delta coordinate... relative to
// the metasprite origin (0,0)"), so the canvas needs a screen-space anchor
// for where that origin (0,0) actually sits. `spriteSheet.origin` doubles
// as that anchor (also where the crosshair below is drawn); an unset
// origin defaults to the canvas center - a reasonable pivot for a
// character-sized composition with no authored origin yet.
const DEFAULT_ORIGIN = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };

const PALETTE_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  value: i,
  label: `${l10n("FIELD_PALETTE")} ${i}`,
}));

// Draws one TILE_SIZE square from `image`, sliced by `tileIndex` against the
// source PNG's own real width (tiles laid left-to-right, wrapping to
// additional rows - the same flat-strip convention this engine's own sprite
// sheets already use everywhere else, snesgfx.js's sheetFrames). This is
// deliberately simple pixel-copy, not a true per-palette recolour - the
// genuine 4bpp/8-palette extraction only happens at compile time
// (snesgfx.js); the editor shows the PNG's own real colours and labels each
// tile's chosen paletteIndex as a small badge instead of simulating it.
const drawTile = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  tileIndex: number,
  destX: number,
  destY: number,
  flipX: boolean,
  flipY: boolean,
  priority: boolean,
  paletteIndex: number
) => {
  const tilesPerRow = Math.max(1, Math.floor(image.width / TILE_SIZE));
  const srcX = (tileIndex % tilesPerRow) * TILE_SIZE;
  const srcY = Math.floor(tileIndex / tilesPerRow) * TILE_SIZE;

  ctx.save();
  ctx.translate(destX + TILE_SIZE / 2, destY + TILE_SIZE / 2);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(
    image,
    srcX,
    srcY,
    TILE_SIZE,
    TILE_SIZE,
    -TILE_SIZE / 2,
    -TILE_SIZE / 2,
    TILE_SIZE,
    TILE_SIZE
  );
  ctx.restore();

  // Priority marker: same gold-corner visual language this project's own
  // World editor already uses for BG priority tiles (SceneCollisions.js) -
  // reused here for consistency rather than inventing a new convention.
  if (priority) {
    ctx.fillStyle = "#e8c547";
    ctx.beginPath();
    ctx.moveTo(destX + TILE_SIZE, destY);
    ctx.lineTo(destX + TILE_SIZE - 5, destY);
    ctx.lineTo(destX + TILE_SIZE, destY + 5);
    ctx.closePath();
    ctx.fill();
  }

  // Palette badge: a plain number, not a real colour swatch - this editor
  // has no access to the real extracted CGRAM palette (compiler-only, see
  // this function's own comment above), so a colour swatch here would be
  // decorative at best and misleading at worst.
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(destX, destY, 9, 9);
  ctx.fillStyle = "#fff";
  ctx.font = "8px sans-serif";
  ctx.fillText(String(paletteIndex), destX + 2, destY + 7);
};

// Main metasprite composition canvas - GB Studio 3.2's own MetaspriteCanvas,
// adapted to this engine's strict 16x16-tile/8-palette SNES hardware model
// (see TILE_SIZE/PALETTE_OPTIONS above). Click-to-place, not drag-and-drop -
// explicitly allowed as the simpler alternative for this first draft (full
// HTML5 drag-and-drop needs real dataTransfer plumbing the click model gets
// for free): click a tile in the bank strip below to arm it, then click an
// empty grid cell on the canvas to place it there; clicking an
// already-placed tile instead selects it for the inspector panel (palette/
// flip/priority/remove) on the right.
export const SpriteEditorCanvas: FC<SpriteEditorCanvasProps> = ({
  spriteSheetId,
  animationStateId,
  subStateId,
  frameId,
}) => {
  const dispatch = useDispatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bankCanvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [armedTileIndex, setArmedTileIndex] = useState<number>(0);
  const [selectedTileId, setSelectedTileId] = useState<string | undefined>(
    undefined
  );

  const projectRoot = useSelector((state: RootState) => state.document.root);
  const spriteSheet = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, spriteSheetId)
  );
  const frame = spriteSheet?.animationStates
    ?.find((a) => a.id === animationStateId)
    ?.subStates.find((s) => s.id === subStateId)
    ?.frames.find((f) => f.id === frameId);
  const selectedTile = frame?.tiles.find((t) => t.id === selectedTileId);
  // Effective screen-space anchor for tile.x/y==0,0 - see DEFAULT_ORIGIN.
  const origin = spriteSheet?.origin || DEFAULT_ORIGIN;

  // Load the sheet's own source PNG once (and again if the file itself
  // changes, via `_v` - the same cache-busting token every other sprite
  // preview in this app already keys off).
  useEffect(() => {
    if (!spriteSheet) {
      return undefined;
    }
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = `file:///${assetFilename(projectRoot, "sprites", spriteSheet)}?_v=${
      spriteSheet._v
    }`;
    return () => {
      img.onload = null;
    };
  }, [projectRoot, spriteSheet, spriteSheet?.filename, spriteSheet?._v]);

  // Redraw the main composition canvas whenever the active frame's own
  // content, or the sheet's origin/boundingBox, changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image || !frame) {
      return;
    }
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 16px grid, for the click-to-place model to read by eye.
    ctx.strokeStyle = "rgba(128, 128, 128, 0.25)";
    for (let i = 0; i <= GRID_TILES; i++) {
      ctx.beginPath();
      ctx.moveTo(i * TILE_SIZE, 0);
      ctx.lineTo(i * TILE_SIZE, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * TILE_SIZE);
      ctx.lineTo(CANVAS_SIZE, i * TILE_SIZE);
      ctx.stroke();
    }

    frame.tiles.forEach((tile) => {
      drawTile(
        ctx,
        image,
        tile.tileIndex,
        origin.x + tile.x,
        origin.y + tile.y,
        tile.flipX,
        tile.flipY,
        tile.priority,
        tile.paletteIndex
      );
      if (tile.id === selectedTileId) {
        ctx.strokeStyle = "#4f9cff";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          origin.x + tile.x + 1,
          origin.y + tile.y + 1,
          TILE_SIZE - 2,
          TILE_SIZE - 2
        );
        ctx.lineWidth = 1;
      }
    });

    // Bounding box (collision hitbox), relative to origin.
    if (spriteSheet?.boundingBox) {
      const { x, y, width, height } = spriteSheet.boundingBox;
      ctx.strokeStyle = "#ff4f4f";
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(origin.x + x, origin.y + y, width, height);
      ctx.setLineDash([]);
    }

    // Origin / pivot marker - drawn at the effective anchor itself, real or
    // defaulted, so it always lines up with where tiles are actually placed.
    ctx.strokeStyle = "#4fff7a";
    ctx.beginPath();
    ctx.moveTo(origin.x - 4, origin.y);
    ctx.lineTo(origin.x + 4, origin.y);
    ctx.moveTo(origin.x, origin.y - 4);
    ctx.lineTo(origin.x, origin.y + 4);
    ctx.stroke();
  }, [image, frame, selectedTileId, spriteSheet?.boundingBox, origin]);

  // Tile bank: every 16x16 tile the source PNG actually contains, laid out
  // left-to-right - the same flat-strip slicing drawTile's own srcX/srcY
  // math assumes.
  useEffect(() => {
    const canvas = bankCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image) {
      return;
    }
    const tilesPerRow = Math.max(1, Math.floor(image.width / TILE_SIZE));
    const rows = Math.max(1, Math.ceil(image.height / TILE_SIZE));
    canvas.width = tilesPerRow * (TILE_SIZE + 2);
    canvas.height = rows * (TILE_SIZE + 2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < tilesPerRow; col++) {
        const tileIndex = row * tilesPerRow + col;
        drawTile(
          ctx,
          image,
          tileIndex,
          col * (TILE_SIZE + 2),
          row * (TILE_SIZE + 2),
          false,
          false,
          false,
          0
        );
      }
    }
    // the armed-tile highlight is drawn in a second pass, on top
    const armedCol = armedTileIndex % tilesPerRow;
    const armedRow = Math.floor(armedTileIndex / tilesPerRow);
    ctx.strokeStyle = "#4f9cff";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      armedCol * (TILE_SIZE + 2) + 1,
      armedRow * (TILE_SIZE + 2) + 1,
      TILE_SIZE,
      TILE_SIZE
    );
    ctx.lineWidth = 1;
  }, [image, armedTileIndex]);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!frame) {
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const existing = frame.tiles.find(
        (tile) =>
          clickX >= origin.x + tile.x &&
          clickX < origin.x + tile.x + TILE_SIZE &&
          clickY >= origin.y + tile.y &&
          clickY < origin.y + tile.y + TILE_SIZE
      );
      if (existing) {
        setSelectedTileId(existing.id === selectedTileId ? undefined : existing.id);
        return;
      }
      // Snap to the grid in screen space, then convert back to
      // origin-relative storage - see DEFAULT_ORIGIN's own comment.
      const gridX = Math.floor(clickX / TILE_SIZE) * TILE_SIZE;
      const gridY = Math.floor(clickY / TILE_SIZE) * TILE_SIZE;
      dispatch(
        entitiesActions.upsertSpriteMetaspriteTile({
          spriteSheetId,
          animationStateId,
          subStateId,
          frameId,
          changes: {
            x: gridX - origin.x,
            y: gridY - origin.y,
            tileIndex: armedTileIndex,
          },
        })
      );
    },
    [
      frame,
      selectedTileId,
      armedTileIndex,
      origin,
      dispatch,
      spriteSheetId,
      animationStateId,
      subStateId,
      frameId,
    ]
  );

  const onBankClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!image) {
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const tilesPerRow = Math.max(1, Math.floor(image.width / TILE_SIZE));
      const col = Math.floor((e.clientX - rect.left) / (TILE_SIZE + 2));
      const row = Math.floor((e.clientY - rect.top) / (TILE_SIZE + 2));
      setArmedTileIndex(row * tilesPerRow + col);
    },
    [image]
  );

  const onEditSelectedTile = (changes: Partial<Omit<MetaspriteTile, "id">>) => {
    if (!selectedTileId) {
      return;
    }
    dispatch(
      entitiesActions.upsertSpriteMetaspriteTile({
        spriteSheetId,
        animationStateId,
        subStateId,
        frameId,
        tileId: selectedTileId,
        changes,
      })
    );
  };

  const onRemoveSelectedTile = () => {
    if (!selectedTileId) {
      return;
    }
    dispatch(
      entitiesActions.removeSpriteMetaspriteTile({
        spriteSheetId,
        animationStateId,
        subStateId,
        frameId,
        tileId: selectedTileId,
      })
    );
    setSelectedTileId(undefined);
  };

  if (!spriteSheet || !frame) {
    return null;
  }

  return (
    <div className="SpriteEditorCanvas">
      <canvas
        ref={canvasRef}
        className="SpriteEditorCanvas__Canvas"
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onClick={onCanvasClick}
      />
      {selectedTile && (
        <div className="SpriteEditorCanvas__Inspector">
          <FormRow>
            <span>{l10n("FIELD_SELECTED_TILE")}</span>
            <Button
              variant="transparent"
              size="small"
              onClick={onRemoveSelectedTile}
              title={l10n("FIELD_REMOVE")}
            >
              <CloseIcon />
            </Button>
          </FormRow>
          <FormField name="tilePalette" label={l10n("FIELD_PALETTE")}>
            <Select
              name="tilePalette"
              value={PALETTE_OPTIONS.find(
                (o) => o.value === selectedTile.paletteIndex
              )}
              options={PALETTE_OPTIONS}
              onChange={(option: { value: number; label: string }) =>
                onEditSelectedTile({ paletteIndex: option.value })
              }
            />
          </FormField>
          <CheckboxField
            name="tileFlipX"
            label={l10n("FIELD_FLIP_X")}
            checked={selectedTile.flipX}
            onChange={(e) => onEditSelectedTile({ flipX: e.currentTarget.checked })}
          />
          <CheckboxField
            name="tileFlipY"
            label={l10n("FIELD_FLIP_Y")}
            checked={selectedTile.flipY}
            onChange={(e) => onEditSelectedTile({ flipY: e.currentTarget.checked })}
          />
          <CheckboxField
            name="tilePriority"
            label={l10n("FIELD_PRIORITY")}
            checked={selectedTile.priority}
            onChange={(e) =>
              onEditSelectedTile({ priority: e.currentTarget.checked })
            }
          />
        </div>
      )}
      <div className="SpriteEditorCanvas__Bank">
        <span className="SpriteEditorCanvas__BankLabel">
          {l10n("FIELD_TILE_BANK")}
        </span>
        <canvas
          ref={bankCanvasRef}
          className="SpriteEditorCanvas__BankCanvas"
          onClick={onBankClick}
        />
      </div>
    </div>
  );
};
