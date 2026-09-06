/*---------------------------------------------------------------------------------
    Scene loader + update - ported from appData/src/gb/src/Scene.c + Scene_b.c

    M4b: load a scene from an index-based blob, actors[] / triggers[], scene
         script, walk/action triggers, SWITCH_SCENE.
    M4c: tile-locked movement, scene collision bitmap, ACTOR_MOVE_TO family,
         IF_ACTOR_AT_POSITION, simple NPC AI (random walk / face).
    M6:  per-scene BG upload (tiles + map + palette + map size) from the
         assets bg_*_ptrs tables - the BG is no longer a one-time main() setup.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "scene.h"
#include "assets.h"
#include "script_runner.h"
#include "fade.h"

u16 scene_index = 0xFFFF;
u16 scene_next_index = 0;
u8 scene_loaded = 0;
u8 scene_num_actors = 0;
u8 scene_num_triggers = 0;
u8 scene_width = SCENE_TILE_W;
u8 scene_height = SCENE_TILE_H;

s16 map_next_x = 0;
s16 map_next_y = 0;
s8 map_next_dir_x = 0;
s8 map_next_dir_y = 1;

u8 actor_move_settings = 0;
s16 actor_move_dest_x = 0;
s16 actor_move_dest_y = 0;

/* emote bubble (M5c) */
u8 emote_actor = 0;
u8 emote_id = 0;
u8 emote_time = 0;

static TRIGGER triggers[MAX_TRIGGERS];
static u8 check_triggers = 1;
static u8 scene_col[SCENE_COL_BYTES];

/* SET_INPUT_SCRIPT / SET_TIMER_SCRIPT (M7-cont.). Input scripts are global,
 * one slot per GB-layout button bit, and persist across scene loads (matches
 * the GB engine - only REMOVE_INPUT_SCRIPT clears one). The timer script is a
 * single auto-repeating slot, disabled on every scene load like GB. */
static BANK_PTR input_script_ptrs[8];
static u8 timer_script_duration = 0;
static u8 timer_script_time = 0;
static BANK_PTR timer_script_ptr;

/* SHOW_SPRITES / HIDE_SPRITES. GB toggles a single hardware OAM-enable bit;
 * here SceneRenderActors just skips the oamSetEx(...OBJ_SHOW) every frame
 * while hidden. Reset to visible on every scene load, matching GB's
 * SceneInit (SHOW_SPRITES right before DISPLAY_ON). */
static u8 sprites_hidden = 0;

/* SCENE_PUSH_STATE / SCENE_POP_STATE / SCENE_STATE_RESET / SCENE_POP_ALL_STATE.
 * A small stack of (scene, player tile pos, player facing) snapshots, e.g. for
 * a pause-menu scene that later returns exactly where the player left off.
 * Global, not reset on scene load (matches GB - only *_RESET/consuming pops
 * clear it). */
#define MAX_SCENE_STATES 8
typedef struct
{
    u16 scene_index;
    u8 tile_x, tile_y;
    s8 dir_x, dir_y;
} SCENE_STATE;
static SCENE_STATE scene_stack[MAX_SCENE_STATES];
static u8 scene_stack_ptr = 0;

/* provided by game.c */
extern s16 scroll_x, scroll_y;
extern u16 prev_joy;
extern u8 time;

/*--------------------------------------------------------------------------- */

// A function, not a macro: 816-tcc miscompiles the `a && b && c` chain this
// feeds when it is inlined into a compound `if` (the false branch fell through
// into the block), so keep the &&-chains short and out of conditionals.
static u8 actor_on_tile(u8 i)
{
    if ((actors[i].x & 7) != 0) return 0;
    if ((actors[i].y & 7) != 0) return 0;
    return 1;
}
#define ACTOR_ON_TILE(i) actor_on_tile(i)

s16 SceneActorTileX(u8 i) { return (actors[i].x - 8) >> 3; }
s16 SceneActorTileY(u8 i) { return (actors[i].y - 8) >> 3; }

void dir_to_vec(u8 d, s8 *dx, s8 *dy)
{
    *dx = d == 2 ? -1 : d == 4 ? 1 : 0;
    *dy = d == 8 ? -1 : d == 1 ? 1 : 0;
}

static void run_script(BANK_PTR ptr, u8 actor)
{
    BANK_PTR local = ptr;
    script_actor = actor;
    ScriptStart(&local);
}

