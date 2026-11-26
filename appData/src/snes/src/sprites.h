#ifndef SPRITES_H
#define SPRITES_H

/*
 * Sprite sheets, their animations and the OAM buffer.
 *
 * Every sheet a scene can show is loaded into OBJ VRAM when the scene loads;
 * the compiler (src/lib/compiler/compileSnesSprites.js, which documents the
 * data format) gives each one a "slot". A slot holds named states, a state has
 * 8 animations (down, right, up, left, then the same four while moving), an
 * animation is a run of frames and a frame is a list of 8x8 / 16x16 sprites.
 */
#include "gbs_types.h"

/* Must match compileSnesData.js */
#define MAX_SCENE_SPRITES 32

/* Animation numbers with a meaning of their own in some genres */
#define ANIM_JUMP_LEFT 0
#define ANIM_JUMP_RIGHT 2
#define ANIM_CLIMB 6
#define ANIM_CURSOR 0
#define ANIM_CURSOR_HOVER 1
#define ANIM_NONE 0xFF

/* Point at the current scene's sprite data */
void SpritesLoadScene(u16 scene);

/* The scene's slot of a project sprite sheet, or 0xFF if it isn't loaded */
u8 SpriteSlotForIndex(u16 index);

/* Show another sheet / another state of its sheet, from its first frame */
void ActorSetSheet(ACTOR *a, u8 slot);
void ActorSetState(ACTOR *a, u8 state);

/* Play a given animation, restarting it only if it shows other frames */
void ActorSetAnimation(ACTOR *a, u8 anim);
/* Play the animation matching the actor's direction and movement, unless
 * `forced` is a specific animation (ANIM_NONE otherwise) */
void ActorUpdateAnimation(ACTOR *a, u8 forced);
/* Jump to the n-th frame of the current animation (wrapping) */
void ActorSetFrameOffset(ACTOR *a, u8 n);

/* Frames of an animation, as positions in the slot's frame table */
void SpriteAnimationRange(u8 slot, u8 state, u8 anim, u8 *first, u8 *last);

/* Collision box of a slot, relative to its actor */
void SpriteBounds(u8 slot, s8 *left, s8 *right, s8 *top, s8 *bottom);

/* OAM: rebuilt every frame between SpritesBegin and SpritesEnd, front-most
 * sprite first. Sprite 0 is left to the dialogue avatar (ui.c). */
void SpritesBegin(void);
void SpritePush(s16 x, s16 y, u8 tile, u8 attr, u8 large);
void SpriteDrawFrame(u8 slot, u8 frame, s16 x, s16 y);
void SpritesEnd(void);
/* Hide every sprite, e.g. before a new scene draws its own */
void SpritesHideAll(void);

#endif
