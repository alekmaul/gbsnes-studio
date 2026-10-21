/*---------------------------------------------------------------------------------
    Hardware mosaic/pixelisation effect (v4) - same frame-ticked ramp shape
    as fade.c's brightness ramp. mosaic.h's own comment explains why this
    is a non-blocking ramp and not PVSnesLib's older blocking
    setMosaicEffect() (videos.asm).

    v4 follow-up: this file used to hand-roll that ramp itself (mosaic_size/
    mosaic_target/mosaic_mask/mosaic_step_frames/mosaic_tick/mosaic_active C
    statics). The vendored PVSnesLib toolchain update added a native
    non-blocking software mosaic API - setMosaicInit/updateMosaicEffect/
    isMosaicActive/setMosaicEffectSpeed/setMosaicTo - and checking the real
    asm (videos.asm) shows it's a byte-for-byte match of what this file
    already did by hand, down to the same step-frame tick gating, the same
    inc/dec-toward-target step, and the same REG_MOSAIC = (size<<4)|mask
    packing (and setMosaicInit already zeroes REG_MOSAIC itself). So this
    file is now a thin wrapper around the library instead of its own
    implementation - same rationale as fade.c's own v4 follow-up, including
    removing the same latent same-name-static-vs-asm-symbol risk (this file
    had mosaic_size/mosaic_target/mosaic_tick/mosaic_active matching the
    library's own asm symbol names exactly).

    MosaicUpdate() is the one function that still needs its own logic:
    updateMosaicEffect() has no concept of this engine's script_action_complete
    handshake (EVENT_MOSAIC's optional "wait" behavior) - so MosaicUpdate()
    detects the active -> inactive edge itself (isMosaicActive() before and
    after the library's own per-frame step) instead of the library ever
    needing to know about it.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "mosaic.h"
#include "script_runner.h"

u8 mosaic_script_wait = 0;

void MosaicInit(void)
{
    setMosaicInit();
}

void MosaicSetSpeed(u8 speed)
{
    setMosaicEffectSpeed(speed);
}

void MosaicTo(u8 size, u8 bgMask)
{
    setMosaicTo(size, bgMask);
}

u8 IsMosaicking(void)
{
    return isMosaicActive();
}

void MosaicUpdate(void)
{
    if (!isMosaicActive())
    {
        return;
    }

    /* REG_MOSAIC is written inside updateMosaicEffect() itself now. */
    updateMosaicEffect();

    if (!isMosaicActive() && mosaic_script_wait)
    {
        mosaic_script_wait = 0;
        script_action_complete = 1;
    }
}