// Re-pack PVSnesLib's raw pad bits into the GB engine's compact byte layout
// (right=0x01, left=0x02, up=0x04, down=0x08, a=0x10, b=0x20, select=0x40,
// start=0x80 - see KEY_BITS in src/lib/compiler/helpers.js). IF_INPUT and the
// input-script slots below are matched against masks the compiler emits in
// that layout, not the raw SNES joypad bits.
u8 SceneGbInputBits(u16 j)
{
    u8 b = 0;
    if (j & KEY_RIGHT)  b |= 0x01;
    if (j & KEY_LEFT)   b |= 0x02;
    if (j & KEY_UP)     b |= 0x04;
    if (j & KEY_DOWN)   b |= 0x08;
    if (j & KEY_A)      b |= 0x10;
    if (j & KEY_B)      b |= 0x20;
    if (j & KEY_SELECT) b |= 0x40;
    if (j & KEY_START)  b |= 0x80;
    return b;
}

void SceneScheduledScriptsInit(void)
{
    u8 i;
    for (i = 0; i < 8; i++)
    {
        input_script_ptrs[i].ptr = 0;
    }
    timer_script_duration = 0;
    timer_script_time = 0;
    timer_script_ptr.ptr = 0;
}

void SceneSetInputScript(u8 mask, BANK_PTR target)
{
    // Only the lowest set bit is used, matching the GB engine's behaviour
    // when a caller passes a mask with several bits set.
    u8 index = 0;
    while (index < 8)
    {
        if (mask & 1) break;
        index++;
        mask >>= 1;
    }
    if (index < 8)
    {
        input_script_ptrs[index] = target;
    }
}

void SceneRemoveInputScript(u8 mask)
{
    u8 index;
    for (index = 0; index < 8; index++)
    {
        if (mask & 1)
        {
            input_script_ptrs[index].ptr = 0;
        }
        mask >>= 1;
    }
}

void SceneSetTimerScript(u8 duration, BANK_PTR target)
{
    // A local copy, not `timer_script_ptr = target;` directly: 816-tcc's
    // struct-by-value parameter copy-out references a `_locals` frame symbol
    // it only emits when the function has a genuine local variable - with
    // none, the reference is left unresolved and linking fails (matches the
    // `run_script` local-copy pattern above, which sidesteps the same trap).
    BANK_PTR t = target;
    timer_script_duration = duration;
    timer_script_time = duration;
    timer_script_ptr = t;
}

void SceneTimerRestart(void)
{
    timer_script_time = timer_script_duration;
}

void SceneTimerDisable(void)
{
    timer_script_duration = 0;
}

void SceneShowSprites(void)
{
    sprites_hidden = 0;
}

void SceneHideSprites(void)
{
    sprites_hidden = 1;
}

void SceneStackPush(void)
{
    if (scene_stack_ptr < MAX_SCENE_STATES)
    {
        scene_stack[scene_stack_ptr].scene_index = scene_index;
        scene_stack[scene_stack_ptr].tile_x = (u8)SceneActorTileX(0);
        scene_stack[scene_stack_ptr].tile_y = (u8)SceneActorTileY(0);
        scene_stack[scene_stack_ptr].dir_x = actors[0].dir_x;
        scene_stack[scene_stack_ptr].dir_y = actors[0].dir_y;
        scene_stack_ptr++;
    }
}

// Pops one level (`all`=0) or all the way to the bottom of the stack
// (`all`=1, leaving it empty) and requests the switch to land there.
// Returns 0 with nothing done if the stack was already empty.
u8 SceneStackPop(u8 all)
{
    SCENE_STATE s;
    if (!scene_stack_ptr)
    {
        return 0;
    }
    if (all)
    {
        scene_stack_ptr = 0;
    }
    else
    {
        scene_stack_ptr--;
    }
    s = scene_stack[scene_stack_ptr];
    // dir code 1 (down) is a placeholder - SceneRequestSwitch's dir_to_vec
    // result is overwritten right after with the actual saved facing.
    SceneRequestSwitch(s.scene_index, s.tile_x, s.tile_y, 1);
    map_next_dir_x = s.dir_x;
    map_next_dir_y = s.dir_y;
    return 1;
}

