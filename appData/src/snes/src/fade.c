/*---------------------------------------------------------------------------------
    Screen fades (M5) - master-brightness ramp, replaces GB FadeManager.c
    v4 follow-up: real white-fade support - see fade.h's own header comment.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "fade.h"
#include "script_runner.h"
#include "scene.h"          /* bg_pal_slot_color[] - white-fade BG write-back */
#include "assets.h"         /* UI_PAL_SIZE, SPR_PAL_SIZE (byte counts) */
#include "engine_fields.h"  /* fade_style */

static u8 fade_level = 15;  /* current brightness */
static u8 fade_target = 15;
static u8 fade_step_frames = 1;
static u8 fade_tick = 0;
static u8 fade_active = 0;

u8 fade_script_wait = 0;

/* White-fade palette snapshot (BGR555 colours, one u16 each - cast to u8*
 * for dmaCopyCGram, same little-endian 2-bytes-per-colour layout every real
 * CGRAM upload in this engine already uses). Dense layout: [0..95] BG (6
 * slots x 16 colours - the skipped physical slot 1 is not represented
 * here), [96..99] UI, [100..227] OBJ. */
#define FADE_PAL_BG_COLORS  96
#define FADE_PAL_UI_COLORS  (UI_PAL_SIZE / 2)   /* 4 */
#define FADE_PAL_OBJ_COLORS (SPR_PAL_SIZE / 2)  /* 128 */
#define FADE_PAL_UI_OFFSET  FADE_PAL_BG_COLORS
#define FADE_PAL_OBJ_OFFSET (FADE_PAL_BG_COLORS + FADE_PAL_UI_COLORS)
#define FADE_PAL_TOTAL       (FADE_PAL_BG_COLORS + FADE_PAL_UI_COLORS + FADE_PAL_OBJ_COLORS)

static u16 fade_pal_original[FADE_PAL_TOTAL];
static u16 fade_pal_scratch[FADE_PAL_TOTAL];
/* How many of the 96 possible BG colours this scene actually captured
 * (bg_pals_len[bg_index] may cover fewer than all 6 slots) - mirrors
 * SceneUploadBgPalette's own `remaining` logic so the write-back loop knows
 * exactly which physical slots/lengths to target. */
static u16 fade_pal_bg_len = 0;

void FadeCaptureBgChunk(u8 slot, const u8 *src, u16 byte_len)
{
    u16 colors = byte_len / 2;
    u16 i;
    for (i = 0; i < colors; i++)
    {
        fade_pal_original[(u16)slot * 16 + i] = (u16)src[i * 2] | ((u16)src[i * 2 + 1] << 8);
    }
    fade_pal_bg_len = (u16)slot * 16 + colors;
}

void FadeCaptureUiPalette(const u8 *src)
{
    u16 i;
    for (i = 0; i < FADE_PAL_UI_COLORS; i++)
    {
        fade_pal_original[FADE_PAL_UI_OFFSET + i] = (u16)src[i * 2] | ((u16)src[i * 2 + 1] << 8);
    }
}

void FadeCaptureObjPalette(const u8 *src)
{
    u16 i;
    for (i = 0; i < FADE_PAL_OBJ_COLORS; i++)
    {
        fade_pal_original[FADE_PAL_OBJ_OFFSET + i] = (u16)src[i * 2] | ((u16)src[i * 2 + 1] << 8);
    }
}

/* One white-fade step: re-lerp every captured colour fresh from
 * fade_pal_original (never from the previous step's own output, so error
 * never accumulates) toward (31,31,31), then DMA the result to the same 4
 * real physical CGRAM destinations the normal scene load uses. fade_level
 * means *visibility* here exactly like the black path (15 = fully visible
 * original, 0 = fully faded) - so the blend weight toward white is
 * (15 - fade_level)/15, the inverse of fade_level itself. Brightness stays
 * pinned at 15 by the caller - with the palette itself doing the
 * lightening, a darkened master brightness would wash out the white
 * target. */
