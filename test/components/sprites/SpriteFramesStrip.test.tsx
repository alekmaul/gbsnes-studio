import React, { useState } from "react";
import { AnyAction, Store } from "@reduxjs/toolkit";
import { render, screen, fireEvent } from "../../react-utils";
import { RootState } from "../../../src/store/configureStore";

// Editable frame list on normal sprite sheets (SpriteSheet.frameSequence).
// SpriteSheetCanvas instantiates a real Worker at module load - mocked, see
// SpriteInspector.test.tsx.
jest.mock("../../../src/components/world/SpriteSheetCanvas", () => () => null);

// eslint-disable-next-line import/first
import { SpriteFramesStrip } from "../../../src/components/sprites/SpriteFramesStrip";

const buildStore = (dispatch: jest.Mock, sheet: Record<string, unknown>) => {
  const state = {
    project: {
      present: {
        entities: {
          spriteSheets: {
            entities: {
              sprite1: {
                id: "sprite1",
                name: "duck",
                filename: "duck.png",
                type: "animated",
                numFrames: 2,
                inode: "1",
                _v: 0,
                ...sheet,
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

// selection is owned by the page in real use (shared with SpritePreview)
const Harness = () => {
  const [selected, setSelected] = useState(0);
  return (
    <SpriteFramesStrip
      id="sprite1"
      selected={selected}
      onSelect={setSelected}
    />
  );
};

const lastChanges = (dispatch: jest.Mock) =>
  dispatch.mock.calls[dispatch.mock.calls.length - 1][0].payload.changes;

test("Duplicate on an animated sheet writes a frame list repeating the selected frame", () => {
  const dispatch = jest.fn();
  render(<Harness />, buildStore(dispatch, {}), {});
  // first "2" is the frame list's 2nd entry (the image-frames row follows it)
  fireEvent.click(screen.getAllByTitle("2")[0]);
  fireEvent.click(screen.getByText("Duplicate"));
  expect(lastChanges(dispatch)).toEqual({ frameSequence: [0, 1, 1] });
});

test("Reset clears an edited frame list", () => {
  const dispatch = jest.fn();
  render(
    <Harness />,
    buildStore(dispatch, { frameSequence: [0, 1, 1] }),
    {}
  );
  fireEvent.click(screen.getByText("Reset"));
  expect(lastChanges(dispatch)).toEqual({ frameSequence: undefined });
});

test("A directional sheet's strip stays read-only", () => {
  const dispatch = jest.fn();
  render(
    <Harness />,
    buildStore(dispatch, { type: "actor", numFrames: 3 }),
    {}
  );
  expect(screen.queryByText("Duplicate")).toBeNull();
});

test("+ on a full 6-frame list shows the limit message instead of adding a frame", () => {
  const dispatch = jest.fn();
  render(
    <Harness />,
    buildStore(dispatch, { frameSequence: [0, 1, 0, 1, 0, 1] }),
    {}
  );
  expect(screen.queryByText(/at most 6 frames/)).toBeNull();
  fireEvent.click(screen.getByText("+"));
  expect(dispatch).not.toHaveBeenCalled();
  expect(screen.getByText(/at most 6 frames/)).toBeInTheDocument();
});