void SceneStackReset(void)
{
    scene_stack_ptr = 0;
}

void SceneUpdateTimerScript(void)
{
    if (!scene_loaded) return;
    if (script_ptr) return;
    if (IsFading()) return;
    if (timer_script_duration == 0) return;

    if (timer_script_time == 0)
    {
        // Don't start the script while the player is mid-step, like GB.
        if (!actor_on_tile(0)) return;
        run_script(timer_script_ptr, 0);
        timer_script_time = timer_script_duration;
    }
    else
    {
        // One tick every 16 frames, matching the compiler's TIMER_CYCLES scale.
        if ((time & 0x0F) == 0)
        {
            timer_script_time--;
        }
    }
}

// Is tile (px, py) inside the w*h box at (bx, by)? Sequential compares, not a
// 4-term && chain (816-tcc mis-links those in a conditional).
static u8 in_box(s16 px, s16 py, s16 bx, s16 by, s16 bw, s16 bh)
{
    if (px < bx) return 0;
    if (px >= bx + bw) return 0;
    if (py < by) return 0;
    if (py >= by + bh) return 0;
    return 1;
}

// Solid at (tx, ty)? Out of bounds counts as solid.
static u8 col_solid(s16 tx, s16 ty)
{
    u16 idx;
    // One test per if: 816-tcc mis-links long boolean chains in a conditional.
    if (tx < 0) return 1;
    if (ty < 0) return 1;
    if (tx >= scene_width) return 1;
    if (ty >= scene_height) return 1;
    idx = (u16)ty * scene_width + (u16)tx;
    return (scene_col[idx >> 3] >> (idx & 7)) & 1;
}

// The 16px sprite of actor i occupies tiles [tx, tx+1] x [ty, ty+1]. Return the
// index of another actor blocking a one-tile step in (dx, dy), or 0xFF.
// (dx/dy are int, not s8 - 816-tcc mangles small-type params in 3-arg calls.)
static u8 npc_blocking(u16 skip, s16 dx, s16 dy)
{
    s16 tx = SceneActorTileX(skip) + dx;
    s16 ty = SceneActorTileY(skip) + dy;
    u8 j;
    for (j = 0; j <= scene_num_actors && j < MAX_ACTORS; j++)
    {
        s16 jx, jy;
        if (j == skip) continue;
        if (!actors[j].enabled) continue;
        if (!actors[j].collisions_enabled) continue;
        jx = SceneActorTileX(j);
        jy = SceneActorTileY(j);
        if (tx > jx + 1) continue;
        if (tx + 1 < jx) continue;
        if (ty > jy + 1) continue;
        if (ty + 1 < jy) continue;
        return j;
    }
    return 0xFF;
}

// Can actor i start a one-tile step in unit direction (dx, dy)?
static u8 can_step(u16 i, s16 dx, s16 dy)
{
    s16 tx = SceneActorTileX(i);
    s16 ty = SceneActorTileY(i);
    // The 16px sprite spans two tiles across the leading edge; both must be free.
    if (dx > 0)
    {
        if (col_solid(tx + 2, ty)) return 0;
        if (col_solid(tx + 2, ty + 1)) return 0;
        return 1;
    }
    if (dx < 0)
    {
        if (col_solid(tx - 1, ty)) return 0;
        if (col_solid(tx - 1, ty + 1)) return 0;
        return 1;
    }
    if (dy > 0)
    {
        if (col_solid(tx, ty + 2)) return 0;
        if (col_solid(tx + 1, ty + 2)) return 0;
        return 1;
    }
    if (dy < 0)
    {
        if (col_solid(tx, ty - 1)) return 0;
        if (col_solid(tx + 1, ty - 1)) return 0;
        return 1;
    }
    return 1;
}

static void actor_face(u16 i, s16 dx, s16 dy)
{
    actors[i].dir_x = (s8)dx;
    actors[i].dir_y = (s8)dy;
    // flip/tile for a directional sprite are derived from dir_x/dir_y fresh
    // every render call (see actor_render_tile in SceneRenderActors below),
    // not persisted here - matches the GB engine's own SceneRenderActor_b.
}

