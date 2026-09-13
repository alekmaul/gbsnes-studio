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
