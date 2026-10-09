#ifndef MOSAIC_H
#define MOSAIC_H

/*
 * Hardware mosaic/pixelisation effect - REG_MOSAIC (0x2106): bits 7-4 are
 * the mosaic block size (0 = off/1x1, 15 = largest/16x16), bits 3-0 enable
 * the effect per background (bit0 = BG1, bit1 = BG2, bit2 = BG3, bit3 =
 * BG4, see background.h). Ramped frame by frame exactly like fade.c's
 * brightness ramp, not PVSnesLib's own setMosaicEffect() (videos.asm):
 * that helper blocks the CPU for the whole ramp (16 steps x 3 vblanks each,
 * always the full 0..15 range, no configurable step rate) - fine for a
 * one-off intro effect, but it would stall this engine's cooperative
 * script VM and every other actor/animation update for up to 48+ frames,
 * and can't target a partial size the way this event's own `size` field
 * asks for. Only BG1 and BG3 are ever meaningful targets here - BG2 is
 * unused by this engine (game.c forces it off) and BG4 doesn't exist in
 * Mode 1. Sprites (OBJ) have no hardware mosaic at all on the SNES - the
 * effect only ever divides BG layers, so there is no sprite target to add.
 */
#include <snes.h>

void MosaicInit(void);            /* size = 0 (off), not animating */
void MosaicSetSpeed(u8 speed);    /* frames between size steps; 0 = every frame */
void MosaicTo(u8 size, u8 bgMask); /* size 0..15, bgMask: REG_MOSAIC bits 0-3 */
void MosaicUpdate(void);          /* once per frame */
u8 IsMosaicking(void);

/* set by Script_MosaicSet_b so MosaicUpdate knows to release the script
 * when the ramp reaches its target */
extern u8 mosaic_script_wait;

#endif