// Try to start a tile-aligned step. Sets actors[i].moving.
static void actor_try_move(u16 i, s16 dx, s16 dy)
{
    actor_face(i, dx, dy);

    if (dx == 0 && dy == 0)
    {
        actors[i].moving = 0;
        return;
    }

    // NOCLIP scripted move: bypass collision. Nested ifs, not `a && b && c`.
    if (actor_move_settings & ACTOR_NOCLIP)
    {
        if (i == script_actor && script_ptr)
        {
            actors[i].moving = 1;
            if (i == 0) check_triggers = 1;
            return;
        }
    }

    if (actors[i].collisions_enabled)
    {
        if (npc_blocking(i, dx, dy) != 0xFF)
        {
            actors[i].moving = 0;
            return;
        }
        if (!can_step(i, dx, dy))
        {
            actors[i].moving = 0;
            return;
        }
    }

    if (i == 0) check_triggers = 1;
    actors[i].moving = 1;
}

/*--------------------------------------------------------------------------- */

void SceneRequestSwitch(u16 index, u8 tile_x, u8 tile_y, u8 dir)
{
    scene_next_index = index;
    map_next_x = tile_x;
    map_next_y = tile_y;
    dir_to_vec(dir, &map_next_dir_x, &map_next_dir_y);
    script_ptr = 0;
    actor_move_settings = 0;
    // Force a reload even when switching "to" the scene already loaded (e.g.
    // popping a scene-state stack entry back to the current scene) - GB does
    // the same in every scene-switch handler (Script_LoadScene_b included).
    scene_loaded = 0;
}

/*
 * Scene blob:
 *   [0] bg_pal_idx  [1] num_actors  [2] num_triggers  [3] scene_script_idx
 *   [4] width       [5] height
 *   actors   (9 bytes): tile_x, tile_y, dir, movement_type, sprite_idx,
 *                       script_idx, sprite_type, anim_speed, animate
 *   triggers (6 bytes): tile_x, tile_y, w, h, type, script_idx
 *   collision bitmap: ceil(width * height / 8) bytes, row-major, bit set = solid
 */

/* frames_len from the per-actor sprite_type + the sheet's frame count:
 * a 6-frame SPRITE_ACTOR_ANIMATED walks 2 poses per direction; a 6-frame sheet
 * on a non-moving actor (SPRITE_STATIC) is a manual/auto 6-frame cycle;
 * everything else is a single frame. */
static u8 frames_len_for(u8 sprite_type, u8 slot)
{
    if (sprite_type == SPRITE_ACTOR_ANIMATED) return 2;
    if (sprite_type == SPRITE_STATIC && sprite_frames_for_slot[slot] == 6) return 6;
    return 1;
}

