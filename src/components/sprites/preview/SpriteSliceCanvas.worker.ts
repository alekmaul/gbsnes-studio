// Ported from GB Studio 3.2.1, without the Game Boy recolouring
import loadSpriteImage from "./loadSpriteImage";

// eslint-disable-next-line no-restricted-globals
const workerCtx: Worker = self as unknown as Worker;

export interface SpriteSliceCanvasResult {
  id: number;
  canvasImage: ImageBitmap;
}

workerCtx.onmessage = async (evt) => {
  const { id, src, offsetX, offsetY, width, height, flipX, flipY } = evt.data;

  const img = await loadSpriteImage(src);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  // Draw Sprite
  ctx.save();
  if (flipX) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  if (flipY) {
    ctx.translate(0, height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(img, -offsetX, -offsetY);
  ctx.restore();

  const canvasImage = canvas.transferToImageBitmap();
  const res: SpriteSliceCanvasResult = { id, canvasImage };
  workerCtx.postMessage(res, [canvasImage]);
};

// -----------------------------------------------------------------

export default class W extends Worker {
  constructor() {
    super("");
  }
}
