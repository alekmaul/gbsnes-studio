// Ported from GB Studio 3.2.1: draws one frame from its tiles. SNES tiles are
// 8x8 or 16x16 and keep the colours of the image.
import loadSpriteImage from "./loadSpriteImage";
import { MetaspriteTile } from "../../../store/features/entities/entitiesTypes";

// eslint-disable-next-line no-restricted-globals
const workerCtx: Worker = self as unknown as Worker;

export interface MetaspriteCanvasResult {
  id: number;
  canvasImage: ImageBitmap;
}

workerCtx.onmessage = async (evt) => {
  const { id, src, width, height, flipX } = evt.data;
  const tiles: MetaspriteTile[] = evt.data.tiles;

  const img = await loadSpriteImage(src);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  if (flipX) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  // Draw Tiles, back to front
  for (const tile of tiles) {
    const size = tile.size;
    const left = width / 2 - 8 + tile.x;
    const top = height - size - tile.y;
    ctx.save();
    ctx.translate(left + size / 2, top + size / 2);
    ctx.scale(tile.flipX ? -1 : 1, tile.flipY ? -1 : 1);
    ctx.drawImage(
      img,
      tile.sliceX,
      tile.sliceY,
      size,
      size,
      -size / 2,
      -size / 2,
      size,
      size
    );
    ctx.restore();
  }

  const canvasImage = canvas.transferToImageBitmap();
  workerCtx.postMessage({ id, canvasImage }, [canvasImage]);
};

// -----------------------------------------------------------------

export default class W extends Worker {
  constructor() {
    super("");
  }
}