void SceneInit(void)
{
    const unsigned char *s = scenes[scene_index];
    u8 bg_index = s[0];
    u8 scene_script_idx = s[3];
    u8 sc_size = SC_32x32;
    const unsigned char *p;
    u16 col_bytes;
    u16 j;
    u8 i;

    scene_num_actors = s[1];
    scene_num_triggers = s[2];
    scene_width = s[4] ? s[4] : SCENE_TILE_W;
    scene_height = s[5] ? s[5] : SCENE_TILE_H;
    p = s + 6;

    /* pick the tilemap size from the BG dimensions (one 2-term test per if) */
    if (bg_map_w[bg_index] > 32) sc_size = SC_64x64;
    if (bg_map_h[bg_index] > 32) sc_size = SC_64x64;

    /* Force blank for the (large) VRAM DMAs; setBrightness() restores it below,
     * or leaves it black if a fade-in is pending after a SWITCH_SCENE. */
    WaitForVBlank();
    setScreenOff();
    dmaCopyVram((u8 *)bg_tiles_ptrs[bg_index], 0x2000, bg_tiles_len[bg_index]);
    dmaCopyVram((u8 *)bg_maps_ptrs[bg_index], 0x0000, bg_maps_len[bg_index]);
    dmaCopyCGram((u8 *)bg_pals_ptrs[bg_index], 0, bg_pals_len[bg_index]);
    /* UI (BG3) palette -> CGRAM 16..19 (palette field 4), after the BG palette. */
    dmaCopyCGram((u8 *)ui_pal, 16, UI_PAL_SIZE);
    bgSetMapPtr(0, 0x0000, sc_size);
    bgSetGfxPtr(0, 0x2000);

    actors[0].x = ((s16)map_next_x << 3) + 8;
    actors[0].y = ((s16)map_next_y << 3) + 8;
    actors[0].dir_x = map_next_dir_x;
    actors[0].dir_y = map_next_dir_y;
    actors[0].enabled = 1;
    actors[0].moving = 0;
    actors[0].flip = 0;
    actors[0].frame = 0;
    actors[0].animate = 0;
    actors[0].anim_hold = 0;
    actors[0].anim_speed = PLAYER_ANIM_SPEED;
    actors[0].frame_offset = PLAYER_SPRITE_SLOT * 2; /* OBJ grid TL tile */
    actors[0].sprite_type = PLAYER_SPRITE_TYPE;
    actors[0].frames_len = frames_len_for(PLAYER_SPRITE_TYPE, PLAYER_SPRITE_SLOT);
    actors[0].move_speed = 1;
    actors[0].collisions_enabled = 1;

    for (i = 1; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        actors[i].x = ((s16)p[0] << 3) + 8;
        actors[i].y = ((s16)p[1] << 3) + 8;
        dir_to_vec(p[2], &actors[i].dir_x, &actors[i].dir_y);
        actors[i].movement_type = p[3];
        actors[i].frame_offset = p[4] * 2; /* sprite slot -> OBJ grid TL tile */
        actors[i].flip = 0;
        actors[i].frame = 0;
        actors[i].anim_hold = 0;
        actors[i].moving = 0;
        actors[i].enabled = 1;
        actors[i].move_speed = 1;
        actors[i].collisions_enabled = 1;
        actors[i].sprite_type = p[6];
        actors[i].anim_speed = p[7];
        actors[i].animate = p[8];
        actors[i].frames_len = frames_len_for(p[6], p[4]);
        actors[i].events_ptr = event_ptrs[p[5]];
        p += 9;
    }
    for (; i < MAX_ACTORS; i++)
    {
        actors[i].enabled = 0;
        /* Hide the unused OAM slots once here - SceneRenderActors only walks
         * 0..scene_num_actors every frame, so it never touches these again. */
        oamSetVisible((u16)i << 2, OBJ_HIDE);
    }

    for (i = 0; i < scene_num_triggers && i < MAX_TRIGGERS; i++)
    {
        triggers[i].x = p[0];
        triggers[i].y = p[1];
        triggers[i].w = p[2] < 1 ? 1 : p[2];
        triggers[i].h = p[3] < 1 ? 1 : p[3];
        triggers[i].type = p[4];
        triggers[i].events_ptr = event_ptrs[p[5]];
        p += 6;
    }

    col_bytes = ((u16)scene_width * scene_height + 7) >> 3;
    if (col_bytes > SCENE_COL_BYTES)
    {
        col_bytes = SCENE_COL_BYTES;
    }
    for (j = 0; j < col_bytes; j++)
    {
        scene_col[j] = p[j];
    }
    for (; j < SCENE_COL_BYTES; j++)
    {
        scene_col[j] = 0;
    }

    actor_move_settings = 0;
    check_triggers = 1;
    scene_loaded = 1;
    emote_time = 0;
    timer_script_duration = 0; /* disable any timer script from the last scene */
    sprites_hidden = 0; /* GB: SHOW_SPRITES right before DISPLAY_ON on every scene load */

    /* Un-blank to the fade's current level: 15 on a normal load, 0 (still
     * black) when a SWITCH_SCENE fade-in is pending - FadeIn() then ramps it. */
    setBrightness(FadeLevel());

    run_script(event_ptrs[scene_script_idx], 0);
}

/*--------------------------------------------------------------------------- */

static void SceneTryInteract(void)
{
    s16 ntx = SceneActorTileX(0) + actors[0].dir_x;
    s16 nty = SceneActorTileY(0) + actors[0].dir_y;
    u8 i;

    for (i = 1; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        if (!actors[i].enabled)
        {
            continue;
        }
        {
            s16 ax = SceneActorTileX(i);
            s16 ay = SceneActorTileY(i);
            if (in_box(ntx, nty, ax, ay, 2, 2))
            {
                // Face the player and stop
                actor_face(i, -actors[0].dir_x, -actors[0].dir_y);
                actors[i].moving = 0;
                run_script(actors[i].events_ptr, i);
                return;
            }
        }
    }

    for (i = 0; i < scene_num_triggers; i++)
    {
        if (triggers[i].type != 1) continue;
        if (in_box(ntx, nty, triggers[i].x, triggers[i].y,
                   triggers[i].w, triggers[i].h))
        {
            run_script(triggers[i].events_ptr, 0);
            return;
        }
    }
}

