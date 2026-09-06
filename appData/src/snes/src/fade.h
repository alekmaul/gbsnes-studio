#ifndef FADE_H
#define FADE_H

/*
 * Screen fades - the SNES stand-in for appData/src/gb/src/FadeManager.c.
 * GB cycles the 4-shade palette; here we ramp the master brightness register
 * (setBrightness, 0..15). The IsFading() API is kept so the main loop can gate
 * the scene switch on it, exactly like the GB engine.
 */
#include <snes.h>

void FadeInit(void);          /* level = full, not fading; screen left as-is */
void FadeSetSpeed(u8 speed);  /* frames between brightness steps; 0 = instant */
void FadeOut(void);           /* to black */
void FadeIn(void);            /* to full */
void FadeUpdate(void);        /* once per frame */
u8 IsFading(void);
u8 FadeLevel(void);           /* current brightness 0..15 (SceneInit restores to this) */

/* set by Script_FadeIn_b / Script_FadeOut_b so FadeUpdate knows to release the
 * script when the ramp finishes */
extern u8 fade_script_wait;

#endif
