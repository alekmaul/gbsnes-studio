import { directionToFrame } from "../../lib/helpers/gbstudio";

const workerCtx: Worker = self as any;

interface CacheRecord {
    canvas: OffscreenCanvas;
    ctx: OffscreenCanvasRenderingContext2D;
    img: ImageBitmap;
}

const cache: Record<string, CacheRecord> = {};

workerCtx.onmessage = async (evt) => {
    const id = evt.data.id;
    const src = evt.data.src;
    const width = evt.data.width;
    const height = evt.data.height;
    const direction = evt.data.direction;
    const numFrames = evt.data.numFrames;
    const type = evt.data.type;
    const frame = evt.data.frame;

    let canvas: OffscreenCanvas;
    let ctx: OffscreenCanvasRenderingContext2D;
    let img: ImageBitmap;

    if (cache[src]) {
        // Using Cached Data
        canvas = cache[src].canvas;
        ctx = cache[src].ctx;
        img = cache[src].img;
    } else {
        // Fetch New Data
        canvas = new OffscreenCanvas(width, height);
        const tmpCtx = canvas.getContext("2d");
        if (!tmpCtx) {
            return;
        }
        ctx = tmpCtx;
        const imgblob = await fetch(src).then((r) => r.blob());
        img = await createImageBitmap(imgblob);

        cache[src] = {
            canvas,
            ctx,
            img,
        };
    }

    const directionFrame = directionToFrame(direction, numFrames);
    const spriteOffset = directionFrame + (frame || 0);

    // Draw Sprite
    ctx.save();
    if (
        direction === "left" &&
        (type === "actor" || type === "actor_animated")
    ) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(img, spriteOffset * -width, 0);
    ctx.restore();

    // Sprite sheets use a green background as a chroma-key marker (real
    // alpha channels aren't guaranteed) - strip it to transparent, same
    // check the old per-tile recolour pass used. No recolouring: SNES
    // sprites use their own real PNG colours.
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 1] === 255) {
            data[i + 3] = 0;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    const canvasImage = canvas.transferToImageBitmap();
    workerCtx.postMessage({ id, canvasImage }, [canvasImage]);
};

export { }
