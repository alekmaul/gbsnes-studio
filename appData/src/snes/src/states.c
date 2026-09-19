/*
 * v2 M5a/M5b: genre dispatch tables. See states.h - indices are GB Studio
 * 2.0.0-beta5's real scene.type values, not build order. All 5 genres now
 * have real, named Start_ and Update_ functions below (Start_Noop and
 * Update_Noop are dead code, kept only as a documented "this slot is
 * genuinely empty" fallback shape if a future genre needs to be pulled back
 * out) - but "has a real function" isn't the same as "matches GB Studio
 * 3.x's full behaviour". Adventure in particular is still WIP on this SNES
 * port specifically (GB's own Adventure.c reference is complete; the gap is
 * in how much of it has been re-derived here, not a GB-side limitation) -
 * see Update_Adventure's own comments for what's been ported vs re-derived
 * vs still missing.
 */
#include "states.h"

void Start_Noop(void) {}
void Update_Noop(void) {}

void (*const startFuncs[NUM_SCENE_TYPES])(void) = {
    Start_TopDown,     /* 0 */
    Start_Platform,    /* 1 */
    Start_Adventure,   /* 2 */
    Start_Shmup,       /* 3 */
    Start_PointNClick, /* 4 */
};

void (*const updateFuncs[NUM_SCENE_TYPES])(void) = {
    Update_TopDown,
    Update_Platform,
    Update_Adventure,
    Update_Shmup,
    Update_PointNClick,
};
