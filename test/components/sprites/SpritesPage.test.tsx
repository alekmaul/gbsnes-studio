import React from "react";
import Path from "path";
import { DragDropContext } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { configureStore, getDefaultMiddleware } from "@reduxjs/toolkit";
import rootReducer from "../../../src/store/rootReducer";
import spriteClipboardMiddleware from "../../../src/store/features/clipboard/spriteClipboardMiddleware";
import projectActions from "../../../src/store/features/project/projectActions";
import loadProjectData from "../../../src/lib/project/loadProjectData";
import SpritesPage from "../../../src/containers/pages/SpritesPage";
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
} from "../../react-utils";

jest.mock(
  "../../../src/components/sprites/preview/MetaspriteCanvas.worker",
  () => {
    class SilentWorker {
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
    }
    return { __esModule: true, default: SilentWorker };
  }
);
jest.mock(
  "../../../src/components/sprites/preview/SpriteSliceCanvas.worker",
  () => {
    class SilentWorker {
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
    }
    return { __esModule: true, default: SilentWorker };
  }
);

const projectRoot = Path.join(
  __dirname,
  "..",
  "..",
  "..",
  "appData",
  "templates",
  "sneshtml"
);
const projectPath = Path.join(projectRoot, "project.gbsproj");

const Page = DragDropContext(HTML5Backend)(() => <SpritesPage />);

const setup = async () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
    }).concat([spriteClipboardMiddleware]),
  });
  const data = await loadProjectData(projectPath);
  store.dispatch(
    projectActions.loadProject.fulfilled(
      { data, path: projectPath } as any,
      "randomid",
      projectPath
    )
  );
  const entities = () => store.getState().project.present.entities;
  const sheet = Object.values(entities().spriteSheets.entities).find(
    (s) => s!.filename === "player.png"
  )!;
  store.dispatch({
    type: "editor/setSelectedSpriteSheetId",
    payload: sheet.id,
  });
  render(<Page />, store as any, {});
  return { store, entities, sheet };
};

// jsdom has no layout: everything is at the origin, 100px wide
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 } as any);
});

const mouse = (
  type: "mouseDown" | "mouseMove" | "mouseUp" | "mouseOver",
  element: Element | Window,
  pageX = 0,
  pageY = 0,
  buttons = 0
) => {
  const event = createEvent[type](element as Element, { buttons });
  Object.defineProperty(event, "pageX", { value: pageX });
  Object.defineProperty(event, "pageY", { value: pageY });
  act(() => {
    fireEvent(element as Element, event);
  });
};

test("Should show the sprite list, animations and inspector", async () => {
  const { sheet } = await setup();
  expect(screen.getByText("Sprites")).toBeInTheDocument();
  expect(screen.getByText("Animations")).toBeInTheDocument();
  expect(screen.getByText("Tiles")).toBeInTheDocument();
  expect(screen.getByText("Animation Settings")).toBeInTheDocument();
  expect(screen.getByText("Collision Bounding Box")).toBeInTheDocument();
  expect(screen.getByAltText(sheet.name)).toBeInTheDocument();
  expect(screen.queryByText(/Palette/)).not.toBeInTheDocument();
});

test("Should place 8x8 and 16x16 tiles picked in the palette", async () => {
  const { store, entities, sheet } = await setup();
  const placed = () => {
    const known = new Set(initial);
    return (entities().metaspriteTiles.ids as string[])
      .filter((id) => !known.has(id))
      .map((id) => entities().metaspriteTiles.entities[id]!);
  };
  const initial = [...(entities().metaspriteTiles.ids as string[])];

  for (const size of [8, 16] as const) {
    act(() => {
      fireEvent.click(screen.getByText(`${size}x${size}`));
    });
    expect(store.getState().editor.spriteTileSize).toBe(size);

    // pick the tile at the top left of the image
    const palette = screen.getByAltText(sheet.name).parentElement!;
    mouse("mouseDown", palette, 1, 1);
    mouse("mouseUp", window, 1, 1);
    expect(store.getState().editor.spriteTileSelection).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });

    // stamp it in the middle of the frame being edited
    const editor = Array.from(document.querySelectorAll("div")).find(
      (div) => div.style.background === "rgb(255, 255, 255)"
    )!.parentElement!;
    mouse("mouseOver", editor);
    mouse("mouseMove", window, 50, 50);
    mouse("mouseDown", window, 50, 50);
  }

  expect(placed().map((t) => [t.size, t.sliceX, t.sliceY])).toEqual([
    [8, 0, 0],
    [16, 0, 0],
  ]);
});

test("Should add a state and a frame from the page", async () => {
  const { entities, sheet } = await setup();
  const states = () => entities().spriteSheets.entities[sheet.id]!.states;

  act(() => {
    fireEvent.click(screen.getByTitle("Add Animation State"));
  });
  expect(states().length).toBe(2);

  const before = entities().metasprites.ids.length;
  act(() => {
    fireEvent.click(screen.getByTitle("Add Frame"));
  });
  expect(entities().metasprites.ids.length).toBe(before + 1);
});

const editorCanvas = () =>
  Array.from(document.querySelectorAll("div")).find(
    (div) => div.style.background === "rgb(255, 255, 255)"
  )!.parentElement!;

// The player sheet is 96x16, shown at 400%
test("Should keep the selection while dragging out of the image", async () => {
  const { store, sheet } = await setup();
  const selection = () => store.getState().editor.spriteTileSelection;
  const palette = screen.getByAltText(sheet.name).parentElement!;
  const one = { x: 0, y: 0, width: 1, height: 1 };

  mouse("mouseDown", palette, 4, 4);
  // up towards the editor, then past the right edge of the image
  mouse("mouseMove", window, 4, -200);
  expect(selection()).toEqual(one);
  mouse("mouseMove", window, 1000, 4);
  expect(selection()).toEqual(one);
  // inside the image the rectangle follows the pointer
  mouse("mouseMove", window, 80, 40);
  expect(selection()).toEqual({ x: 0, y: 0, width: 2, height: 1 });
  mouse("mouseUp", window, 80, 40);
});

test("Should place tiles dragged from the palette onto the editor", async () => {
  const { entities, sheet } = await setup();
  const count = () => entities().metaspriteTiles.ids.length;
  const before = count();
  const palette = screen.getByAltText(sheet.name).parentElement!;

  mouse("mouseDown", palette, 4, 4);
  mouse("mouseMove", window, 4, -200);
  mouse("mouseOver", editorCanvas(), 50, 50, 1);
  mouse("mouseMove", window, 50, 50, 1);
  expect(count()).toBe(before);
  mouse("mouseUp", window, 50, 50);

  expect(count()).toBe(before + 1);
});

