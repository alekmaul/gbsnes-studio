import React from "react";
import SpriteSheetCanvas from "../../../src/components/world/SpriteSheetCanvas";
import { configureStore } from "@reduxjs/toolkit";
import rootReducer from "../../../src/store/rootReducer";
import projectActions from "../../../src/store/features/project/projectActions";
import entitiesActions from "../../../src/store/features/entities/entitiesActions";
import { ActorDirection } from "../../../src/store/features/entities/entitiesTypes";
import { dummySpriteSheet } from "../../dummydata";
import { render } from "../../react-utils";

// Show which frame would be drawn instead of drawing it
jest.mock("../../../src/components/sprites/preview/MetaspriteCanvas", () => ({
  MetaspriteCanvas: (props: any) =>
    require("react").createElement("div", {
      "data-frame": props.metaspriteId,
      "data-flip": String(!!props.flipX),
    }),
}));

const setup = (width: number) => {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(
    projectActions.loadSprite.fulfilled(
      {
        data: {
          ...dummySpriteSheet,
          id: "sprite1",
          filename: "sprite1.png",
          inode: `canvas${width}`,
          width,
        },
      },
      "randomid",
      "sprite1.png"
    )
  );
  // The image column shown by the drawn frame
  const draw = (direction: ActorDirection, frame = 0) => {
    const { container, unmount } = render(
      <SpriteSheetCanvas
        spriteSheetId="sprite1"
        direction={direction}
        frame={frame}
        offsetPosition
      />,
      store as any,
      {}
    );
    const element = container.querySelector("[data-frame]")!;
    const entities = store.getState().project.present.entities;
    const metasprite =
      entities.metasprites.entities[element.getAttribute("data-frame")!]!;
    const tile = entities.metaspriteTiles.entities[metasprite.tiles[0]]!;
    const result = {
      column: tile.sliceX / 16,
      flip: element.getAttribute("data-flip") === "true",
      style: (element.parentElement as HTMLElement).getAttribute("style"),
    };
    unmount();
    return result;
  };
  return { store, draw };
};

test("Should draw the frame matching an actor's direction", () => {
  const { draw } = setup(48);
  expect(draw("down")).toMatchObject({ column: 0, flip: false });
  expect(draw("up")).toMatchObject({ column: 1, flip: false });
  expect(draw("right")).toMatchObject({ column: 2, flip: false });
  expect(draw("left")).toMatchObject({ column: 2, flip: true });
});

test("Should draw the chosen frame of a fixed sheet in any direction", () => {
  const { draw } = setup(64);
  expect(draw("down", 2)).toMatchObject({ column: 2, flip: false });
  expect(draw("left", 5)).toMatchObject({ column: 1, flip: false });
});

test("Should place a larger canvas around the actor", () => {
  const { store, draw } = setup(16);
  store.dispatch(
    entitiesActions.editSpriteSheet({
      spriteSheetId: "sprite1",
      changes: { canvasWidth: 32, canvasHeight: 40 },
    })
  );
  expect(draw("down").style).toBe("top: -32px; left: -8px;");
});
