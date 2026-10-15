import { directionToFrame } from "../../lib/helpers/gbstudio";

const workerCtx: Worker = self as any;

interface CacheRecord {
    canvas: OffscreenCanvas;
    ctx: OffscreenCanvasRenderingContext2D;
    img: ImageBitmap;
}

const cache: Record<string, CacheRecord> = {};

interface MetaspriteTile {
    id: string;
    x: number;
    y: number;
    sliceX: number;
    sliceY: number;
    flipX?: boolean;
    flipY?: boolean;
    priority?: boolean;
}

interface Metasprite {
    id: string;
    tiles: string[];
}

const TILE_SIZE = 16;

workerCtx.onmessage = async (evt) => {
    const id = evt.data.id;
    const src = evt.data.src;
    const width = evt.data.width;
    const height = evt.data.height;
    const direction = evt.data.direction;
    const numFrames = evt.data.numFrames;
    const type = evt.data.type;
    const frame = evt.data.frame;
    const rawFrame = evt.data.rawFrame;
    // M9.4 follow-up (user-found: a Free-form actor placed on a scene
    // still rendered as a plain 16x16 sprite) - see SpriteSheetCanvas.js's
    // own comment for the full story.
    const metaspriteMode: boolean = evt.data.metaspriteMode;
    const animationType: string | undefined = evt.data.animationType;
    const metasprites: Metasprite[] | undefined = evt.data.metasprites;
    const metaspriteTiles: Record<string, MetaspriteTile> | undefined =
        evt.data.metaspriteTiles;

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

    // rawFrame bypasses directionToFrame entirely - an absolute index into
    // the sheet's own frame strip (0..numFrames-1), used by the sprite
    // editor's Animations/Frames panel to show/curate a project's own
    // chosen frames rather than the engine's direction-based convention.
    // Confirmed (M9.4 follow-up) this ALREADY produces the right compact
    // index into a metaspriteMode sheet's own metasprites[] array too, for
    // every animationType - "fixed" ignores direction (numFrames isn't 3
    // or 6, so directionToFrame returns 0, leaving spriteOffset = frame,
    // the actor's own direct frame index, matching SPRITE_STATIC's a->frame
    // on the engine side exactly); "multi"/"multi_movement" produce the
    // same compact {0,1,2}/{0..5} down/up/side(+walk-pose) order
    // compileSnesData.js/scene.c's actor_metasprite_pose() use - no new
    // frame-resolution logic needed here, only the drawing itself.
    const spriteOffset =
        rawFrame !== undefined
            ? rawFrame
            : directionToFrame(direction, numFrames) + (frame || 0);

    // Side poses mirror for "left" on a plain legacy actor sheet (hardware
    // hflip of the one frame) - and the SAME condition, applied to a whole
    // metaspriteMode "multi"/"multi_movement" composition drawn below,
    // produces the identical visual result as the engine's own per-tile
    // mirror (negate each tile's position around centre + flip its own
    // pixels) - a rigid reflection of several tiles is the same whether
    // it's done per-tile or as one whole-canvas transform before drawing
    // them. `type` (auto-detected from the raw PNG's own pixel geometry)
    // isn't reliable for a metaspriteMode sheet - its real shape comes from
    // animationType instead, checked here too.
    const shouldMirror =
        rawFrame === undefined &&
        direction === "left" &&
        (type === "actor" ||
            type === "actor_animated" ||
            (metaspriteMode &&
                (animationType === "multi" || animationType === "multi_movement")));

    // Draw Sprite
    ctx.save();
    if (shouldMirror) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }
    if (metaspriteMode && metasprites && metaspriteTiles) {
        // M9.4 follow-up: compose this frame's real placed tiles instead of
        // a flat single-16x16-frame crop - see SpriteSheetCanvas.js's own
        // comment for the full story. Cleared first (unlike the flat-crop
        // path below, a composition can legitimately leave gaps, so a
        // reused cached canvas could otherwise show a stale pixel from a
        // previous frame that had a tile there and this one doesn't).
        ctx.clearRect(0, 0, width, height);
        const metasprite = metasprites[spriteOffset];
        const tileIds = (metasprite && metasprite.tiles) || [];
        tileIds.forEach((tileId) => {
            const tile = metaspriteTiles[tileId];
            if (!tile) {
                return;
            }
            ctx.save();
            if (tile.flipX || tile.flipY) {
                const cx = tile.x + TILE_SIZE / 2;
                const cy = tile.y + TILE_SIZE / 2;
                ctx.translate(cx, cy);
                ctx.scale(tile.flipX ? -1 : 1, tile.flipY ? -1 : 1);
                ctx.translate(-cx, -cy);
            }
            ctx.drawImage(
                img,
                tile.sliceX,
                tile.sliceY,
                TILE_SIZE,
                TILE_SIZE,
                tile.x,
                tile.y,
                TILE_SIZE,
                TILE_SIZE
            );
            ctx.restore();
        });
    } else {
        ctx.drawImage(img, spriteOffset * -width, 0);
    }
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
