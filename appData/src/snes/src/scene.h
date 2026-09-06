#ifndef SCENE_H
#define SCENE_H

/*
 * Scene loader + per-frame update. Ported from appData/src/gb/src/Scene.c +
 * Scene_b.c.
 *
 * M4b : scenes loaded from an index-based blob (assets.c: scenes[]),
 *       actors[] / triggers[], scene script, walk/action triggers, SWITCH_SCENE.
 * M4c : tile-locked actor movement, a scene collision bitmap, ACTOR_MOVE_TO /
 *       _RELATIVE / _TO_VALUE, IF_ACTOR_AT_POSITION, and simple NPC AI.
 *
 * Deferred to M5: fades, camera transitions, emotes, directional sprite frames
 * (the dummy sprite has no facing frames yet - only left/right flip is applied).
 */
#include "gbs_types.h"

/* Dummy scenes reuse the M3 64x64 map. The real limit comes from the target
 * descriptor + collision bitmap size. */
#define SCENE_TILE_W 64
#define SCENE_TILE_H 64
#define SCENE_COL_BYTES ((SCENE_TILE_W * SCENE_TILE_H + 7) / 8)

/* actor_move_settings bits (Scene.h on GB) */
#define ACTOR_MOVE_ENABLED 0x80
#define ACTOR_NOCLIP 0x40

extern u16 scene_index;
extern u16 scene_next_index;
extern u8 scene_loaded;

extern u8 scene_num_actors;
extern u8 scene_num_triggers;
extern u8 scene_width;  /* tiles */
extern u8 scene_height; /* tiles */

extern s16 map_next_x;
extern s16 map_next_y;
extern s8 map_next_dir_x;
extern s8 map_next_dir_y;

extern u8 actor_move_settings;
extern s16 actor_move_dest_x;
extern s16 actor_move_dest_y;

/* GB direction code (1 down, 2 left, 4 right, 8 up) -> unit vector */
void dir_to_vec(u8 d, s8 *dx, s8 *dy);

/* ACTOR_EMOTE (M5c): a bubble above actor `a` for a fixed number of frames */
void SceneStartEmote(u8 a, u8 emote_id);

void SceneInit(void);
void SceneHandleInput(void);
void SceneUpdate(void);
void SceneRequestSwitch(u16 index, u8 tile_x, u8 tile_y, u8 dir);

/* actor's true tile (top-left), pixel pos is tile*8 + 8 like the GB engine */
s16 SceneActorTileX(u8 i);
s16 SceneActorTileY(u8 i);

/* M7-cont.: SET_INPUT_SCRIPT / SET_TIMER_SCRIPT execution. `joy`/`prev_joy`
 * are raw PVSnesLib pad bits; the compiler emits masks in the GB engine's
 * compact 8-bit layout (KEY_BITS in src/lib/compiler/helpers.js), so
 * SceneGbInputBits() re-packs the SNES bits into that layout wherever a
 * compiler-emitted mask needs comparing against - also used by IF_INPUT. */
u8 SceneGbInputBits(u16 j);
void SceneScheduledScriptsInit(void); /* boot-only: zero input_script_ptrs[] */
void SceneSetInputScript(u8 mask, BANK_PTR target);
void SceneRemoveInputScript(u8 mask);
void SceneSetTimerScript(u8 duration, BANK_PTR target);
void SceneTimerRestart(void);
void SceneTimerDisable(void);
void SceneUpdateTimerScript(void);

/* SHOW_SPRITES / HIDE_SPRITES */
void SceneShowSprites(void);
void SceneHideSprites(void);

/* SCENE_PUSH_STATE / SCENE_POP_STATE / SCENE_STATE_RESET / SCENE_POP_ALL_STATE */
void SceneStackPush(void);
u8 SceneStackPop(u8 all); /* returns 0 (nothing done) if the stack was empty */
void SceneStackReset(void);

#endif
