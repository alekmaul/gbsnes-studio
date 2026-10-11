import { EntityState, Dictionary } from "@reduxjs/toolkit";

export type ActorDirection = "up" | "down" | "left" | "right";
export type ActorSpriteType = "static" | "actor";
export type SpriteType = "static" | "animated" | "actor" | "actor_animated";

export type ScriptEvent = {
  id: string;
  command: string;
  args: any;
  children?: Dictionary<ScriptEvent[]>;
};

export type Actor = {
  id: string;
  name: string;
  symbol?: string;
  notes?: string;
  x: number;
  y: number;
  spriteSheetId: string;
  spriteType: ActorSpriteType;
  frame: number;
  moveSpeed: number;
  animSpeed: number | null;
  direction: ActorDirection;
  animate: boolean;
  isPinned: boolean;
  collisionGroup: string;
  script: ScriptEvent[];
  startScript: ScriptEvent[];
  updateScript: ScriptEvent[];
  hit1Script: ScriptEvent[];
  hit2Script: ScriptEvent[];
  hit3Script: ScriptEvent[];
};

export type Trigger = {
  id: string;
  name: string;
  symbol?: string;
  notes?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  script: ScriptEvent[];
};

export type Background = {
  id: string;
  name: string;
  filename: string;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
  plugin?: string;
  inode: string;
  _v: number;
};

export type MusicSettings = {
  disableSpeedConversion?: boolean;
};

export type Music = {
  id: string;
  name: string;
  filename: string;
  plugin?: string;
  settings: MusicSettings;
  inode: string;
  _v: number;
};

export type Variable = {
  id: string;
  name: string;
  symbol?: string;
};

export type CustomEventVariable = {
  id: string;
  name: string;
  type?: "8bit" | "16bit";
};

export type CustomEventActor = {
  id: string;
  name: string;
};

export type CustomEvent = {
  id: string;
  name: string;
  symbol?: string;
  description: string;
  variables: Dictionary<CustomEventVariable>;
  actors: Dictionary<CustomEventActor>;
  script: ScriptEvent[];
};

export type EngineFieldValue = {
  id: string;
  value: number | string | boolean | undefined;
};

export type SpriteState = {
  id: string;
  name: string;
  spriteSheetId: string;
};

// The 3 real values this engine can render, a subset of GB Studio's own 6
// (fixed/fixed_movement/multi/multi_movement/platform_player/cursor) - the
// other 3 have no backing here (no Platformer/Point-and-Click genre on this
// top-down-only SNES fork). Maps 1:1 onto the already-shipped pixel-geometry
// detection in snesgfx.js's imageToSpriteData: fixed -> SPRITE_STATIC,
// multi -> SPRITE_ACTOR (3-frame, side auto-mirrored), multi_movement ->
// SPRITE_ACTOR_ANIMATED (6-frame, same mirroring). See SPRITE_EDITOR_PROGRESS.md.
export type SpriteAnimationType = "fixed" | "multi" | "multi_movement";

export type SpriteSheet = {
  id: string;
  name: string;
  filename: string;
  type: SpriteType;
  numFrames: number;
  plugin?: string;
  inode: string;
  _v: number;
  states?: SpriteState[];
  // Overrides the auto-detected animationType derived from `type`/`numFrames`
  // above; undefined keeps today's pure auto-detect behaviour unchanged.
  animationType?: SpriteAnimationType;
  // Authored editor metadata, not compiled into assets.c - this engine's
  // actor collision is tile-based (can_step/npc_blocking), not per-sprite
  // bounds. Kept for schema parity / a future hook, documented as inert.
  // See SPRITE_EDITOR_PROGRESS.md.
  boundsX?: number;
  boundsY?: number;
  boundsWidth?: number;
  boundsHeight?: number;
};

// M5 (v4): first-class Font/Emote entities (assets/fonts/*.png,
// assets/ui/emotes/*.png), scanned the same way as Background/SpriteSheet.
// No `mapping` field (unlike GB Studio 3.x's Font) - every font on this
// target assumes the same fixed 224-glyph 16-wide grid layout
// (snesFixedAssets.js), since only one font is ever compiled/loaded at a
// time (no runtime font-switching yet, see EVENTS.md).
export type Font = {
  id: string;
  name: string;
  filename: string;
  plugin?: string;
  inode: string;
  _v: number;
};

export type Emote = {
  id: string;
  name: string;
  filename: string;
  plugin?: string;
  inode: string;
  _v: number;
};

// M6 (v4): banded X-axis parallax (see ParallaxLayersEditor.tsx for the
// exact height/speed semantics). Matches GB Studio 3.x's SceneParallaxLayer
// shape exactly - same field names, same meaning.
export type SceneParallaxLayer = {
  height: number;
  speed: number;
};

export type Scene = {
  id: string;
  type: string;
  name: string;
  symbol?: string;
  notes?: string;
  labelColor?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundId: string;
  playerSpriteSheetId?: string;
  collisions: number[];
  actors: string[];
  triggers: string[];
  parallax?: SceneParallaxLayer[];
  script: ScriptEvent[];
  playerHit1Script: ScriptEvent[];
  playerHit2Script: ScriptEvent[];
  playerHit3Script: ScriptEvent[];
};

export type SceneData = Omit<Scene, "actors" | "triggers"> & {
  actors: Actor[];
  triggers: Trigger[];
};

export type ProjectEntitiesData = {
  scenes: SceneData[];
  backgrounds: Background[];
  spriteSheets: SpriteSheet[];
  customEvents: CustomEvent[];
  music: Music[];
  fonts: Font[];
  emotes: Emote[];
  variables: Variable[];
};

export interface EntitiesState {
  actors: EntityState<Actor>;
  triggers: EntityState<Trigger>;
  scenes: EntityState<Scene>;
  backgrounds: EntityState<Background>;
  spriteSheets: EntityState<SpriteSheet>;
  customEvents: EntityState<CustomEvent>;
  music: EntityState<Music>;
  fonts: EntityState<Font>;
  emotes: EntityState<Emote>;
  variables: EntityState<Variable>;
  engineFieldValues: EntityState<EngineFieldValue>;
}

export type Asset = {
  filename: string;
  plugin?: string;
};

export type EntityKey = keyof EntitiesState;
