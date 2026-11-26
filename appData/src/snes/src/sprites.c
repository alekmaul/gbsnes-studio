/*
 * Sprite sheets, animations and OAM - see sprites.h.
 *
 * 816-tcc notes (see the engine README): no 3-term && / || chains in a
 * condition, s16 rather than s8 parameters, and nothing in .bss is assumed to
 * start at zero.
 */
#include <snes.h>
#include "sprites.h"
#include "assets.h"

#define OAM_BYTES 512     /* 128 sprites of 4 bytes, then the high table */
#define OAM_FIRST 4       /* sprite 0 belongs to the dialogue avatar */
#define OAM_HIDDEN_Y 0xF0 /* below the 224 visible lines */
#define SCREEN_W 256
#define SCREEN_H 224

static const unsigned char *scene_data;
static const unsigned char *slot_data[MAX_SCENE_SPRITES];
static const unsigned char *slot_frames[MAX_SCENE_SPRITES];
static const unsigned char *scene_slot_map;
static u8 slot_count;

static u16 oam_next;
static u16 oam_shown; /* end of the sprites shown by the previous frame */

/* High table: 2 bits per sprite, X bit 8 and size */
static const u8 oam_high_clear[4] = {0xFC, 0xF3, 0xCF, 0x3F};
static const u8 oam_high_x[4] = {0x01, 0x04, 0x10, 0x40};
static const u8 oam_high_large[4] = {0x02, 0x08, 0x20, 0x80};

static u16 read16(const unsigned char *p)
{
    return p[0] | ((u16)p[1] << 8);
}

void SpritesLoadScene(u16 scene)
{
    u8 i;
    scene_data = scene_sprite_data_ptrs[scene];
    scene_slot_map = scene_sprite_slot_ptrs[scene];
    slot_count = scene_data[0];
    if (slot_count > MAX_SCENE_SPRITES)
    {
        slot_count = MAX_SCENE_SPRITES;
    }
    for (i = 0; i < slot_count; i++)
    {
        const unsigned char *slot = scene_data + read16(scene_data + 1 + ((u16)i << 1));
        slot_data[i] = slot;
        slot_frames[i] = slot + read16(slot + 5 + ((u16)slot[4] << 1));
    }
}

u8 SpriteSlotForIndex(u16 index)
{
    if (index >= NUM_SPRITE_SHEETS) return 0xFF;
    return scene_slot_map[index];
}

void SpriteAnimationRange(u8 slot, u8 state, u8 anim, u8 *first, u8 *last)
{
    const unsigned char *p;
    const unsigned char *set;
    if (slot >= slot_count)
    {
        *first = 0;
        *last = 0;
        return;
    }
    p = slot_data[slot];
    if (state >= p[4]) state = 0;
    set = p + read16(p + 5 + ((u16)state << 1)) + ((u16)anim << 1);
    *first = set[0];
    *last = set[1];
}

void ActorSetAnimation(ACTOR *a, u8 anim)
{
    u8 first, last;
    u8 restart = 0;
    SpriteAnimationRange(a->slot, a->state, anim, &first, &last);
    if (a->anim == ANIM_NONE) restart = 1;
    if (first != a->frame_start) restart = 1;
    if (last != a->frame_end) restart = 1;
    a->anim = anim;
    a->frame_start = first;
    a->frame_end = last;
    if (restart) a->frame = first;
}

void ActorUpdateAnimation(ACTOR *a, u8 forced)
{
    u8 anim = 0; /* facing down */
    if (forced != ANIM_NONE)
    {
        anim = forced;
    }
    else
    {
        if (a->dir_y < 0) anim = 2;
        else if (a->dir_x > 0) anim = 1;
        else if (a->dir_x < 0) anim = 3;
        /* anim_hold bridges the 1-frame stops between two tiles */
        if (a->moving) anim += 4;
        else if (a->anim_hold) anim += 4;
    }
    if (anim != a->anim)
    {
        ActorSetAnimation(a, anim);
    }
}

void ActorSetSheet(ACTOR *a, u8 slot)
{
    a->slot = slot;
    a->state = 0;
    a->anim = ANIM_NONE;
    ActorUpdateAnimation(a, ANIM_NONE);
}

void ActorSetState(ACTOR *a, u8 state)
{
    a->state = state;
    a->anim = ANIM_NONE;
    ActorUpdateAnimation(a, ANIM_NONE);
}

