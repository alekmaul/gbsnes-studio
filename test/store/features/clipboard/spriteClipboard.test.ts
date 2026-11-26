import { configureStore, getDefaultMiddleware } from "@reduxjs/toolkit";
import rootReducer from "../../../../src/store/rootReducer";
import spriteClipboardMiddleware from "../../../../src/store/features/clipboard/spriteClipboardMiddleware";
import clipboardActions from "../../../../src/store/features/clipboard/clipboardActions";
import entitiesActions from "../../../../src/store/features/entities/entitiesActions";
import projectActions from "../../../../src/store/features/project/projectActions";
import { dummySpriteSheet } from "../../../dummydata";

jest.mock("electron", () => {
  let text = "";
  return {
    clipboard: {
      writeText: (value: string) => {
        text = value;
      },
      readText: () => text,
    },
  };
});

const setup = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
    }).concat([spriteClipboardMiddleware]),
  });
  store.dispatch(
    projectActions.loadSprite.fulfilled(
      {
        data: {
          ...dummySpriteSheet,
          id: "sprite1",
          filename: "sprite1.png",
          inode: "clipboard",
          width: 48,
        },
      },
      "randomid",
      "sprite1.png"
    )
  );
  const entities = () => store.getState().project.present.entities;
  const states = () => entities().spriteSheets.entities["sprite1"]!.states;
  const animationsOf = (stateId: string) =>
    entities().spriteStates.entities[stateId]!.animations;
  const framesOf = (animationId: string) =>
    entities().spriteAnimations.entities[animationId]!.frames;
  const tilesOf = (metaspriteId: string) =>
    entities().metasprites.entities[metaspriteId]!.tiles.map(
      (id) => entities().metaspriteTiles.entities[id]!
    );
  const paste = (
    spriteStateId: string,
    spriteAnimationId: string,
    metaspriteId: string
  ) =>
    store.dispatch(
      clipboardActions.pasteSprite({
        spriteSheetId: "sprite1",
        spriteStateId,
        spriteAnimationId,
        metaspriteId,
      })
    );
  return { store, states, animationsOf, framesOf, tilesOf, paste };
};

const sliceOf = (tiles: { sliceX: number; size: number }[]) =>
  tiles.map((t) => [t.sliceX, t.size]);

test("Should paste copied tiles into another frame", () => {
  const { store, states, animationsOf, framesOf, tilesOf, paste } = setup();
  const [right, , , down] = animationsOf(states()[0]);
  const from = framesOf(down)[0];
  const to = framesOf(right)[0];
  const source = tilesOf(from)[0];

  store.dispatch(
    clipboardActions.copyMetaspriteTiles({ metaspriteTileIds: [source.id] })
  );
  paste(states()[0], right, to);

  expect(sliceOf(tilesOf(to))).toEqual([
    [32, 16],
    [0, 16],
  ]);
  expect(tilesOf(to)[1].id).not.toBe(source.id);
  expect(store.getState().editor.selectedMetaspriteTileIds).toEqual([
    tilesOf(to)[1].id,
  ]);
});

test("Should paste a copied frame at the end of an animation", () => {
  const { store, states, animationsOf, framesOf, tilesOf, paste } = setup();
  const [right, , , down] = animationsOf(states()[0]);

  store.dispatch(
    clipboardActions.copyMetasprites({ metaspriteIds: [framesOf(down)[0]] })
  );
  paste(states()[0], right, framesOf(right)[0]);

  expect(framesOf(right).length).toBe(2);
  expect(sliceOf(tilesOf(framesOf(right)[1]))).toEqual([[0, 16]]);
  expect(framesOf(down).length).toBe(1);
});

test("Should paste a copied state over another one", () => {
  const { store, states, animationsOf, framesOf, tilesOf, paste } = setup();
  const first = states()[0];
  store.dispatch(
    entitiesActions.addSpriteState({ spriteSheetId: "sprite1" })
  );
  const second = states()[1];

  store.dispatch(clipboardActions.copySpriteState({ spriteStateId: first }));
  paste(second, animationsOf(second)[0], "");

  const state = store.getState().project.present.entities.spriteStates.entities[
    second
  ]!;
  expect(state.animationType).toBe("multi");
  expect(state.flipLeft).toBe(true);
  animationsOf(second).forEach((animationId, index) => {
    const original = framesOf(animationsOf(first)[index]);
    const copy = framesOf(animationId);
    expect(copy.length).toBe(original.length);
    expect(copy[0]).not.toBe(original[0]);
    expect(sliceOf(tilesOf(copy[0]))).toEqual(sliceOf(tilesOf(original[0])));
  });
});

test("Should ignore a clipboard which holds no sprite data", () => {
  const { store, states, animationsOf, framesOf, paste } = setup();
  const right = animationsOf(states()[0])[0];
  require("electron").clipboard.writeText("plain text");
  const before = store.getState().project.present.entities;

  paste(states()[0], right, framesOf(right)[0]);

  expect(store.getState().project.present.entities).toBe(before);
});