void SceneHandleInput(void)
{
    s8 dx = 0, dy = 0;

    if (script_ptr)
    {
        // While a script runs the player is not d-pad controllable, but a
        // scripted ACTOR_MOVE_TO of the player owns actors[0].moving - leave it.
        if (!(actor_move_settings & ACTOR_MOVE_ENABLED))
        {
            actors[0].moving = 0;
        }
        return;
    }
    if (!ACTOR_ON_TILE(0))
    {
        return; // mid-step
    }

    // Input scripts: one slot per button (SET_INPUT_SCRIPT), only re-checked
    // once the raw joy state changes - matches the GB engine so a script
    // fires once per press rather than every frame the button stays held.
    if (joy != 0 && joy != prev_joy)
    {
        u8 gbj = SceneGbInputBits(joy);
        u8 i;
        for (i = 0; i < 8; i++)
        {
            if ((gbj & (1 << i)) && input_script_ptrs[i].ptr)
            {
                actors[0].moving = 0;
                run_script(input_script_ptrs[i], 0);
                return;
            }
        }
    }

    if ((joy & KEY_A) && !(prev_joy & KEY_A))
    {
        SceneTryInteract();
        if (script_ptr)
        {
            actors[0].moving = 0;
            return;
        }
    }

    if (joy & KEY_LEFT)       dx = -1;
    else if (joy & KEY_RIGHT) dx = 1;
    else if (joy & KEY_UP)    dy = -1;
    else if (joy & KEY_DOWN)  dy = 1;

    if (dx || dy)
    {
        actor_try_move(0, dx, dy);
    }
    else
    {
        actors[0].moving = 0;
    }
}

static void SceneCheckTriggers(void)
{
    s16 tx, ty;
    u8 i;

    // Sequential ifs, not `a || b || c`: 816-tcc mis-links the branch targets of
    // a 3-term boolean chain in a conditional (a walk trigger was firing while a
    // scripted ACTOR_MOVE_TO of the player was still paused mid-script).
    if (!check_triggers) return;
    if (script_ptr) return;
    if (!actor_on_tile(0)) return;

    tx = SceneActorTileX(0);
    ty = SceneActorTileY(0);

    for (i = 0; i < scene_num_triggers; i++)
    {
        if (triggers[i].type != 0)
        {
            continue;
        }
        if (in_box(tx, ty, triggers[i].x, triggers[i].y,
                   triggers[i].w, triggers[i].h))
        {
            check_triggers = 0;
            actors[0].moving = 0;
            run_script(triggers[i].events_ptr, 0);
            return;
        }
    }
}

// Random-walk / random-face NPC AI, on frames 0/64/128/192 like the GB engine.
static void SceneUpdateAi(void)
{
    u8 i;
    s8 dirs[4][2] = {{0, -1}, {0, 1}, {-1, 0}, {1, 0}};

    if ((time & 0x3F) != 0)
    {
        return;
    }
    for (i = 1; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        if (script_ptr) return;
        if (!actors[i].enabled) continue;
        if (actors[i].moving) continue;
        {
            u8 r = ((time >> 6) + i + actors[i].x) & 3;
            if (actors[i].movement_type == MOVE_AI_RANDOM_FACE)
            {
                actor_face(i, dirs[r][0], dirs[r][1]);
            }
            else if (actors[i].movement_type == MOVE_AI_RANDOM_WALK)
            {
                if (ACTOR_ON_TILE(i))
                {
                    actor_try_move(i, dirs[r][0], dirs[r][1]);
                }
            }
        }
    }
}

