#ifndef STATES_H
#define STATES_H

#include "gbs_types.h"

/*
 * v2 M5a: genre dispatch, mirrors GB's include/main.h (startFuncs[] /
 * updateFuncs[] / stateBanks[]) - scene_type (scene.h) indexes these.
 *
 * Only Top Down exists so far, so its Start_/Update_ pair is still defined
 * directly in scene.c (it just wraps existing scene.c statics) rather than
 * split into its own states/TopDown.c the way GB does - split when M5b adds
 * a second genre and there's a real reason to.
 *
 * SNES has no GBDK-style bank limit forcing a stateBanks[] equivalent (D4:
 * wla-65816 SUPERFREE sections, no manual bank switching) so there's nothing
 * to port for that part of GB's dispatch.
 */

void Start_TopDown(void);
void Update_TopDown(void);

/* Top Down's grid-size Engine Field (engine.json "topdown_grid", 8 or 16) -
 * a plain global until M7 gives it a real Engine Field pipeline. */
extern u8 topdown_grid;

extern void (*const startFuncs[])(void);
extern void (*const updateFuncs[])(void);

#endif
