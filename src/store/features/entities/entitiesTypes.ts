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

// Sprite system ported from GB Studio 3.2.1: a sheet has named states, each
// state has 8 animations (components/sprites/helpers.ts says what each one
// means per animationType), each animation is a list of frames (metasprites)
// and each frame is a list of placed tiles.
export type SpriteAnimationType =
  | "fixed"
  | "fixed_movement"
  | "multi"
  | "multi_movement"
  | "platform_player"
  | "cursor";

// SNES difference: GB places 8x16 tiles, this engine places 8x8 or 16x16
// hardware sprites, and colours come straight from the PNG (no OBJ palette
// choice).
export type MetaspriteTileSize = 8 | 16;

export type MetaspriteTile = {
  id: string;
  // Position of the tile's bottom-left corner, in pixels, relative to the
  // bottom-left corner of the 16px wide box centred at the bottom of the
  // canvas. y grows upwards.
  x: number;
  y: number;
  // Top-left corner of the tile's pixels in the source PNG
  sliceX: number;
  sliceY: number;
  size: MetaspriteTileSize;
  flipX: boolean;
  flipY: boolean;
  priority: boolean;
};

export type Metasprite = {
  id: string;
  tiles: string[];
};

export type MetaspriteData = Omit<Metasprite, "tiles"> & {
  tiles: MetaspriteTile[];
};

export type SpriteState = {
  id: string;
  name: string;
  animationType: SpriteAnimationType;
  flipLeft: boolean;
  animations: string[];
};

export type SpriteStateData = Omit<SpriteState, "animations"> & {
  animations: SpriteAnimationData[];
};

export type SpriteAnimation = {
  id: string;
  frames: string[];
};

export type SpriteAnimationData = Omit<SpriteAnimation, "frames"> & {
  frames: MetaspriteData[];
};

export type SpriteSheet = {
  id: string;
  name: string;
  symbol: string;
  filename: string;
  width: number;
  height: number;
  numTiles: number;
  checksum: string;
  plugin?: string;
  inode: string;
  _v: number;
  canvasWidth: number;
  canvasHeight: number;
  boundsX: number;
  boundsY: number;
  boundsWidth: number;
  boundsHeight: number;
  animSpeed: number | null;
  states: string[];
  // The remaining fields are only read by the current compiler, until it
  // compiles states and animations
  numFrames: number;
  type: SpriteType;
  animationType?: SpriteAnimationType;
  frameSequence?: number[];
};

export type SpriteSheetData = Omit<SpriteSheet, "states"> & {
  states: SpriteStateData[];
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

// v4 follow-up: real per-project sound-effect assets (assets/sounds/*.wav),
// scanned the same way as Font/Emote - Sound: Play Effect's "custom" type
// picks one of these (see eventSoundPlayEffect.js), encoded to BRR by
// compileSnesSfx.js at build time.
export type SoundEffect = {
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
  spriteSheets: SpriteSheetData[];
  customEvents: CustomEvent[];
  music: Music[];
  fonts: Font[];
  emotes: Emote[];
  soundEffects: SoundEffect[];
  variables: Variable[];
};

export interface EntitiesState {
  actors: EntityState<Actor>;
  triggers: EntityState<Trigger>;
  scenes: EntityState<Scene>;
  backgrounds: EntityState<Background>;
  spriteSheets: EntityState<SpriteSheet>;
  metasprites: EntityState<Metasprite>;
  metaspriteTiles: EntityState<MetaspriteTile>;
  spriteAnimations: EntityState<SpriteAnimation>;
  spriteStates: EntityState<SpriteState>;
  customEvents: EntityState<CustomEvent>;
  music: EntityState<Music>;
  fonts: EntityState<Font>;
  emotes: EntityState<Emote>;
  soundEffects: EntityState<SoundEffect>;
  variables: EntityState<Variable>;
  engineFieldValues: EntityState<EngineFieldValue>;
}

export type Asset = {
  filename: string;
  plugin?: string;
};

export type EntityKey = keyof EntitiesState;
