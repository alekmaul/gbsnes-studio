#ifndef STATES_H
#define STATES_H

#include "gbs_types.h"

/*
 * v2 M5a/M5b: genre dispatch, mirrors GB's include/main.h (startFuncs[] /
 * updateFuncs[] / stateBanks[]) - scene_type (scene.h) indexes these.
 *
 * Indices match GB Studio 2.0.0-beta5's own scene.type values exactly
 * (src/components/forms/SceneTypeSelect.tsx) - NOT the order the M5 sub-
 * steps are built in (see MIGRATION_V2_AUDIT.md section 7's revised order:
 * Top Down -> Point and Click -> Adventure -> Platformer -> Shoot Em Up).
 * This matters for forward compatibility: M7's compileSnesData.js will read
 * the real project's scene.type and must emit this exact byte, so the
 * mapping can't be "whichever order we happened to implement genres in."
 *
 * Both implemented pairs are still defined directly in scene.c (each just
 * wraps existing scene.c statics/helpers - actor_try_move, can_step,
 * SceneCheckTriggers, ...) rather than split into per-genre
 * "states" files the way GB does. Re-deferred at M5b (the "second genre" trigger the M5a
 * comment named) rather than actually done: 816-tcc's documented cross-file
 * static/extern friction (gbs_types.h, scene.c's own header comment) makes a
 * real split non-trivial busywork with zero behavioural upside at 2 genres -
 * worth doing once there are enough genres that the one-file layout actually
 * hurts readability, not on principle now.
 *
 * Unimplemented slots (1 Platformer, 2 Adventure, 3 Shoot Em Up) point at
 * explicit no-ops, not at Top Down's pair - a scene blob with one of these
 * scene_type values should do nothing rather than silently behave like Top
 * Down (misleading) or dereference an unfilled function pointer (crash).
 */

void Start_TopDown(void);
void Update_TopDown(void);
void Start_PointNClick(void);
void Update_PointNClick(void);
void Start_Adventure(void);
void Update_Adventure(void);
void Start_Platform(void);
void Update_Platform(void);
void Start_Shmup(void);
void Update_Shmup(void);
void Start_Noop(void);
void Update_Noop(void);

#define SCENE_TYPE_TOPDOWN 0
#define SCENE_TYPE_PLATFORMER 1
#define SCENE_TYPE_ADVENTURE 2
#define SCENE_TYPE_SHMUP 3
#define SCENE_TYPE_POINTNCLICK 4
#define NUM_SCENE_TYPES 5

/* Top Down's grid-size Engine Field (engine.json "topdown_grid", 8 or 16) -
 * a plain global until M7 gives it a real Engine Field pipeline. */
extern u8 topdown_grid;

extern void (*const startFuncs[])(void);
extern void (*const updateFuncs[])(void);

#endif
