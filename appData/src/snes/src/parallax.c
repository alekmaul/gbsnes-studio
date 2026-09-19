/*---------------------------------------------------------------------------------
    Banded X-axis parallax scrolling (M6, v4).

    Ported conceptually from GB Studio 3.x's parallax_rows[] / PARALLAX_STEP
    (N bands stacked top-to-bottom on the SAME background, each scrolling at
    its own rate relative to the camera) - but the mechanism is completely
    different. GB has no hardware for this: its engine reprograms SCX/SCY
    from an LCD STAT (LYC) interrupt fired at each band's start scanline.
    The SNES has real hardware for exactly this instead - HDMA - so there is
    no interrupt handler here at all: PVSnesLib's setParallaxScrolling()
    (dmas.asm) arms HDMA channel 3 from a small table (HDMATable16) that the
    PPU itself walks once per scanline during the active picture, rewriting
    BG1HOFS with no CPU involvement after this function returns.

    X-axis only, matching setParallaxScrolling() itself (it drives a single
    BGxHOFS register - see dmas.asm's _bgscridx table). GB Studio 3.x's own
    parallax also shifts Y per band; there's no equivalent SNES helper for
    that and no engine need identified yet, so this is a deliberately
    narrower port, not an oversight.
---------------------------------------------------------------------------------*/
#include "parallax.h"
#include <snes.h>

u8 parallax_lines[MAX_PARALLAX_LAYERS];
s8 parallax_shift[MAX_PARALLAX_LAYERS];
u8 parallax_active = 0;

extern s16 scroll_x; /* game.c - the same value bgSetScroll(0, ...) uses */

void ParallaxUpdate(void)
{
    u8 i;
    u16 idx = 0;
    s16 shifted;

    for (i = 0; i < MAX_PARALLAX_LAYERS; i++)
    {
        if (parallax_lines[i] == 0) break;

        if (parallax_shift[i] > 0)
        {
            shifted = scroll_x >> parallax_shift[i];
        }
        else if (parallax_shift[i] < 0)
        {
            shifted = scroll_x << (-parallax_shift[i]);
        }
        else
        {
            shifted = scroll_x;
        }

        HDMATable16[idx] = parallax_lines[i];
        *(u16 *)&HDMATable16[idx + 1] = (u16)shifted;
        idx += 3;
    }
    HDMATable16[idx] = 0; /* terminator - PVSnesLib requires this */

    setParallaxScrolling(0); /* BG1 */
}
