import React from "react";
import { AnyAction, Store } from "@reduxjs/toolkit";
import { MetaspriteCanvas } from "../../../src/components/sprites/MetaspriteCanvas";
import { render } from "../../react-utils";
import { RootState } from "../../../src/store/configureStore";

// Named animation states (v4 follow-up) - a real smoke test (not just the
// reducer-level ones in entitiesState.test.ts) proving MetaspriteCanvas
// actually reads from the right container and dispatches the right
// animStateId when editing a named state rather than the sheet's own
// default metasprites. Also doubles as the only compile-time check this
// repo's tooling can give these .tsx files short of a full `npm start`
// build (see ts-jest's own diagnostics, which already caught one real
// payload-type mismatch while this feature was being wired up).

const buildState = (dispatch: jest.Mock) => {
  const state = {
    document: { root: "" },
    editor: {
      zoomSprite: 100,
      selectedMetaspriteFrameIndex: 0,
      selectedMetaspriteTileIds: [],
      spriteTileSelection: { x: 16, y: 0, width: 16, height: 16 },
      metaspriteTool: "place",
    },
    project: {
      present: {
        entities: {
          spriteSheets: {
            entities: {
              sprite1: {
                id: "sprite1",
                name: "Sprite",
                filename: "sprite1.png",
                type: "static",
                numFrames: 1,
                inode: "1",
                _v: 0,
                metaspriteMode: true,
                canvasWidth: 16,
                canvasHeight: 16,
                metasprites: [{ id: "default0", tiles: ["defaultTile"] }],
                metaspriteTiles: {
                  defaultTile: {
                    id: "defaultTile",
                    x: 0,
                    y: 0,
                    sliceX: 0,
                    sliceY: 0,
                    flipX: false,
                    flipY: false,
                    priority: false,
                  },
                },
                animStates: [
                  {
                    id: "state1",
                    name: "Walk",
                    animationType: "fixed",
                    metasprites: [{ id: "stateMeta0", tiles: [] }],
                    metaspriteTiles: {},
                    canvasWidth: 32,
                    canvasHeight: 32,
                  },
                ],
              },
            },
            ids: ["sprite1"],
          },
        },
      },
    },
  };

  return ({
    getState: () => state,
    dispatch,
    subscribe: () => {},
  } as unknown) as Store<RootState, AnyAction>;
};

test("Should read the named animation state's own canvas size, not the sheet's default", () => {
  const dispatch = jest.fn();
  const store = buildState(dispatch);

  const { container } = render(
    <MetaspriteCanvas id="sprite1" animStateId="state1" />,
    store,
    {}
  );

  const canvasArea = container.querySelector(
    "div > div > div"
  ) as HTMLDivElement | null;
  expect(canvasArea).not.toBeNull();
  // the state's own 32x32 canvas, not the sheet's own 16x16 default.
  expect(canvasArea?.style.width).toBe("32px");
  expect(canvasArea?.style.height).toBe("32px");
});

test("Should place a tile into the named animation state, leaving the sheet's own default metasprites untouched", () => {
  const dispatch = jest.fn();
  const store = buildState(dispatch);

  const { container } = render(
    <MetaspriteCanvas id="sprite1" animStateId="state1" />,
    store,
    {}
  );

  const canvasArea = container.querySelector(
    "div > div > div"
  ) as HTMLDivElement | null;
  expect(canvasArea).not.toBeNull();

  // jsdom never lays out real geometry, so getBoundingClientRect() always
  // reports a 0-sized rect at (0,0) - this click lands at canvas-space
  // (0,0), well within bounds, regardless.
  canvasArea?.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      clientX: 0,
      clientY: 0,
    })
  );

  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "entities/addMetaspriteTile",
      payload: expect.objectContaining({
        spriteSheetId: "sprite1",
        animStateId: "state1",
        frameIndex: 0,
      }),
    })
  );
});
