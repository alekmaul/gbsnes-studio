/*---------------------------------------------------------------------------------
    Screen fades (M5) - master-brightness ramp, replaces GB FadeManager.c

    v4 follow-up: this file used to hand-roll the whole ramp itself
    (fade_level/fade_target/fade_step_frames/fade_tick/fade_active C
    statics). The vendored PVSnesLib toolchain update added a native
    non-blocking software fade API - setFadeEffectInit/updateFadeEffect/
    getFadeEffectLevel/isFadeEffectActive/setFadeEffectSpeed/
    setFadeEffectOut/setFadeEffectIn - and checking the real asm
    (videos.asm) shows it's a byte-for-byte match of what this file
    already did by hand, down to the same step-frame tick gating and the
    same "stop when level reaches target" check. So this file is now a
    thin wrapper around the library instead of its own implementation -
    this also removes a latent risk that was never actually hit: this
    file's own fade_level/fade_target/fade_tick/fade_active statics
    shared their exact names with the library's own asm symbols, and
    816-tcc/wlalink's flat link has no real static scoping to keep two
    same-named globals apart.

    FadeUpdate() is the one function that still needs its own logic:
    updateFadeEffect() has no concept of this engine's script_action_complete
    handshake (FADE_IN/FADE_OUT's "wait" option) - so FadeUpdate() detects
    the active -> inactive edge itself (isFadeEffectActive() before and
    after the library's own per-frame step) instead of the library ever
    needing to know about it.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "fade.h"
#include "script_runner.h"

u8 fade_script_wait = 0;

void FadeRestoreBrightness(void)
{
    setBrightness(getFadeEffectLevel());
}

void FadeInit(void)
{
    setFadeEffectInit();
    /* screen is left in whatever blank state main() set up; the first
     * SceneInit calls setBrightness(FadeLevel()) once its VRAM is loaded */
}

u8 FadeLevel(void)
{
    return getFadeEffectLevel();
}

void FadeSetSpeed(u8 speed)
{
    setFadeEffectSpeed(speed);
}

void FadeOut(void)
{
    setFadeEffectOut();
}

void FadeIn(void)
{
    setFadeEffectIn();
}

u8 IsFading(void)
{
    return isFadeEffectActive();
}

void FadeUpdate(void)
{
    if (!isFadeEffectActive())
    {
        return;
    }

    /* setBrightness() is called inside updateFadeEffect() itself now -
     * no need for this file's own FadeRestoreBrightness() call here. */
    updateFadeEffect();

    if (!isFadeEffectActive() && fade_script_wait)
    {
        fade_script_wait = 0;
        script_action_complete = 1;
    }
}
