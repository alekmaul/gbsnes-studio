import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../../configureStore";
import { ActorDirection } from "../entities/entitiesTypes";
import projectActions from "../project/projectActions";

type ShowConnectionsSetting = "all" | "selected" | true | false;

export type SettingsState = {
  // SNES is the only compile target this app builds for (see
  // src/lib/compiler/targets/) - these three have no default in the type
  // itself, TargetPicker.js's former per-field `|| "ntsc"`/`|| "03"`/`|| 8`
  // fallbacks (now in SettingsPage.tsx) cover an older .gbsproj that
  // predates one of them.
  snesRegion?: "ntsc" | "pal";
  snesSramSize?: string;
  snesRomBanks?: number;
  startSceneId: string;
  playerSpriteSheetId: string;
  // Per scene-type default (keyed by SceneTypeSelect's numeric-string
  // `value`, e.g. "0".."4" - this fork never adopted GB Studio 3.x's
  // string-enum scene type, see CLAUDE.md/memory). Falls back to the
  // single `playerSpriteSheetId` above when a scene type has no entry -
  // ported from GB Studio 3.2.1's `defaultPlayerSprites`, additive (no
  // migration needed: an empty `{}` degrades to the old single-default
  // behaviour exactly).
  defaultPlayerSprites: Record<string, string>;
  startX: number;
  startY: number;
  startMoveSpeed: number;
  startAnimSpeed: number | null;
  startDirection: ActorDirection;
  showCollisions: boolean;
  showConnections: ShowConnectionsSetting;
  worldScrollX: number;
  worldScrollY: number;
  zoom: number;
  customHead: string;
  navigatorSplitSizes: number[];
  showNavigator: boolean;
  favoriteEvents: string[];
};

export const initialState: SettingsState = {
  startSceneId: "",
  playerSpriteSheetId: "",
  defaultPlayerSprites: {},
  startX: 0,
  startY: 0,
  startMoveSpeed: 1,
  startAnimSpeed: 3,
  startDirection: "down",
  showCollisions: true,
  showConnections: "selected",
  worldScrollX: 0,
  worldScrollY: 0,
  zoom: 100,
  customHead: "",
  navigatorSplitSizes: [300, 100, 100],
  showNavigator: true,
  favoriteEvents: ["EVENT_TEXT", "EVENT_SWITCH_SCENE"],
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    editSettings: (state, action: PayloadAction<Partial<SettingsState>>) => {
      return {
        ...state,
        ...action.payload,
      };
    },

    editPlayerStartAt: (
      state,
      action: PayloadAction<{ sceneId: string; x: number; y: number }>
    ) => {
      state.startSceneId = action.payload.sceneId;
      state.startX = action.payload.x;
      state.startY = action.payload.y;
    },

    setShowNavigator: (state, action: PayloadAction<boolean>) => {
      state.showNavigator = action.payload;
    },

    setSceneTypeDefaultPlayerSprite: (
      state,
      action: PayloadAction<{
        sceneType: string;
        spriteSheetId: string;
      }>
    ) => {
      state.defaultPlayerSprites[action.payload.sceneType] =
        action.payload.spriteSheetId;
    },

    toggleFavoriteEvent: (state, action: PayloadAction<string>) => {
      if (state.favoriteEvents.includes(action.payload)) {
        state.favoriteEvents = state.favoriteEvents.filter(
          (id) => id !== action.payload
        );
      } else {
        state.favoriteEvents.push(action.payload);
      }
    },
  },
  extraReducers: (builder) =>
    builder.addCase(projectActions.loadProject.fulfilled, (state, action) => {
      return {
        ...state,
        ...action.payload.data.settings,
      };
    }),
});

export const getSettings = (state: RootState) => state.project.present.settings;

export const { actions, reducer } = settingsSlice;

export default reducer;
