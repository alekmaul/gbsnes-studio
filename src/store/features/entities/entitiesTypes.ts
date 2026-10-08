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

// v4 (Path B foundation, user-asked: adapt GB Studio 3.2's real metasprite
// editor hierarchy - SpriteSheet -> AnimationState -> AnimationType-derived
// SubStates -> Frames -> metasprite tiles - into this fork's actual live
// entity model, not a separate prototype). Two SNES-specific constraints are
// baked into the shape from the start, not left for a later migration:
//   - every tile is a full 16x16 hardware sprite (this engine's existing
//     OBJ_SIZE8_L16 "large" size, scene.c/game.c) - no 8x8/32x32 tiles,
//     unlike GB Studio's own flexible per-tile size.
//   - every tile names a paletteIndex 0-7 - the SNES's real 8 OBJ palette
//     registers (CGRAM 128-255, 4bpp/16 colours each), not GB Studio's
//     2-colour-constrained OBJP0/OBJP1 pair. (compileSnesData.js's existing
//     per-scene ACTOR_OBJ_PAL_POOL reservation - palettes 1/2 held for
//     emotes/avatars - is a compiler/engine-integration concern for when
//     this hierarchy is actually wired into the compile pipeline, not
//     something this data layer enforces itself.)
//
// Deliberately plain, non-normalized nested data (SpriteAnimationState[] on
// SpriteSheet, not a separate normalizr-backed entity adapter) - matches
// this fork's own existing `states` field precedent exactly (see
// SpriteState/SpriteSheet.states above: already a plain nested array, no
// schema entry in entitiesHelpers.ts), rather than B's own fully-normalized
// per-level entity design. No `entitiesHelpers.ts` schema change needed -
// a sheet's own `animationStates` saves/loads as part of its own JSON
// exactly like `states` already does.
//
// This is new, additive data with no compiler/engine integration yet - an
// untouched sheet has no `animationStates` at all, and every existing path
// (snesgfx.js, compileSnesData.js, the Sprites page panels) keeps reading
// `type`/`numFrames`/`states` exactly as before. See CLAUDE.md's Path A/
// Path B entries for the full history and rationale.
export type SpriteAnimationType = "fixed" | "two_directions" | "four_directions";

// A pixel-space hitbox, relative to the sheet's own `origin` (SpriteSheet,
// below) - independent of however many tiles a given frame actually draws.
export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// One 16x16 hardware sprite placed within a frame, frame-origin-relative.
// `tileIndex` is left opaque here (an offset into the sheet's own VRAM tile
// data) - resolving it against real pixel data is a compiler concern, not
// this data layer's.
export type MetaspriteTile = {
  id: string;
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
  priority: boolean;
  paletteIndex: number; // 0-7
  tileIndex: number;
};

// One frame of an animation - an ordered composite of metasprite tiles. An
// empty `tiles` array is valid (e.g. a deliberate blank gap in a blink).
export type SpriteFrame = {
  id: string;
  tiles: MetaspriteTile[];
  durationMs: number;
};

// One auto-generated sub-state of an AnimationState (idle_down, moving_up,
// ...) - see SUB_STATES_BY_ANIMATION_TYPE (entitiesState.ts). The real
// authored content (the frame timeline) lives here, one level below the
// user-facing AnimationState.
export type SpriteSubState = {
  id: string;
  key: string;
  frames: SpriteFrame[];
  loop: boolean;
};

// A named, user-authored animation (Default, Attack, ...). Changing
// `animationType` regenerates `subStates` to match - see
// setSpriteAnimationStateType (entitiesState.ts), which preserves any
// existing sub-state whose key survives the change and only creates/drops
// the ones that don't.
export type SpriteAnimationState = {
  id: string;
  name: string;
  animationType: SpriteAnimationType;
  subStates: SpriteSubState[];
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
  // v4 (Path A, named animation states): a sheet's own default walk-cycle/
  // auto-cycle pace, matching GB Studio 3.x's SpriteSheet.animSpeed shape
  // (number | null). null (or unset, for a sheet saved before this field
  // existed) means "no override" - an actor keeps whatever anim_speed it
  // already had (its own authored default, or whatever a prior script event
  // set) when it equips this sheet. Applied by compileSnesData.js into a new
  // per-slot table read by Script_PlayerSetSprite_b/Script_ActorSetSprite_b
  // (appData/src/snes/src/script_cmds.c) whenever a sheet is swapped at
  // runtime - see EVENTS.md.
  animSpeed?: number | null;
  // v4 (Path A follow-up, user-asked for a real, usable "Animation Type"
  // control): overrides this sheet's otherwise file-derived runtime
  // interpretation - see helpers.js's spriteTypeDec() and
  // compileSnesData.js's buildSceneSprites. undefined = auto (today's
  // existing file-width-derived behaviour, byte-identical, confirmed by
  // spriteTypeDec's own fallback branch matching snesgfx.js's
  // imageToSpriteData exactly). Only has any real effect for `type ===
  // "actor"` (3 frames) or `"actor_animated"` (6 frames) - every other
  // frame count is always static regardless of this field, since
  // spriteTypeDec only special-cases exactly 3 or 6. This is the sheet-level
  // DEFAULT a freshly-equipped actor/player gets (SceneInit's player setup,
  // and any runtime Set Sprite Sheet/Set Sprite State swap) - the existing
  // per-actor ActorSpriteType override (ActorEditor.tsx, baked into each
  // regular actor's own scene-blob entry at compile time) is untouched and
  // still takes priority for that one actor, exactly as today.
  defaultSpriteType?: ActorSpriteType;
  // v4 (Path B foundation) - see SpriteAnimationState's own comment above
  // for the full rationale. `origin` is the single shared pivot every
  // frame's tiles (and `boundingBox`) are positioned relative to -
  // typically the character's feet, matching how this engine's own
  // existing renderer already anchors an actor's OAM draw position
  // (scene.c's SceneRenderActors, `x_rel`/`y_rel` computed from the
  // actor's feet-position convention).
  origin?: { x: number; y: number };
  boundingBox?: BoundingBox;
  animationStates?: SpriteAnimationState[];
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
