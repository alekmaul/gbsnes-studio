#ifndef PARALLAX_H
#define PARALLAX_H

/*
 * Banded X-axis parallax scrolling (M6, v4). See parallax.c for the design
 * note and compileSnesData.js for the compiler-side [MAX_PARALLAX_LAYERS*2]
 * scene-blob table this is populated from (SceneInit, scene.c).
 */
#include "gbs_types.h"

#define MAX_PARALLAX_LAYERS 3

/* Populated by SceneInit from the scene blob; parallax_lines[0] == 0 means
 * this scene has no parallax at all (ParallaxUpdate is a no-op either way,
 * but game.c's main loop skips calling it entirely via parallax_active). */
extern u8 parallax_lines[MAX_PARALLAX_LAYERS];
extern s8 parallax_shift[MAX_PARALLAX_LAYERS];
extern u8 parallax_active;

/* Rebuilds HDMATable16 from the current scene's bands + scroll_x (game.c)
 * and arms HDMA channel 3 via PVSnesLib's setParallaxScrolling(0) (BG1).
 * Call once per frame, in vblank, alongside bgSetScroll - X-axis only, so
 * the plain bgSetScroll Y write is still needed. */
void ParallaxUpdate(void);

#endif
