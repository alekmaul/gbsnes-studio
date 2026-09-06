/*---------------------------------------------------------------------------------
    Screen fades (M5) - master-brightness ramp, replaces GB FadeManager.c
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "fade.h"
#include "script_runner.h"

static u8 fade_level = 15;  /* current brightness */
static u8 fade_target = 15;
static u8 fade_step_frames = 1;
static u8 fade_tick = 0;
static u8 fade_active = 0;

u8 fade_script_wait = 0;

void FadeInit(void)
{
    fade_level = 15;
    fade_target = 15;
    fade_active = 0;
    fade_tick = 0;
    /* screen is left in whatever blank state main() set up; the first
     * SceneInit calls setBrightness(FadeLevel()) once its VRAM is loaded */
}

u8 FadeLevel(void)
{
    return fade_level;
}

void FadeSetSpeed(u8 speed)
{
    fade_step_frames = speed;
}

void FadeOut(void)
{
    fade_target = 0;
    fade_active = 1;
    fade_tick = 0;
}

void FadeIn(void)
{
    fade_target = 15;
    fade_active = 1;
    fade_tick = 0;
}

u8 IsFading(void)
{
    return fade_active;
}

void FadeUpdate(void)
{
    if (!fade_active)
    {
        return;
    }

    if (fade_step_frames != 0)
    {
        fade_tick++;
        if (fade_tick < fade_step_frames)
        {
            return;
        }
        fade_tick = 0;
    }

    if (fade_level < fade_target)
    {
        fade_level++;
    }
    else if (fade_level > fade_target)
    {
        fade_level--;
    }
    setBrightness(fade_level);

    if (fade_level == fade_target)
    {
        fade_active = 0;
        if (fade_script_wait)
        {
            fade_script_wait = 0;
            script_action_complete = 1;
        }
    }
}