void ActorSetFrameOffset(ACTOR *a, u8 n)
{
    u16 length = (u16)(a->frame_end - a->frame_start) + 1;
    a->frame = a->frame_start + (u8)(n % length);
}

void SpriteBounds(u8 slot, s8 *left, s8 *right, s8 *top, s8 *bottom)
{
    const unsigned char *p;
    if (slot >= slot_count)
    {
        *left = -8;
        *right = 7;
        *top = -16;
        *bottom = -1;
        return;
    }
    p = slot_data[slot];
    *left = (s8)p[0];
    *right = (s8)p[1];
    *top = (s8)p[2];
    *bottom = (s8)p[3];
}

void SpritesBegin(void)
{
    oam_next = OAM_FIRST;
}

/* Writes PVSnesLib's OAM shadow buffer directly (copied to OAM every vblank):
 * far cheaper than oamSet() + oamSetEx() per sprite under 816-tcc. */
void SpritePush(s16 x, s16 y, u8 tile, u8 attr, u8 large)
{
    u16 o = oam_next;
    u16 high;
    u8 i, v;
    s16 hidden = large ? -16 : -8;

    if (o >= OAM_BYTES) return;
    if (x <= hidden) return;
    if (x >= SCREEN_W) return;
    if (y <= hidden) return;
    if (y >= SCREEN_H) return;

    oamMemory[o] = (u8)x;
    oamMemory[o + 1] = (u8)y; /* a negative y wraps to the top, as wanted */
    oamMemory[o + 2] = tile;
    oamMemory[o + 3] = attr;

    i = (u8)((o >> 2) & 3);
    high = OAM_BYTES + (o >> 4);
    v = oamMemory[high] & oam_high_clear[i];
    if (x < 0) v |= oam_high_x[i];
    if (large) v |= oam_high_large[i];
    oamMemory[high] = v;

    oam_next = o + 4;
}

/* The same job as SpritePush() for every sprite of a frame, written out in the
 * loop: under 816-tcc a function call per sprite costs more than the work, and
 * 14 actors no longer fitted in a video frame. */
void SpriteDrawFrame(u8 slot, u8 frame, s16 x, s16 y)
{
    const unsigned char *frames;
    const unsigned char *p;
    u16 o, high, sx, sy, reach;
    u8 n, i, v;

    if (slot >= slot_count) return;
    /* Nothing of a frame is further than 128 pixels from its actor: skip
     * actors which can't reach the screen without reading their data */
    if (x < -144) return;
    if (x > SCREEN_W + 128) return;
    if (y < -144) return;
    if (y > SCREEN_H + 128) return;

    frames = slot_frames[slot];
    if (frame >= frames[0]) return;
    frames += 1 + ((u16)frame << 1);
    p = slot_data[slot] + (frames[0] | ((u16)frames[1] << 8));
    n = *p;
    p++;
    o = oam_next;
    while (n)
    {
        sx = x + (s8)p[0];
        sy = y + (s8)p[1];
        reach = 7;
        if (p[4]) reach = 15;
        /* visible when -reach <= position < screen size, which is a single
         * unsigned comparison once shifted by reach */
        if ((u16)(sx + reach) < (u16)(SCREEN_W + reach))
        {
            if ((u16)(sy + reach) < (u16)(SCREEN_H + reach))
            {
                if (o < OAM_BYTES)
                {
                    oamMemory[o] = (u8)sx;
                    oamMemory[o + 1] = (u8)sy;
                    oamMemory[o + 2] = p[2];
                    oamMemory[o + 3] = p[3];

                    i = (u8)((o >> 2) & 3);
                    high = OAM_BYTES + (o >> 4);
                    v = oamMemory[high] & oam_high_clear[i];
                    if (sx & 0x100) v |= oam_high_x[i]; /* negative x */
                    if (p[4]) v |= oam_high_large[i];
                    oamMemory[high] = v;

                    o += 4;
                }
            }
        }
        p += 5;
        n--;
    }
    oam_next = o;
}

void SpritesEnd(void)
{
    u16 o;
    for (o = oam_next; o < oam_shown; o += 4)
    {
        oamMemory[o + 1] = OAM_HIDDEN_Y;
    }
    oam_shown = oam_next;
}

void SpritesHideAll(void)
{
    u16 o;
    for (o = 0; o < OAM_BYTES; o += 4)
    {
        oamSetVisible(o, OBJ_HIDE);
    }
    oam_next = OAM_FIRST;
    oam_shown = OAM_FIRST;
}