// Walk-cycle animation (M7-cont. phase 2). Ported from the GB engine's own
// frame-cycle loop (Scene_b.c): on the /8 tick, for each actor whose
// anim_speed threshold is met, step actors[i].frame through 0..frames_len-1
// while it is moving (a real walk cycle) or has the "animate" flag (a
// decorative always-cycling sprite, e.g. a torch). An idle walk sprite settles
// back to pose 0. anim_speed: 4 fastest (every 8 frames) .. 0 slowest (128).
static void SceneAnimateActors(void)
{
    u8 i, thr, do_anim;

    if ((time & 7) != 0) return;

    for (i = 0; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        if (!actors[i].enabled) continue;
        if (actors[i].frames_len <= 1) continue;

        thr = 7;
        if (actors[i].anim_speed == 3) thr = 15;
        if (actors[i].anim_speed == 2) thr = 31;
        if (actors[i].anim_speed == 1) thr = 63;
        if (actors[i].anim_speed == 0) thr = 127;
        if ((time & thr) != 0) continue;

        do_anim = 0;
        if (actors[i].animate) do_anim = 1;
        /* anim_hold bridges the 1-frame `moving`=0 dips at tile boundaries so a
         * continuously-walking actor keeps cycling. */
        if (actors[i].moving || actors[i].anim_hold)
        {
            if (actors[i].sprite_type != SPRITE_STATIC) do_anim = 1;
        }

        if (!do_anim)
        {
            /* settled idle (anim_hold ran out) -> back to the standing pose */
            if (actors[i].sprite_type == SPRITE_ACTOR_ANIMATED && actors[i].anim_hold == 0)
            {
                actors[i].frame = 0;
            }
            continue;
        }

        if (actors[i].frame + 1 >= actors[i].frames_len) actors[i].frame = 0;
        else actors[i].frame++;
    }
}

static void SceneUpdateActors(void)
{
    u8 scripting = 0;
    u8 i;

    // Nested ifs, not `(a & b) && (c < d)`: see the actor_on_tile comment.
    if (actor_move_settings & ACTOR_MOVE_ENABLED)
    {
        if (script_actor < MAX_ACTORS)
        {
            scripting = 1;
        }
    }

    // Script-commanded walk: re-aim the actor on each tile boundary.
    if (scripting && actor_on_tile(script_actor))
    {
        u8 a = script_actor;
        u8 arrived = 0;
        if (actors[a].x == actor_move_dest_x)
        {
            if (actors[a].y == actor_move_dest_y) arrived = 1;
        }
        if (arrived)
        {
            actor_move_settings &= ~ACTOR_MOVE_ENABLED;
            actors[a].moving = 0;
            script_action_complete = 1;
            scripting = 0;
        }
        else
        {
            s8 dx = 0, dy = 0;
            if (actors[a].x > actor_move_dest_x)      dx = -1;
            else if (actors[a].x < actor_move_dest_x) dx = 1;
            else if (actors[a].y > actor_move_dest_y) dy = -1;
            else if (actors[a].y < actor_move_dest_y) dy = 1;

            actor_try_move(a, dx, dy);
            if (!actors[a].moving)
            {
                // Blocked - abandon the move and let the script continue.
                actor_move_settings &= ~ACTOR_MOVE_ENABLED;
                script_action_complete = 1;
                scripting = 0;
            }
        }
    }

    // Step every moving actor. A scripted actor keeps its `moving` flag between
    // tiles (only the aim block or arrival clears it).
    for (i = 0; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        u8 is_cmd = 0;
        if (scripting)
        {
            if (i == script_actor) is_cmd = 1;
        }
        if (!actors[i].enabled)
        {
            continue;
        }
        if (!actors[i].moving && !is_cmd)
        {
            if (actors[i].anim_hold) actors[i].anim_hold--;
            continue;
        }
        actors[i].anim_hold = 4; /* moved this frame - see gbs_types.h */
        if (actors[i].move_speed == 0)
        {
            if ((time & 1) == 0)
            {
                actors[i].x += actors[i].dir_x;
                actors[i].y += actors[i].dir_y;
            }
        }
        else
        {
            actors[i].x += (s16)actors[i].dir_x * actors[i].move_speed;
            actors[i].y += (s16)actors[i].dir_y * actors[i].move_speed;
        }

        if (ACTOR_ON_TILE(i) && !is_cmd)
        {
            actors[i].moving = 0;
        }
    }

    SceneUpdateAi();
}

/* ---- emote bubble (M5c) ------------------------------------------------ */

void SceneStartEmote(u8 a, u8 e)
{
    emote_actor = a;
    emote_id = e;
    emote_time = 50;
}

static void SceneUpdateEmote(void)
{
    if (emote_time == 0)
    {
        return;
    }
    emote_time--;
    if (emote_time == 0)
    {
        script_action_complete = 1;
    }
}

