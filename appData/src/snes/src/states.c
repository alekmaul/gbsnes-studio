/*
 * v2 M5a/M5b: genre dispatch tables. See states.h - indices are GB Studio
 * 2.0.0-beta5's real scene.type values, not build order, so slots 1-3
 * (Platformer/Adventure/Shoot Em Up) sit unfilled (Start_Noop/Update_Noop)
 * ahead of Point and Click (4), already built.
 */
#include "states.h"

void Start_Noop(void) {}
void Update_Noop(void) {}

void (*const startFuncs[NUM_SCENE_TYPES])(void) = {
    Start_TopDown,   /* 0 */
    Start_Noop,      /* 1 Platformer - not yet built (M5d) */
    Start_Noop,      /* 2 Adventure - not yet built (M5c) */
    Start_Noop,      /* 3 Shoot Em Up - not yet built (M5e) */
    Start_PointNClick, /* 4 */
};

void (*const updateFuncs[NUM_SCENE_TYPES])(void) = {
    Update_TopDown,
    Update_Noop,
    Update_Noop,
    Update_Noop,
    Update_PointNClick,
};
