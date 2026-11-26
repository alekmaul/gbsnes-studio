import { SpriteTileSelection } from "../../store/features/editor/editorState";

interface Point {
  x: number;
  y: number;
}

// Rectangle of whole tiles going from the tile pressed first (anchor) to the
// pointer, all in image pixels. Undefined when the pointer is outside the
// image: dragging towards the editor must leave the selection as it is.
export const rectangleSelection = (
  anchor: Point,
  pointer: Point,
  tileSize: number,
  imageWidth: number,
  imageHeight: number
): SpriteTileSelection | undefined => {
  if (
    pointer.x < 0 ||
    pointer.y < 0 ||
    pointer.x >= imageWidth ||
    pointer.y >= imageHeight
  ) {
    return undefined;
  }

  const axis = (start: number, position: number, imageSize: number) => {
    // Tiles added before and after the pressed one, within the image
    const before =
      position < start
        ? Math.min(
            Math.ceil((start - position) / tileSize),
            Math.floor(start / tileSize)
          )
        : 0;
    const after = Math.max(
      0,
      Math.min(
        Math.floor((position - start) / tileSize),
        Math.floor((imageSize - start) / tileSize) - 1
      )
    );
    return { origin: start - before * tileSize, count: 1 + before + after };
  };

  const horizontal = axis(anchor.x, pointer.x, imageWidth);
  const vertical = axis(anchor.y, pointer.y, imageHeight);

  return {
    x: horizontal.origin,
    y: vertical.origin,
    width: horizontal.count,
    height: vertical.count,
  };
};
