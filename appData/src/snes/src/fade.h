#ifndef FADE_H
#define FADE_H

/*
 * Screen fades - the SNES stand-in for appData/src/gb/src/FadeManager.c.
 * GB cycles the 4-shade palette; here we ramp the master brightness register
 * (setBrightness, 0..15). The IsFading() API is kept so the main loop can gate
 * the scene switch on it, exactly like the GB engine.
 *
 * v4 follow-up: real white-fade support, matching GB Studio 3.x's own
 * whole-project `fade_style` Engine Field (engine.json: 0 = white, 1 =
 * black). The SNES has no hardware "lighten toward white" primitive -
 * setBrightness is a pure multiplicative darken - so a white fade instead
 * pins brightness at full and ramps every active CGRAM colour's own RGB
 * channels toward white (31,31,31) in software, recomputed fresh each step
 * from a RAM snapshot of the real, unfaded palette (never accumulated
 * frame-to-frame, matching GB Studio's own CGBFadeToWhiteStep(original,
 * step) design). The snapshot is captured once per scene load, at each of
 * the engine's 4 real dmaCopyCGram call sites (scene.c's BG-palette loop,
 * both scene.c's and ui.c's own UI-palette upload, and scene.c's OBJ-palette
 * upload) - see each Fade*Capture* function below.
 */
#include <snes.h>

void FadeInit(void);          /* level = full, not fading; screen left as-is */
void FadeSetSpeed(u8 speed);  /* frames between brightness steps; 0 = instant */
void FadeOut(void);           /* to black */
void FadeIn(void);            /* to full */
void FadeUpdate(void);        /* once per frame */
u8 IsFading(void);
u8 FadeLevel(void);           /* current brightness 0..15 (SceneInit restores to this) */

/* Sets the real INIDISP brightness register for the current fade_style:
 * fade_level itself (black style, unchanged original behaviour) or a fixed
 * 15/full (white style - the palette ramp does the dimming instead, see
 * FadeApplyWhiteStep in fade.c). Exposed so game.c's scene_unblank_pending
 * handler (which restores brightness one frame after SceneInit, outside
 * FadeUpdate's own per-tick call) applies the same style-aware rule instead
 * of calling setBrightness(FadeLevel()) directly. */
void FadeRestoreBrightness(void);

/* set by Script_FadeIn_b / Script_FadeOut_b so FadeUpdate knows to release the
 * script when the ramp finishes */
extern u8 fade_script_wait;

/* White-fade palette snapshot - called from the real CGRAM upload call
 * sites (scene.c/ui.c) right where each already reads its ROM source bytes,
 * so the snapshot always matches whatever is actually on screen. A no-op
 * cost when fade_style is black (still captured, just never read back) -
 * keeping every call site unconditionally paired with a capture is simpler
 * and safer than threading the engine-field value through every one of them.
 *
 * FadeCaptureBgChunk: one of SceneUploadBgPalette's own up to 6 16-colour
 * chunks, `slot` 0..5 in the same loop order (captured into a dense, gap-
 * free layout regardless of that loop's own physical CGRAM destination -
 * see scene.h's bg_pal_slot_color comment). `byte_len` is the same chunk
 * length already passed to dmaCopyCGram (up to 32, i.e. 16 colours). */
void FadeCaptureBgChunk(u8 slot, const u8 *src, u16 byte_len);
void FadeCaptureUiPalette(const u8 *src);   /* fixed 4 colours (UI_PAL_SIZE) */
void FadeCaptureObjPalette(const u8 *src);  /* fixed 128 colours (SPR_PAL_SIZE) */

#endif