#define EMOTE_OID ((u16)MAX_ACTORS << 2)

// M7-cont. sprite frames. A 3-frame SPRITE_ACTOR sheet has one pose per
// direction (down = frame_offset, up = +ACTOR_UP_TILE0, side = +ACTOR_SIDE_TILE0,
// flipped when dir_x<0). A 6-frame SPRITE_ACTOR_ANIMATED sheet adds a 2nd walk
// pose per direction in the "_B" regions; SceneAnimateActors toggles
// actors[i].frame 0<->1 while the actor moves. A 6-frame sheet on a non-moving
// actor is SPRITE_STATIC with frames_len 6 - actors[i].frame (0..5) then picks
// the sheet frame directly, in the order down-A, down-B, up-A, up-B, side-A,
// side-B. Facing for the ACTOR/ANIMATED cases is derived from dir_x/dir_y fresh
// every call, matching the GB engine's SceneRenderActor_b.
static u8 actor_render_tile(u8 i, u8 *flip_out)
{
    u8 fo = actors[i].frame_offset;
    u8 st = actors[i].sprite_type;
    u8 pose_b = 0;

    if (st == SPRITE_STATIC)
    {
        *flip_out = actors[i].flip;
        if (actors[i].frames_len <= 1) return fo;
        /* 6-frame manual/auto cycle */
        if (actors[i].frame == 1) return fo + ACTOR_DOWN_B_TILE0;
        if (actors[i].frame == 2) return fo + ACTOR_UP_TILE0;
        if (actors[i].frame == 3) return fo + ACTOR_UP_B_TILE0;
        if (actors[i].frame == 4) return fo + ACTOR_SIDE_TILE0;
        if (actors[i].frame == 5) return fo + ACTOR_SIDE_B_TILE0;
        return fo;
    }

    if (st == SPRITE_ACTOR_ANIMATED)
    {
        if (actors[i].frame & 1) pose_b = 1;
    }

    if (actors[i].dir_y < 0) /* up */
    {
        *flip_out = 0;
        return fo + (pose_b ? ACTOR_UP_B_TILE0 : ACTOR_UP_TILE0);
    }
    if (actors[i].dir_x != 0) /* side */
    {
        *flip_out = actors[i].dir_x < 0 ? 1 : 0;
        return fo + (pose_b ? ACTOR_SIDE_B_TILE0 : ACTOR_SIDE_TILE0);
    }
    /* down / idle */
    *flip_out = 0;
    return fo + (pose_b ? ACTOR_DOWN_B_TILE0 : 0);
}

static void SceneRenderActors(void)
{
    u8 i, flip, tile;
    u16 oid;
    /* Only the used slots - SceneInit hid slots > scene_num_actors once. */
    for (i = 0; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        oid = (u16)i << 2;
        if (actors[i].enabled && !sprites_hidden)
        {
            tile = actor_render_tile(i, &flip);
            // oamSet(id, x, y, priority, hflip, vflip, gfxoffset, pal)
            // frame_offset is always slot*2 (SceneInit / PLAYER_SET_SPRITE), so
            // frame_offset>>1 is the sprite slot -> its per-sheet OBJ palette.
            oamSet(oid, actors[i].x - scroll_x - 8, actors[i].y - scroll_y - 8, 2,
                   flip, 0, tile, sprite_pal_for_slot[actors[i].frame_offset >> 1]);
            oamSetEx(oid, OBJ_LARGE, OBJ_SHOW);
        }
        else
        {
            oamSetVisible(oid, OBJ_HIDE);
        }
    }

    if (emote_time != 0)
    {
        oamSet(EMOTE_OID, actors[emote_actor].x - scroll_x - 8,
               actors[emote_actor].y - scroll_y - 24, 2, 0, 0,
               EMOTE_TILE0 + emote_id * 2, 1);
        oamSetEx(EMOTE_OID, OBJ_LARGE, OBJ_SHOW);
    }
    else
    {
        oamSetVisible(EMOTE_OID, OBJ_HIDE);
    }
}

void SceneArmTriggers(void)
{
    check_triggers = 1;
}

void SceneUpdate(void)
{
    SceneUpdateActors();
    SceneAnimateActors();
    SceneUpdateEmote();
    SceneCheckTriggers();
    SceneRenderActors();
}
