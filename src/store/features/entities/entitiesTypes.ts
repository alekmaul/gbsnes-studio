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
//
// M9 (SPRITE_EDITOR_PROGRESS.md) correction, caught before building UI on
// top of it: free-form metasprite mode is NOT a 4th value of this enum - a
// metasprite sheet still needs to say which of these 3 pose behaviours
// (frame count + direction meaning) it follows, since metasprite mode only
// changes what one frame's CONTENT is, not the frame count/meaning. See
// SpriteSheet.metaspriteMode below, a separate, orthogonal flag.
export type SpriteAnimationType = "fixed" | "multi" | "multi_movement";

// M9 (SPRITE_EDITOR_PROGRESS.md) - one individually-placed OBJ tile within a
// free-form metasprite frame. Deliberately a smaller shape than GB Studio's
// own MetaspriteTile: no objPalette/paletteIndex fields - this engine
// already assigns one OBJ palette per ACTOR SLOT (ACTOR_OBJ_PAL_POOL /
// sprite_pal_for_slot[], compileSnesData.js), not per-tile, so every tile in
// a metasprite necessarily shares its actor's one assigned palette; a
// per-tile palette choice would have no real backing on this hardware
// model and is intentionally not offered.
export type MetaspriteTile = {
  id: string;
  // Placement offset in pixels, relative to this metasprite's own origin
  // (not the source PNG) - where this tile is drawn.
  x: number;
  y: number;
  // Which 8x8 pixel region of the SpriteSheet's own source PNG this tile's
  // pixel data is sliced from.
  sliceX: number;
  sliceY: number;
  flipX: boolean;
  flipY: boolean;
  // OBJ-below-BG1.1 priority bit (matches this engine's existing
  // TILE_PROP_PRIORITY concept for BG tiles, consts.js) - authored here but
  // NOT YET wired to the engine (SceneRenderActors hardcodes priority 2 for
  // every actor OAM write today); a real multi-OAM render loop consuming
  // per-tile priority is part of M9.4, not built yet. Kept now rather than
  // added later so an author's choice here survives that future step
  // instead of needing every project's metasprites re-authored.
  priority: boolean;
};

// M9 (SPRITE_EDITOR_PROGRESS.md) - one metasprite frame: an ordered list of
// MetaspriteTile ids (back-to-front paint order, matching GB Studio's own
// convention), looked up in the owning SpriteSheet's own metaspriteTiles map.
export type Metasprite = {
  id: string;
  tiles: string[];
};

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
  // M9 (SPRITE_EDITOR_PROGRESS.md) - free-form per-tile authoring, an
  // opt-in ADDITION to animationType above, not a value of it (M10's
  // "coexist, don't replace" decision): animationType still says which of
  // the 3 real pose behaviours (frame count + direction meaning) this sheet
  // follows; metaspriteMode only changes what one frame's CONTENT is - an
  // authored list of individually-placed tiles (metasprites[i], below)
  // instead of a single fixed 16x16 block automatically sliced from the
  // source PNG. false/undefined keeps today's behaviour completely
  // unchanged regardless of animationType. Not yet consumed by the
  // compiler or engine - M9's current scope is the data layer + editor
  // only (M9.1-M9.2); compiling/rendering a real multi-tile metasprite is
  // M9.3/M9.4, not done yet.
  metaspriteMode?: boolean;
  // metasprites[i] is frame i's own tile list, in the SAME index order/
  // meaning the existing fixed/multi/multi_movement frame convention
  // already uses (see SpriteAnimationType's own comment) - undefined/
  // missing entries are empty frames (render nothing yet). metaspriteTiles
  // is every placed tile for this sheet, keyed by id, for O(1) lookup
  // during interactive editing (drag/select) regardless of how many
  // metasprites/tiles exist - avoids an O(n) scan through nested arrays on
  // every pointer-move while dragging a multi-tile selection. canvasWidth/
  // Height is the editable per-frame canvas size once metaspriteMode is on
  // (default 16x16, matching every other sheet's fixed single-block size) -
  // unlike the plain (metaspriteMode false) case, whose "Canvas Size" stays
  // fixed read-only info (every frame there is always exactly one 16x16
  // block), metasprite mode is specifically for composing something BIGGER
  // than that from multiple real tiles, so this has to be a real, authored
  // field once that mode is on.
  metasprites?: Metasprite[];
  metaspriteTiles?: Record<string, MetaspriteTile>;
  canvasWidth?: number;
  canvasHeight?: number;
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
  spriteSheets: SpriteSheet[];
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