static u16 FadeLerpColorToWhite(u16 c, u16 weight)
{
    u8 r = c & 0x1f;
    u8 g = (c >> 5) & 0x1f;
    u8 b = (c >> 10) & 0x1f;
    r = (u8)(r + ((31 - r) * weight) / 15);
    g = (u8)(g + ((31 - g) * weight) / 15);
    b = (u8)(b + ((31 - b) * weight) / 15);
    return (u16)r | ((u16)g << 5) | ((u16)b << 10);
}

/* A real 816-tcc miscompile, found and pinned down by direct Mesen testing
 * (hardcoded debug writes, isolating one call at a time): a region's own
 * dmaCopyCGram call can silently target the wrong CGRAM address when its
 * blended source data was prepared by a *different* function that already
 * returned earlier in the same FadeApplyWhiteStep invocation - even a prior
 * function that itself never touches dmaCopyCGram (confirmed: a single
 * prior call to a plain blend loop with no DMA in it was enough to trigger
 * it for the UI region). Calling FadeLerpColorToWhite many times *within*
 * the same function as its own trailing dmaCopyCGram call is fine - it's
 * specifically returning from a separate function beforehand that
 * corrupts something used to pass that call's own arguments. BG's write
 * (FadeWriteBackBg) never showed this regardless of how many other
 * functions ran first, so it isn't a general "N calls in a row" rule - it's
 * specific to each call's own compiled code, and empirically UI's and OBJ's
 * calls needed the self-contained treatment while BG's didn't. Worked
 * around (not root-caused, matching this engine's established approach to
 * other 816-tcc quirks - see CLAUDE.md's "816-tcc traps hit so far") by
 * making the UI and OBJ writes each fully self-contained (own inline
 * blend, own local buffer, no separate blend function) and calling both
 * before anything else in FadeApplyWhiteStep. */
static void FadeApplyWhiteUi(u16 white_weight)
{
    u16 tmp[FADE_PAL_UI_COLORS];
    u16 i;
    for (i = 0; i < FADE_PAL_UI_COLORS; i++)
    {
        tmp[i] = FadeLerpColorToWhite(fade_pal_original[FADE_PAL_UI_OFFSET + i], white_weight);
    }
    dmaCopyCGram((u8 *)tmp, 16, FADE_PAL_UI_COLORS * 2);
}

static void FadeApplyWhiteObj(u16 white_weight)
{
    u16 tmp[FADE_PAL_OBJ_COLORS];
    u16 i;
    for (i = 0; i < FADE_PAL_OBJ_COLORS; i++)
    {
        tmp[i] = FadeLerpColorToWhite(fade_pal_original[FADE_PAL_OBJ_OFFSET + i], white_weight);
    }
    dmaCopyCGram((u8 *)tmp, 128, FADE_PAL_OBJ_COLORS * 2);
}

static void FadeBlendBg(u16 white_weight)
{
    u16 i;
    for (i = 0; i < fade_pal_bg_len; i++)
    {
        fade_pal_scratch[i] = FadeLerpColorToWhite(fade_pal_original[i], white_weight);
    }
}

static void FadeWriteBackBg(void)
{
    u16 remaining = fade_pal_bg_len;
    u8 s;
    for (s = 0; s < 6; s++)
    {
        u16 chunk_colors;
        if (remaining == 0) break;
        chunk_colors = (remaining > 16) ? 16 : remaining;
        dmaCopyCGram((u8 *)&fade_pal_scratch[(u16)s * 16], bg_pal_slot_color[s], chunk_colors * 2);
        remaining -= chunk_colors;
    }
}

static void FadeApplyWhiteStep(void)
{
    u16 white_weight = 15 - fade_level;

    /* Must run before anything else - see FadeApplyWhiteUi's own comment. */
    FadeApplyWhiteUi(white_weight);
    FadeApplyWhiteObj(white_weight);

    FadeBlendBg(white_weight);
    FadeWriteBackBg();
}

void FadeRestoreBrightness(void)
{
    if (fade_style == 0)
    {
        /* White: brightness pinned at full, the palette ramp does the
         * actual dimming/lightening. */
        setBrightness(15);
    }
    else
    {
        setBrightness(fade_level);
    }
}

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

    FadeRestoreBrightness();
    if (fade_style == 0)
    {
        FadeApplyWhiteStep();
    }

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
