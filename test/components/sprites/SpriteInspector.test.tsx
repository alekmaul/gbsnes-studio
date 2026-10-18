import React from "react";
import { AnyAction, Store } from "@reduxjs/toolkit";
import { render, screen, fireEvent } from "../../react-utils";
import { RootState } from "../../../src/store/configureStore";

// Named animation states (v4 follow-up) - the right sidebar's own settings
// panel for a selected animState (name / animation type / canvas size),
// mirroring the pre-existing Sprite Swap settings block it sits beside.
//
// SpriteInspector pulls in SpriteSheetSelectButton -> SpriteSheetCanvas,
// which instantiates a real Worker (via worker-loader) at module load time
// - something jsdom has no constructor for, and nothing in this repo's test
// setup mocks (no existing test imports this far down the tree). Pre-existing
// infra gap, unrelated to this feature - mocked locally here rather than
// touching shared jest config, since nothing else needs
// SpriteSheetCanvas's real behaviour for these assertions.
jest.mock("../../../src/components/world/SpriteSheetCanvas", () => () => null);

// eslint-disable-next-line import/first
import { SpriteInspector } from "../../../src/components/sprites/SpriteInspector";

const buildStore = (dispatch: jest.Mock) => {
  const state = {
    editor: {
      selectedMetaspriteTileIds: [],
      selectedMetaspriteFrameIndex: 0,
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
                animStates: [
                  {
                    id: "state1",
                    name: "Walk",
                    animationType: "fixed",
                    metasprites: [{ id: "m0", tiles: [] }],
                    metaspriteTiles: {},
                    canvasWidth: 16,
                    canvasHeight: 16,
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

test("Should show the selected animation state's own name field, not the sheet's", () => {
  const dispatch = jest.fn();
  const store = buildStore(dispatch);

  render(
    <SpriteInspector
      id="sprite1"
      selectedStateId=""
      selectedAnimStateId="state1"
    />,
    store,
    {}
  );

  const nameInput = screen.getByDisplayValue("Walk") as HTMLInputElement;
  expect(nameInput).toBeInTheDocument();
});

test("Should dispatch editAnimState when the selected state's name is changed", () => {
  const dispatch = jest.fn();
  const store = buildStore(dispatch);

  render(
    <SpriteInspector
      id="sprite1"
      selectedStateId=""
      selectedAnimStateId="state1"
    />,
    store,
    {}
  );

  const nameInput = screen.getByDisplayValue("Walk") as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: "Run" } });

  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "entities/editAnimState",
      payload: expect.objectContaining({
        spriteSheetId: "sprite1",
        animStateId: "state1",
        changes: { name: "Run" },
      }),
    })
  );
});
