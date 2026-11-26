// Copy and paste of sprite tiles, frames and states, ported from GB Studio
// 3.2.1's clipboardMiddleware
import { Dispatch, Middleware, Dictionary } from "@reduxjs/toolkit";
import { RootState } from "../../configureStore";
import {
  metaspriteSelectors,
  metaspriteTileSelectors,
  spriteAnimationSelectors,
  spriteStateSelectors,
} from "../entities/entitiesState";
import {
  Metasprite,
  MetaspriteTile,
  SpriteAnimation,
} from "../entities/entitiesTypes";
import entitiesActions from "../entities/entitiesActions";
import editorActions from "../editor/editorActions";
import actions from "./clipboardActions";
import {
  ClipboardTypeMetasprites,
  ClipboardTypeMetaspriteTiles,
  ClipboardTypeSpriteState,
  readSpriteClipboard,
  writeSpriteClipboard,
} from "./spriteClipboard";

const defined = <T>(values: (T | undefined)[]): T[] =>
  values.filter((v): v is T => !!v);

const spriteClipboardMiddleware: Middleware<Dispatch, RootState> = (store) => (
  next
) => (action) => {
  const state = store.getState();

  const framesData = (metaspriteIds: string[]) => {
    const metaspritesLookup = metaspriteSelectors.selectEntities(state);
    const tilesLookup = metaspriteTileSelectors.selectEntities(state);
    const metasprites: Metasprite[] = defined(
      metaspriteIds.map((id) => metaspritesLookup[id])
    );
    const metaspriteTiles: MetaspriteTile[] = defined(
      ([] as string[])
        .concat(...metasprites.map((m) => m.tiles))
        .map((id) => tilesLookup[id])
    );
    return { metasprites, metaspriteTiles };
  };

  const addTiles = (
    spriteSheetId: string,
    tiles: MetaspriteTile[],
    metaspriteIdOf: (tile: MetaspriteTile) => string
  ) =>
    tiles.map((tile) => {
      const add = entitiesActions.addMetaspriteTile({
        spriteSheetId,
        metaspriteId: metaspriteIdOf(tile),
        x: tile.x,
        y: tile.y,
        sliceX: tile.sliceX,
        sliceY: tile.sliceY,
        size: tile.size,
        flipX: tile.flipX,
        flipY: tile.flipY,
        priority: tile.priority,
      });
      store.dispatch(add);
      return add.payload.metaspriteTileId;
    });

  // Append copies of some frames to an animation
  const addFrames = (
    spriteSheetId: string,
    spriteAnimationId: string,
    metasprites: Metasprite[],
    tiles: MetaspriteTile[]
  ) => {
    for (const metasprite of metasprites) {
      const add = entitiesActions.addMetasprite({
        spriteSheetId,
        spriteAnimationId,
      });
      store.dispatch(add);
      const frameTiles = defined(
        metasprite.tiles.map((id) => tiles.find((t) => t.id === id))
      );
      addTiles(spriteSheetId, frameTiles, () => add.payload.metaspriteId);
    }
  };

  if (actions.copyMetaspriteTiles.match(action)) {
    const tilesLookup = metaspriteTileSelectors.selectEntities(state);
    writeSpriteClipboard({
      __type: ClipboardTypeMetaspriteTiles,
      metaspriteTiles: defined(
        action.payload.metaspriteTileIds.map((id) => tilesLookup[id])
      ),
    });
  } else if (actions.copyMetasprites.match(action)) {
    writeSpriteClipboard({
      __type: ClipboardTypeMetasprites,
      ...framesData(action.payload.metaspriteIds),
    });
  } else if (actions.copySpriteState.match(action)) {
    const spriteState = spriteStateSelectors.selectById(
      state,
      action.payload.spriteStateId
    );
    if (spriteState) {
      const lookup = spriteAnimationSelectors.selectEntities(state);
      const animations: SpriteAnimation[] = defined(
        spriteState.animations.map((id) => lookup[id])
      );
      writeSpriteClipboard({
        __type: ClipboardTypeSpriteState,
        spriteState,
        animations,
        ...framesData(([] as string[]).concat(...animations.map((a) => a.frames))),
      });
    }
  } else if (actions.pasteSprite.match(action)) {
    const data = readSpriteClipboard();
    const {
      spriteSheetId,
      metaspriteId,
      spriteAnimationId,
      spriteStateId,
    } = action.payload;

    if (data?.__type === ClipboardTypeSpriteState) {
      const spriteState = spriteStateSelectors.selectById(state, spriteStateId);
      if (spriteState) {
        store.dispatch(
          entitiesActions.editSpriteState({
            spriteStateId,
            changes: {
              animationType: data.spriteState.animationType,
              flipLeft: data.spriteState.flipLeft,
            },
          })
        );
        spriteState.animations.forEach((animationId, index) => {
          const source = data.animations[index];
          if (!source) {
            return;
          }
          store.dispatch(
            entitiesActions.editSpriteAnimation({
              spriteSheetId,
              spriteAnimationId: animationId,
              changes: { frames: [] },
            })
          );
          addFrames(
            spriteSheetId,
            animationId,
            defined(
              source.frames.map((id) =>
                data.metasprites.find((m) => m.id === id)
              )
            ),
            data.metaspriteTiles
          );
        });
      }
    } else if (data?.__type === ClipboardTypeMetasprites) {
      addFrames(
        spriteSheetId,
        spriteAnimationId,
        data.metasprites,
        data.metaspriteTiles
      );
    } else if (data?.__type === ClipboardTypeMetaspriteTiles) {
      const newIds = addTiles(
        spriteSheetId,
        data.metaspriteTiles,
        () => metaspriteId
      );
      store.dispatch(editorActions.setSelectedMetaspriteTileIds(newIds));
    }
  }

  return next(action);
};

export default spriteClipboardMiddleware;
