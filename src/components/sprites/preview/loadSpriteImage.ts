// Used by the preview workers: a sprite sheet with its transparent colour
// removed, cached per URL (the URL changes whenever the file does)
import { makeTransparent } from "../../../lib/sprite/transparency";

const cache: Record<string, Promise<OffscreenCanvas>> = {};

const load = async (src: string): Promise<OffscreenCanvas> => {
  const blob = await fetch(src).then((r) => r.blob());
  const img = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  makeTransparent(imageData.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

const loadSpriteImage = (src: string): Promise<OffscreenCanvas> => {
  if (!cache[src]) {
    cache[src] = load(src);
  }
  return cache[src];
};

export default loadSpriteImage;
