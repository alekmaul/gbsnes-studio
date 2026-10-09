/*---------------------------------------------------------------------------------
    Hardware mosaic/pixelisation effect (v4) - same frame-ticked ramp shape
    as fade.c's brightness ramp, writing REG_MOSAIC directly instead of
    PVSnesLib's own blocking setMosaicEffect() - see mosaic.h for why.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "mosaic.h"
#include "script_runner.h"

static u8 mosaic_size = 0;        /* current mosaic size, 0..15 */
static u8 mosaic_target = 0;
static u8 mosaic_mask = 0;        /* REG_MOSAIC bits 0-3 for the active ramp */
static u8 mosaic_step_frames = 1;
static u8 mosaic_tick = 0;
static u8 mosaic_active = 0;

u8 mosaic_script_wait = 0;

void MosaicInit(void)
{
    mosaic_size = 0;
    mosaic_target = 0;
    mosaic_mask = 0;
    mosaic_active = 0;
    mosaic_tick = 0;
    REG_MOSAIC = 0;
}

void MosaicSetSpeed(u8 speed)
{
    mosaic_step_frames = speed;
}

void MosaicTo(u8 size, u8 bgMask)
{
    mosaic_target = size;
    mosaic_mask = bgMask;
    mosaic_active = 1;
    mosaic_tick = 0;
}

u8 IsMosaicking(void)
{
    return mosaic_active;
}

void MosaicUpdate(void)
{
    if (!mosaic_active)
    {
        return;
    }

    if (mosaic_step_frames != 0)
    {
        mosaic_tick++;
        if (mosaic_tick < mosaic_step_frames)
        {
            return;
        }
        mosaic_tick = 0;
    }

    if (mosaic_size < mosaic_target)
    {
        mosaic_size++;
    }
    else if (mosaic_size > mosaic_target)
    {
        mosaic_size--;
    }
    REG_MOSAIC = (mosaic_size << 4) | mosaic_mask;

    if (mosaic_size == mosaic_target)
    {
        mosaic_active = 0;
        if (mosaic_script_wait)
        {
            mosaic_script_wait = 0;
            script_action_complete = 1;
        }
    }
}
