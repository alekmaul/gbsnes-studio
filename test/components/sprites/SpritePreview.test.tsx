import React from "react";
import { AnyAction, Store } from "@reduxjs/toolkit";
import { render, screen, fireEvent } from "../../react-utils";
import { RootState } from "../../../src/store/configureStore";

// SpriteSheetCanvas instantiates a real Worker at module load - mocked, see
// SpriteInspector.test.tsx.
jest.mock("../../../src/components/world/SpriteSheetCanvas", () => () => null);

// eslint-disable-next-line import/first
import { SpritePreview } from "../../../src/components/sprites/SpritePreview";

const buildStore = (numFrames: number) => {
  const state = {
    editor: { zoomSprite: 400 },
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
                numFrames,
                inode: "1",
                _v: 0,
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
    dispatch: jest.fn(),
    subscribe: () => {},
  } as unknown) as Store<RootState, AnyAction>;
};

test("The prev / play / next buttons render in the preview's top toolbar", () => {
  render(<SpritePreview id="sprite1" frame={0} onFrameChange={jest.fn()} />, buildStore(2), {});
  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(3);
  buttons.forEach((b) => expect(b).not.toBeDisabled());
});

test("A 1-frame sheet disables the playback buttons", () => {
  render(<SpritePreview id="sprite1" frame={0} onFrameChange={jest.fn()} />, buildStore(1), {});
  screen.getAllByRole("button").forEach((b) => expect(b).toBeDisabled());
});

// eslint-disable-next-line import/first
import { SpriteFramesStrip } from "../../../src/components/sprites/SpriteFramesStrip";

// The page shares one frame index between the preview and the frame strip,
// so stepping the preview moves the strip's selection (its highlight).
const SharedFrame = () => {
  const [frame, setFrame] = React.useState(0);
  return (
    <>
      <SpritePreview id="sprite1" frame={frame} onFrameChange={setFrame} />
      <SpriteFramesStrip id="sprite1" selected={frame} onSelect={setFrame} />
    </>
  );
};

test("Stepping the preview moves the frame strip's selection", () => {
  const dispatch = jest.fn();
  const store = buildStore(2);
  (store as unknown as { dispatch: jest.Mock }).dispatch = dispatch;
  render(<SharedFrame />, store, {});
  // 3rd button: the toolbar's "next"
  fireEvent.click(screen.getAllByRole("button")[2]);
  fireEvent.click(screen.getByText("Duplicate"));
  // Duplicate acts on the selected frame - now frame 2, not frame 1
  expect(dispatch.mock.calls[dispatch.mock.calls.length - 1][0].payload.changes).toEqual({
    frameSequence: [0, 1, 1],
  });
});
