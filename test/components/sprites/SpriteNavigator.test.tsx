import React from "react";
import { AnyAction, Store } from "@reduxjs/toolkit";
import { SpriteNavigator } from "../../../src/components/sprites/SpriteNavigator";
import { render, screen, fireEvent } from "../../react-utils";
import { RootState } from "../../../src/store/configureStore";

// Named animation states (v4 follow-up) - the new "ANIMATIONS" pane added
// to the left sidebar, reusing the existing proven Sprite Swaps list
// pattern (see entitiesTypes.ts's own SpriteState/AnimState comments).

const buildStore = (dispatch: jest.Mock) => {
  const state = {
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
                states: [],
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

test("Should list the sheet's own named animation states alongside the always-present Default entry", () => {
  const dispatch = jest.fn();
  const store = buildStore(dispatch);

  render(
    <SpriteNavigator
      height={600}
      selectedId="sprite1"
      selectedStateId=""
      onSelectStateId={() => {}}
      selectedAnimStateId=""
      onSelectAnimStateId={() => {}}
    />,
    store,
    {}
  );

  expect(screen.getByText("Walk")).toBeInTheDocument();
  expect(screen.getAllByText("Default").length).toBeGreaterThanOrEqual(1);
});

test("Should dispatch addAnimState when the ANIMATIONS pane's + button is clicked", () => {
  const dispatch = jest.fn();
  const store = buildStore(dispatch);

  render(
    <SpriteNavigator
      height={600}
      selectedId="sprite1"
      selectedStateId=""
      onSelectStateId={() => {}}
      selectedAnimStateId=""
      onSelectAnimStateId={() => {}}
    />,
    store,
    {}
  );

  fireEvent.click(screen.getByTitle("Add Animation State"));

  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "entities/addAnimState",
      payload: expect.objectContaining({
        spriteSheetId: "sprite1",
        name: "Animation State",
      }),
    })
  );
});
