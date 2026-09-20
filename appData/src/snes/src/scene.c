/*---------------------------------------------------------------------------------
    Scene loader + update - ported from appData/src/gb/src/Scene.c + Scene_b.c

    M4b: load a scene from an index-based blob, actors[] / triggers[], scene
         script, walk/action triggers, SWITCH_SCENE.
    M4c: tile-locked movement, scene collision bitmap, ACTOR_MOVE_TO family,
         IF_ACTOR_AT_POSITION, simple NPC AI (random walk / face).
    M6:  per-scene BG upload (tiles + map + palette + map size) from the
         assets bg_*_ptrs tables - the BG is no longer a one-time main() setup.
    v2 M6: up to 6 BG palette regions per scene (GB Studio 2.0's colour
           model - was a single palette), addressed by the existing
           snesgfx.js tilemap `pal<<10` bits - see SceneUploadBgPalette.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "scene.h"
#include "assets.h"
#include "script_runner.h"
#include "fade.h"
#include "states.h"
#include "parallax.h"
#include "camera.h"
#include "update_script.h"
#include "engine_fields.h"

u16 scene_index = 0xFFFF;
u16 scene_next_index = 0;
u8 scene_loaded = 0;
/* v2 M5a/M5b: which genre's Start_/Update_ function pair (states.c) drives
 * this scene - see states.h for the index values (GB's real scene.type
 * numbering, not M5's build order) and which genres exist so far. */
u8 scene_type = 0;
/* Set by SceneInit, consumed by main() one frame later: hold the screen
 * force-blanked until the scene's opening script has run and reached VRAM. */
u8 scene_unblank_pending = 0;
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

/* v4: real Engine Field now (appData/src/snes/engine.json "topdown_grid") -
 * see engine_fields.h. 16 selects GB Studio 2.0.0-beta5's coarser 16px
 * movement grid; the default (8) reproduces this engine's original
 * per-tile movement exactly. */

/* Set while the player is partway through the first 8px leg of a 16px grid
 * move already validated as clear the whole way (Update_TopDown). */
static u8 topdown_move_pending = 0;
static s8 topdown_move_dx = 0;
static s8 topdown_move_dy = 0;

/* SET_INPUT_SCRIPT / SET_TIMER_SCRIPT (M7-cont.). Input scripts are global,
 * one slot per GB-layout button bit, and persist across scene loads (matches
 * the GB engine - only REMOVE_INPUT_SCRIPT clears one). The timer script is a
 * single auto-repeating slot, disabled on every scene load like GB.
 * NUM_INPUT_SCRIPTS covers the 8 GB buttons plus the SNES X/Y/L/R (KEY_BITS
 * bits 8..11 in src/lib/compiler/helpers.js). Timer scripts (M4, v4) run in
 * 4 independent contexts, each with its own duration/countdown/target -
 * SceneUpdateTimerScript still only ever starts one script per frame (this
 * engine has a single script_ptr, not GB Studio 3.x's real hyperthreads),
 * so two contexts firing the same frame just means the second one starts a
 * frame late. */
#define NUM_INPUT_SCRIPTS 12
static BANK_PTR input_script_ptrs[NUM_INPUT_SCRIPTS];
#define NUM_TIMER_CONTEXTS 4
static u8 timer_script_duration[NUM_TIMER_CONTEXTS];
static u8 timer_script_time[NUM_TIMER_CONTEXTS];
static BANK_PTR timer_script_ptr[NUM_TIMER_CONTEXTS];

/* SHOW_SPRITES / HIDE_SPRITES. GB toggles a single hardware OAM-enable bit;
 * here SceneRenderActors just skips the oamSetEx(...OBJ_SHOW) every frame
 * while hidden. Reset to visible on every scene load, matching GB's
 * SceneInit (SHOW_SPRITES right before DISPLAY_ON). */
static u8 sprites_hidden = 0;

/* Per-scene OBJ slot tables, filled by SceneInit from the scene blob's [24]
 * sprite table (was compile-time-const, project-wide - now every scene loads
 * its own <=8 sheets). sprite_slot_for_index points at the current scene's
 * project-index -> slot map (PLAYER_SET_SPRITE). Mutable: the toolchain does
 * not pre-zero .bss, so SceneInit always writes all 8. */
u8 sprite_type_for_slot[SPRITE_SLOTS];
u8 sprite_frames_for_slot[SPRITE_SLOTS];
u8 sprite_pal_for_slot[SPRITE_SLOTS];
const unsigned char *sprite_slot_for_index = 0;

/* Projectiles (v4, LAUNCH_PROJECTILE / WEAPON_ATTACK). A small fixed pool -
 * no free-list, just a linear scan for a free slot each spawn (MAX_PROJECTILES
 * is small enough this is cheaper than maintaining a list). sprite_slot is
 * this *scene's* OBJ slot (0-7, already resolved at compile time by
 * scriptBuilder.js's _projectileSpriteSlot - see compileSnesData.js's
 * sceneSpriteIds/sceneProjectileSpriteIds), so rendering borrows whichever
 * actor sheet's tiles/palette are already loaded there - no dedicated
 * projectile VRAM region exists or is needed. Direction-only movement (no
 * angle/trig, matching this engine's other movement everywhere else) and
 * always-destroy-on-hit (this fork's LAUNCH_PROJECTILE payload has no
 * "strong"/destroyOnHit flag - see scriptBuilder.js's 5-byte wire format). */
typedef struct
{
    u8 active;
    s16 x, y;
    s8 dir_x, dir_y;
    u8 speed;
    u8 sprite_slot;
    u8 collision_group;  /* what this projectile IS - selects which of the
                             hit actor's scripts fires (see below) */
    u8 collision_mask;   /* which actor collision_group(s) it can hit */
    u8 ttl;              /* frames until auto-destroy, 0 = no ttl (relies on
                             leaving the scene instead) - WEAPON_ATTACK's
                             momentary hitbox uses this; LAUNCH_PROJECTILE
                             doesn't need to */
} PROJECTILE;
static PROJECTILE projectiles[MAX_PROJECTILES];
/* On Player Hit script indices (collision group 1/2/3), read from the scene
 * blob by SceneInit right after the parallax table - see that code and
 * ProjectilesUpdate() below. */
static u8 player_hit_idx[3];

/* Contact damage follow-up (v4): walking into a hostile actor. See
 * PlayerContactUpdate()'s own comment for the full design. */
#define PLAYER_IFRAMES 60 /* ~1s at 60fps - no visual flash during it (GB's
                              own "flash" cue) yet, a documented simplification */
static u8 player_iframes = 0;
/* One OAM id block per pool slot, right after the emote's own (EMOTE_OID is
 * defined further down, next to SceneRenderActors - this just documents the
 * relationship). */
#define PROJECTILE_OID_BASE ((u16)(MAX_ACTORS + 1) << 2)

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

// Forward declaration: defined near SceneCheckTriggers below, but Update_
// Adventure (also below, but earlier in the file) needs to call it too.
static u8 SceneActivateTriggerAt(s16 tx, s16 ty);

static void run_script(BANK_PTR ptr, u8 actor)
{
    BANK_PTR local = ptr;
    script_actor = actor;
    ScriptStart(&local);
}

// Re-pack PVSnesLib's raw pad bits into the GB engine's compact button layout
// (right=0x01, left=0x02, up=0x04, down=0x08, a=0x10, b=0x20, select=0x40,
// start=0x80 - see KEY_BITS in src/lib/compiler/helpers.js). The SNES-only
// X/Y/L/R sit in bits 8..11, so the result is 16-bit. IF_INPUT / AWAIT_INPUT
// and the input-script slots below match masks the compiler emits in this
// layout, not the raw SNES joypad bits.
u16 SceneGbInputBits(u16 j)
{
    u16 b = 0;
    if (j & KEY_RIGHT)  b |= 0x0001;
    if (j & KEY_LEFT)   b |= 0x0002;
    if (j & KEY_UP)     b |= 0x0004;
    if (j & KEY_DOWN)   b |= 0x0008;
    if (j & KEY_A)      b |= 0x0010;
    if (j & KEY_B)      b |= 0x0020;
    if (j & KEY_SELECT) b |= 0x0040;
    if (j & KEY_START)  b |= 0x0080;
    if (j & KEY_X)      b |= 0x0100;
    if (j & KEY_Y)      b |= 0x0200;
    if (j & KEY_L)      b |= 0x0400;
    if (j & KEY_R)      b |= 0x0800;
    return b;
}

void SceneScheduledScriptsInit(void)
{
    u8 i;
    for (i = 0; i < NUM_INPUT_SCRIPTS; i++)
    {
        input_script_ptrs[i].ptr = 0;
    }
    for (i = 0; i < NUM_TIMER_CONTEXTS; i++)
    {
        timer_script_duration[i] = 0;
        timer_script_time[i] = 0;
        timer_script_ptr[i].ptr = 0;
    }
}

void SceneSetInputScript(u16 mask, BANK_PTR target)
{
    // Only the lowest set bit is used, matching the GB engine's behaviour
    // when a caller passes a mask with several bits set.
    u8 index = 0;
    while (index < NUM_INPUT_SCRIPTS)
    {
        if (mask & 1) break;
        index++;
        mask >>= 1;
    }
    if (index < NUM_INPUT_SCRIPTS)
    {
        input_script_ptrs[index] = target;
    }
}

void SceneRemoveInputScript(u16 mask)
{
    u8 index;
    for (index = 0; index < NUM_INPUT_SCRIPTS; index++)
    {
        if (mask & 1)
        {
            input_script_ptrs[index].ptr = 0;
        }
        mask >>= 1;
    }
}

void SceneSetTimerScript(u8 duration, BANK_PTR target, u8 context)
{
    // A local copy, not `timer_script_ptr[context] = target;` directly:
    // 816-tcc's struct-by-value parameter copy-out references a `_locals`
    // frame symbol it only emits when the function has a genuine local
    // variable - with none, the reference is left unresolved and linking
    // fails (matches the `run_script` local-copy pattern above, which
    // sidesteps the same trap).
    BANK_PTR t = target;
    if (context >= NUM_TIMER_CONTEXTS) context = 0;
    timer_script_duration[context] = duration;
    timer_script_time[context] = duration;
    timer_script_ptr[context] = t;
}

void SceneTimerRestart(u8 context)
{
    if (context >= NUM_TIMER_CONTEXTS) context = 0;
    timer_script_time[context] = timer_script_duration[context];
}

void SceneTimerDisable(u8 context)
{
    if (context >= NUM_TIMER_CONTEXTS) context = 0;
    timer_script_duration[context] = 0;
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

// Ticks all 4 contexts every call, but only ever starts one script per frame
// (script_ptr is a single global - see the NUM_TIMER_CONTEXTS comment above).
// A context whose script didn't get to start this frame keeps timer_time at
// 0 and simply retries on the next call.
void SceneUpdateTimerScript(void)
{
    u8 i;
    if (!scene_loaded) return;
    if (script_ptr) return;
    if (IsFading()) return;

    for (i = 0; i < NUM_TIMER_CONTEXTS; i++)
    {
        if (timer_script_duration[i] == 0) continue;

        if (timer_script_time[i] == 0)
        {
            // Don't start the script while the player is mid-step, like GB.
            if (!actor_on_tile(0)) return;
            run_script(timer_script_ptr[i], 0);
            timer_script_time[i] = timer_script_duration[i];
            return;
        }
        else
        {
            // One tick every 16 frames, matching the compiler's TIMER_CYCLES scale.
            if ((time & 0x0F) == 0)
            {
                timer_script_time[i]--;
            }
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

// The 16px sprite of actor `skip` occupies tiles [tx, tx+1] x [ty, ty+1] at
// its destination tile (tx, ty). Return the index of another actor blocking
// that step, or 0xFF.
// PERF.md: (tx, ty) used to be `SceneActorTileX/Y(skip) + dx/dy`, computed
// fresh here *and* again in can_step() right after - two extra function
// calls per move attempt on a compiler with no CSE. The caller (actor_try_move)
// now computes it once and passes it to both. Below, SceneActorTileX/Y(j) is
// inlined for the same reason: this loop runs for every other actor on every
// move attempt (up to O(N) calls per mover, O(N^2) on a frame where several
// actors' AI ticks land together - see SceneUpdateAi's per-actor time offset),
// and 816-tcc never inlines a real function call itself.
static u8 npc_blocking(u16 skip, s16 tx, s16 ty)
{
    u8 j;
    for (j = 0; j <= scene_num_actors && j < MAX_ACTORS; j++)
    {
        s16 jx, jy;
        if (j == skip) continue;
        if (!actors[j].enabled) continue;
        if (!actors[j].active) continue;
        if (!actors[j].collisions_enabled) continue;
        jx = (actors[j].x - 8) >> 3;
        jy = (actors[j].y - 8) >> 3;
        if (tx > jx + 1) continue;
        if (tx + 1 < jx) continue;
        if (ty > jy + 1) continue;
        if (ty + 1 < jy) continue;
        return j;
    }
    return 0xFF;
}

// Can an actor step onto destination tile (tx, ty)? Mirrors the GB engine:
// the footprint is the actor's single tile, widened one tile to the right for
// the 16px-wide sprite, so the check is the destination tile and the one to
// its right. The old version tested two tiles ahead (a 2x2 footprint), which
// blocked the player a tile early - e.g. it couldn't step onto a door trigger
// with a solid tile just past it.
// (tx, ty) is the caller's already-computed destination tile - see npc_blocking.
static u8 can_step(s16 tx, s16 ty)
{
    if (col_solid(tx, ty)) return 0;
    if (col_solid(tx + 1, ty)) return 0;
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
        // Destination tile, computed once and shared by npc_blocking/can_step
        // below instead of each re-deriving it via SceneActorTileX/Y(i) - see
        // the comment on npc_blocking.
        s16 tx = SceneActorTileX(i) + dx;
        s16 ty = SceneActorTileY(i) + dy;
        if (npc_blocking(i, tx, ty) != 0xFF)
        {
            actors[i].moving = 0;
            return;
        }
        if (!can_step(tx, ty))
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
 * a 6-frame SPRITE_ACTOR_ANIMATED walks 2 poses per direction; a SPRITE_STATIC
 * sheet with 2-6 frames auto-cycles all of them (GB Studio's "animated" type -
 * a 2-frame duck, a 4-frame torch, ...); a 3-frame SPRITE_ACTOR and 1-frame
 * sheet are a single frame. */
static u8 frames_len_for(u8 sprite_type, u8 slot)
{
    if (sprite_type == SPRITE_ACTOR_ANIMATED) return 2;
    if (sprite_type == SPRITE_STATIC)
    {
        /* n == 3 is a directional SPRITE_ACTOR sheet (its 3 frames are laid
         * out down/up/side, not for a linear cycle) - leave it at frame 0. */
        u8 n = sprite_frames_for_slot[slot];
        if (n == 2) return 2;
        if (n >= 4 && n <= 6) return n;
    }
    return 1;
}

/* v2 M6: up to 6 BG palette regions per scene, matching GB Studio 2.0.0-
 * beta5's colour model (Palette.c: a 48-byte, 6x8-colour-DMG-packed blob
 * per scene selected per background tile via a CGB VRAM-bank-1 attribute
 * byte). This engine's own tilemap format already carries the equivalent
 * per-tile selector (snesgfx.js: `tile | pal<<10 | ...`, a genuine SNES
 * hardware capability - up to 8 addressable 4bpp BG palettes) - so the
 * *tile format* needed no change at all, only how many CGRAM palette slots
 * SceneInit actually populates from scene data.
 *
 * `bg_pals_ptrs[bg_index]` is up to 6 concatenated 32-byte (16-colour,
 * BGR555) regions, logical region 0..5, in that order - the same layout a
 * hand-authored `gen-dummy-gfx.js` blob or (eventually) M7's real
 * compileSnesData.js would emit. `bg_pals_len[bg_index]` may cover fewer
 * than all 6 (even a partial last region) for backward compatibility with
 * the existing single-palette dummy fixtures (32 or 28 bytes) - those
 * upload unchanged, to physical slot 0 only, byte-for-byte identical to
 * before this milestone.
 *
 * Physical CGRAM destination: SNES BG palettes are 8 addressable 16-colour
 * (32-byte) slots (colour index N*16, i.e. dmaCopyCGram byte-offset N*16
 * in *colour* units). Slot 1 (colours 16-31) is NOT free - ui.c's own
 * dialogue-box palette (`ui_pal`, BG3) already claims colours 16-19 within
 * it, uploaded unconditionally on every scene load right after this call.
 * A scene's own 4bpp BG tile always samples its full 16-colour region, so
 * letting a scene palette land in slot 1 would have its own colour
 * indices 0-3 silently overwritten by the UI's ink colours moments later -
 * not a fixed-up edge case, a guaranteed corruption for any art actually
 * using that region. So slot 1 is skipped entirely: the 6 logical regions
 * map to physical slots {0, 2, 3, 4, 5, 6} - slot 7 stays free (GB only
 * ever needs 6, nothing to put there yet).
 */
static const u16 bg_pal_slot_color[6] = { 0, 32, 48, 64, 80, 96 };

static void SceneUploadBgPalette(u8 bg_index)
{
    const u8 *src = bg_pals_ptrs[bg_index];
    s16 remaining = (s16)bg_pals_len[bg_index];
    u8 i;

    for (i = 0; i < 6; i++)
    {
        u16 chunk_len;
        if (remaining <= 0) break;
        chunk_len = (remaining > 32) ? 32 : (u16)remaining;
        dmaCopyCGram((u8 *)(src + (u16)i * 32), bg_pal_slot_color[i], chunk_len);
        remaining -= 32;
    }
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
    /* v2 M5a: new header byte, see states.h. Existing dummy fixtures/
     * gen-dummy-gfx.js were updated to emit it - this is the only consumer
     * of this exact byte layout today (compileSnesData.js doesn't exist on
     * this branch yet, see M7). */
    scene_type = s[6];
    p = s + 7;

    /* [24] per-scene OBJ slot table: sprite_type[8], sprite_frames[8],
     * sprite_pal[8] - see compileSnesData.js. */
    for (i = 0; i < SPRITE_SLOTS; i++)
    {
        sprite_type_for_slot[i] = p[i];
        sprite_frames_for_slot[i] = p[SPRITE_SLOTS + i];
        sprite_pal_for_slot[i] = p[2 * SPRITE_SLOTS + i];
    }
    sprite_slot_for_index = scene_sprite_slot_ptrs[scene_index];
    p += 3 * SPRITE_SLOTS;

    /* M6 (v4): [MAX_PARALLAX_LAYERS*2] banded X-axis parallax table - see
     * compileSnesData.js and parallax.c. lines=0 in slot 0 means no
     * parallax; ParallaxUpdate() itself would already no-op on an empty
     * table, but game.c's main loop still gates the call on this flag to
     * skip the HDMA rebuild/arm entirely on the (overwhelmingly common)
     * case of a scene with no parallax at all. */
    for (i = 0; i < MAX_PARALLAX_LAYERS; i++)
    {
        parallax_lines[i] = p[i * 2];
        parallax_shift[i] = (s8)p[i * 2 + 1];
    }
    parallax_active = parallax_lines[0] != 0;
    if (!parallax_active)
    {
        /* REG_HDMAEN (setParallaxScrolling's enable bit) is sticky - it
         * stays set across frames until explicitly cleared, so leaving a
         * parallax scene for one with none would otherwise keep replaying
         * the previous scene's stale HDMA table over this one's BG1HOFS
         * forever (game.c only calls ParallaxUpdate() while parallax_active
         * is set).
         *
         * PVSnesLib's setModeHdmaReset() does NOT disable a channel despite
         * its name - traced at the register level (a real $420C write), it
         * WRITES $420C=(1<<channel), i.e. it *enables* HDMA on that channel
         * with a fresh but unconfigured B-bus target/table, which defaults
         * to $2100 (INIDISP) - so calling it here was arming, every scene
         * load, an HDMA channel that spends the rest of the game garbage-
         * writing into the screen brightness/force-blank register once per
         * scanline (the "flashing lines then black screen" bug). $420C is
         * write-only on real hardware (no shadow to read-modify-write), and
         * no other HDMA channel is used anywhere in this engine, so a flat
         * clear is the correct, safe disable. */
        REG_HDMAEN = 0;
    }
    p += MAX_PARALLAX_LAYERS * 2;

    /* Projectiles (v4, follow-up): [3] On Player Hit script indices
     * (collision group 1/2/3) - see compileSnesData.js's
     * playerHit1/2/3ScriptIdx and ProjectilesUpdate()'s own comment for how
     * they're picked. */
    player_hit_idx[0] = p[0];
    player_hit_idx[1] = p[1];
    player_hit_idx[2] = p[2];
    p += 3;

    /* pick the tilemap size from the BG dimensions (one 2-term test per if) */
    if (bg_map_w[bg_index] > 32) sc_size = SC_64x64;
    if (bg_map_h[bg_index] > 32) sc_size = SC_64x64;

    /* Force blank for the (large) VRAM DMAs; setBrightness() restores it below,
     * or leaves it black if a fade-in is pending after a SWITCH_SCENE. */
    WaitForVBlank();
    setScreenOff();
    dmaCopyVram((u8 *)bg_tiles_ptrs[bg_index], 0x2000, bg_tiles_len[bg_index]);
    /* M7 (v4): a scene that painted TILE_PROP_PRIORITY tiles has its own
     * tilemap copy (scene_bg_map_ptrs[scene_index], real SNES BG_TIL_PRIO
     * bit set at those positions) - same length as the shared
     * bg_maps_ptrs[bg_index] it's derived from, just a different source. */
    dmaCopyVram(
        (u8 *)(scene_bg_map_ptrs[scene_index] ? scene_bg_map_ptrs[scene_index] : bg_maps_ptrs[bg_index]),
        0x0000, bg_maps_len[bg_index]);
    SceneUploadBgPalette(bg_index);
    /* UI (BG3) palette -> CGRAM 16..19 (palette field 4), after the BG palette. */
    dmaCopyCGram((u8 *)ui_pal, 16, UI_PAL_SIZE);
    /* this scene's OBJ tile sheet (8 KB) + 8-palette CGRAM image (bakes in the
     * emote / avatar palettes at OBJ pal 1 / 2). */
    dmaCopyVram((u8 *)scene_spr_ptrs[scene_index], 0x4000, SPR_TILES_SIZE);
    dmaCopyCGram((u8 *)scene_spr_pal_ptrs[scene_index], 128, SPR_PAL_SIZE);
    bgSetMapPtr(0, 0x0000, sc_size);
    bgSetGfxPtr(0, 0x2000);

    actors[0].x = ((s16)map_next_x << 3) + 8;
    actors[0].y = ((s16)map_next_y << 3) + 8;
    actors[0].dir_x = map_next_dir_x;
    actors[0].dir_y = map_next_dir_y;
    actors[0].enabled = 1;
    actors[0].active = 1;
    actors[0].moving = 0;
    actors[0].flip = 0;
    actors[0].frame = 0;
    actors[0].animate = 0;
    actors[0].anim_hold = 0;
    actors[0].anim_speed = PLAYER_ANIM_SPEED;
    actors[0].frame_offset = PLAYER_SPRITE_SLOT * 2; /* OBJ grid TL tile */
    /* v4: the player's sheet can now vary per scene (Scene.playerSpriteSheetId),
     * so its type/frame count can't be a compile-time constant any more -
     * read the same per-scene sprite_type_for_slot[]/sprite_frames_for_slot[]
     * arrays SceneInit already just DMA'd above, same as every other actor. */
    actors[0].sprite_type = sprite_type_for_slot[PLAYER_SPRITE_SLOT];
    actors[0].frames_len = frames_len_for(sprite_type_for_slot[PLAYER_SPRITE_SLOT], PLAYER_SPRITE_SLOT);
    actors[0].move_speed = 1;
    actors[0].collisions_enabled = 1;
    /* Projectiles (v4): the player is always collision_group "player" (bit
     * 1) - it isn't a compiled Actor entity, so this can't come from the
     * scene blob like every other actor's group does. The player has no
     * hit1/2/3_idx slot at all (this schema's Actor.hit1/2/3Script - the
     * only place those scripts can be authored - doesn't apply to the
     * player), so ProjectilesUpdate() never tests actor index 0 for a hit;
     * see its own comment for why that's this pass's real scope boundary.
     */
    actors[0].collision_group = 1;

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
        actors[i].active = 1;
        actors[i].move_speed = 1;
        actors[i].collisions_enabled = 1;
        actors[i].sprite_type = p[6];
        actors[i].anim_speed = p[7];
        actors[i].animate = p[8];
        actors[i].frames_len = frames_len_for(p[6], p[4]);
        actors[i].events_ptr = event_ptrs[p[5]];
        /* Projectiles (v4): [9]=collision_group, [10..12]=hit1/2/3_idx - see
         * compileSnesData.js actorEntries and gbs_types.h's ACTOR comment. */
        actors[i].collision_group = p[9];
        actors[i].hit1_idx = p[10];
        actors[i].hit2_idx = p[11];
        actors[i].hit3_idx = p[12];
        /* On Update subsystem (v4): [13]=update_idx. update_ctx is runtime-
         * only (which UPDATE_CTX pool slot owns this actor, or
         * UPDATE_CTX_NONE) - reset here so a previous scene's slot index
         * left over in this ACTOR struct entry (actors[] isn't cleared
         * between scenes) never gets misread as "already running"; the
         * actual pool reset + auto-launch happens in the loop below, once
         * every actor's update_idx is known. */
        actors[i].update_idx = p[13];
        actors[i].update_ctx = UPDATE_CTX_NONE;
        p += 14;
    }
    for (; i < MAX_ACTORS; i++)
    {
        actors[i].enabled = 0;
        actors[i].active = 0;
        actors[i].update_ctx = UPDATE_CTX_NONE;
        /* Hide the unused OAM slots once here - SceneRenderActors only walks
         * 0..scene_num_actors every frame, so it never touches these again. */
        oamSetVisible((u16)i << 2, OBJ_HIDE);
    }

    /* On Update subsystem (v4): fresh pool for this scene (a previous
     * scene's contexts point at bytecode addresses that are meaningless
     * here), then auto-launch every scene-resident actor's own update
     * script (mirrors GB Studio 3.x's real activate_actor(), called for
     * every scene actor on load) - a no-op per actor if its compiled
     * script is empty or the pool is already full (see update_script.c). */
    UpdateScriptsReset();
    for (i = 1; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        ActorStartUpdate(i);
    }

    /* Projectiles (v4): a fresh scene starts with none in flight - clear the
     * pool and hide their OAM entries, same reasoning as the unused-actor
     * loop just above (SceneInit is the only place stale ones would
     * otherwise linger from the previous scene). */
    for (i = 0; i < MAX_PROJECTILES; i++)
    {
        projectiles[i].active = 0;
        oamSetVisible(PROJECTILE_OID_BASE + ((u16)i << 2), OBJ_HIDE);
    }
    /* Contact-damage iframes shouldn't carry across a scene switch either. */
    player_iframes = 0;

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
    for (j = 0; j < NUM_TIMER_CONTEXTS; j++)
    {
        timer_script_duration[j] = 0; /* disable any timer script from the last scene, all 4 contexts */
    }
    sprites_hidden = 0; /* GB: SHOW_SPRITES right before DISPLAY_ON on every scene load */

    /* Leave the screen force-blanked (setScreenOff above). main() un-blanks it
     * one frame later, right after the next UIFlush - by then the scene's
     * opening script (OVERLAY_SHOW, palette tweaks, ...) has run and its BG3
     * curtain has reached VRAM, so the bare background never flashes for a
     * frame before the curtain is up. A pending SWITCH_SCENE fade-in still
     * ramps from black via FadeUpdate, unchanged. */
    scene_unblank_pending = 1;

    /* v2 M5a: per-genre setup (camera deadzone, movement-mode reset, ...) -
     * see states.h. Runs before the scene's own opening script so a script
     * that immediately moves the camera/player overrides genre defaults,
     * matching GB's Core_Main.c order (startFuncs[] then ScriptStart). */
    startFuncs[scene_type]();

    run_script(event_ptrs[scene_script_idx], 0);
}

/*--------------------------------------------------------------------------- */

static void SceneTryInteract(void)
{
    /* The tile the player is facing. SceneActorTileX/Y is the *top-left* of the
     * 16x16 (2x2 tile) sprite, so when facing right or down the tile "in front"
     * is two tiles from the origin, not one - otherwise `ntx`/`nty` point at
     * the player's own far edge and talk / push only work from the left / top
     * (user-found). Mirrors GB's `DIV_8(pos) + dir` with the wider sprite. */
    s16 ntx = SceneActorTileX(0) + actors[0].dir_x;
    s16 nty = SceneActorTileY(0) + actors[0].dir_y;
    u8 i;

    if (actors[0].dir_x > 0) ntx++;
    if (actors[0].dir_y > 0) nty++;

    for (i = 1; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        s16 ax, ay;
        if (!actors[i].enabled)
        {
            continue;
        }
        if (!actors[i].active)
        {
            continue;
        }
        // A "hostile" actor (collision_group set - Projectiles/contact-
        // damage follow-up) is never A-press-interactable, only contact-
        // triggered (PlayerContactUpdate) - matches B's real topdown.c AND
        // adventure.c exactly (both gate their own equivalent A-press script
        // run on `!hit_actor->collision_group`; user-found comparing against
        // B while looking at Adventure specifically, but the same exclusion
        // is real in B's Top Down too, so fixed here once for both callers
        // rather than duplicated per genre). Treated as "nothing found"
        // rather than "found but blocked" - falls through to the trigger
        // check below like any other non-match, not a special early return.
        if (actors[i].collision_group)
        {
            continue;
        }
        ax = SceneActorTileX(i);
        ay = SceneActorTileY(i);
        if (in_box(ntx, nty, ax, ay, 2, 2))
        {
            // Face the player and stop - matches B's real topdown.c, which
            // does this unconditionally even for a scriptless actor (only
            // the script_execute call itself is gated on script.bank).
            actor_face(i, -actors[0].dir_x, -actors[0].dir_y);
            actors[i].moving = 0;
            // GB found+extended: B gates the actual script run on
            // hit_actor->script.bank; a compiled script is never truly
            // empty (EVENT_END is a real, always-emitted byte), so a first
            // byte of 0 means "nothing authored" - same check already
            // established for Point and Click's hover-gate above, now
            // applied here too (shared by every SceneTryInteract caller -
            // Top Down, Adventure, and Shmup's new A-press interact below).
            if (actors[i].events_ptr.ptr[0] != 0)
            {
                run_script(actors[i].events_ptr, i);
            }
            return;
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

/* v2 M5a: Top Down genre pair (states.h). v4: real camera deadzone/offset
 * now exists (camera.h/game.c CameraUpdate) - Top Down still wants a hard
 * lock, matching GB's own Start_TopDown (camera_deadzone.x/y = 0,
 * camera_offset.x/y = 0), so this explicitly zeroes all 4 every scene load
 * rather than relying on whatever the previous scene's genre left behind.
 *
 * topdown_grid == 16: snap the spawn position down to an even tile pair on
 * both axes (a 16px cell boundary), matching GB's own Start_TopDown snap -
 * without this a project that starts the player on an odd tile could never
 * reach a fully-16px-aligned position at all. */
void Start_TopDown(void)
{
    camera_deadzone_x = 0;
    camera_deadzone_y = 0;
    camera_offset_x = 0;
    camera_offset_y = 0;

    topdown_move_pending = 0;
    if (topdown_grid == 16)
    {
        s16 tx = SceneActorTileX(0) & ~1;
        s16 ty = SceneActorTileY(0) & ~1;
        actors[0].x = (tx << 3) + 8;
        actors[0].y = (ty << 3) + 8;
    }
}

// Player d-pad movement + A-button interact - the exact logic that used to
// live directly in SceneHandleInput before the genre dispatch existed.
//
// topdown_grid == 16 (GB Studio 2.0.0-beta5's grid-size Engine Field - no
// real Engine Field data pipeline exists on this target yet, M7 builds
// compileSnesData.js, so this is a plain global for now, not something a
// real project can set): the player re-steers only every 16px instead of
// every 8px. Implemented as two chained 8px legs through the existing
// actor_try_move (each already doing this engine's normal single-tile
// can_step/npc_blocking check) rather than porting GB's own TileAt2x2 - but
// the *decision* to start is gated on a widened check at the FULL 2-tile
// destination first (can_step/npc_blocking called with a doubled offset,
// reusing them exactly as-is): without that upfront check, a wall exactly
// on the second leg's tile (but not the first) would strand the player
// mid-cell, breaking the "always 16px-aligned at rest" invariant GB's mode
// guarantees. topdown_grid == 8 (the default - engine.json's own
// defaultValue) reproduces the original single-leg behaviour byte-for-byte.
void Update_TopDown(void)
{
    s16 tile_x = SceneActorTileX(0);
    s16 tile_y = SceneActorTileY(0);
    s8 dx = 0, dy = 0;

    if (topdown_move_pending)
    {
        // Second 8px leg of a 16px move already validated as clear below.
        topdown_move_pending = 0;
        actor_try_move(0, topdown_move_dx, topdown_move_dy);
        return;
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

    if (!dx && !dy)
    {
        actors[0].moving = 0;
        return;
    }

    if (topdown_grid == 16)
    {
        s16 destTx = tile_x + 2 * dx;
        s16 destTy = tile_y + 2 * dy;
        if (npc_blocking(0, destTx, destTy) != 0xFF || !can_step(destTx, destTy))
        {
            actors[0].moving = 0;
            return;
        }
        actor_try_move(0, dx, dy);
        if (actors[0].moving)
        {
            topdown_move_pending = 1;
            topdown_move_dx = dx;
            topdown_move_dy = dy;
        }
    }
    else
    {
        actor_try_move(0, dx, dy);
    }
}

/* v2 M5b: Point and Click genre pair (states.h). The M4 audit's key finding:
 * this is a collision-free floating cursor, not a Top Down variant - A
 * interacts with whatever the cursor hovers, there's no tile-locked walk.
 * Reuses actor slot 0 (the GB reference does the same - "player" is just its
 * own cursor actor), so it gets the existing camera-lock-onto-actor-0 and
 * SceneRenderActors OBJ rendering for free.
 *
 * GB's own Start_PointNClick sets camera_offset=0/camera_deadzone=24 - now
 * ported for real (v4), giving the cursor 24px of free-roam slack before
 * the camera starts tracking it, instead of the hard lock every other genre
 * without a deadzone still gets. */
#define POINT_N_CLICK_CAMERA_DEADZONE 24

void Start_PointNClick(void)
{
    camera_deadzone_x = POINT_N_CLICK_CAMERA_DEADZONE;
    camera_deadzone_y = POINT_N_CLICK_CAMERA_DEADZONE;
    camera_offset_x = 0;
    camera_offset_y = 0;

    // GB forces sprite_type to SPRITE_STATIC regardless of what the assigned
    // sheet's own frame count implied (frames_len_for() already ran in
    // SceneInit, before startFuncs[] - so a directional 3-frame sheet keeps
    // frames_len 1 and Update_PointNClick's hover frame never shows, exactly
    // matching GB's `frames_len != 1` guard there), so ANY sheet's frame 0/1
    // can be repurposed as a flat "normal cursor"/"hovering cursor" pair
    // rather than a direction pose.
    actors[0].sprite_type = SPRITE_STATIC;
    actors[0].dir_x = 0;
    actors[0].dir_y = 1;
}

// ActorAtTile_b/TriggerAtTile_b equivalents (GB's Actor_b.c/Trigger_b.c) - a
// generous cursor hover hit-test, not a collision check: GB widens the actor
// test a tile either side horizontally (tx_a-1..tx_a+1, vs. the actor's own
// 2-tile-wide footprint) and the trigger test a tile to the left
// ((tx_a+1)>=tx_b), so the cursor doesn't have to land on an actor/trigger's
// exact top-left tile to hover it. Loop starts at 1 (skip the cursor itself,
// same as SceneTryInteract/SceneUpdateAi above); GB's own call site always
// passes inc_noclip=TRUE, so collisions_enabled is deliberately not checked.
//
// GB additionally gates both hover states on `events_ptr.bank != 0` (only a
// script-bearing actor/trigger shows as hoverable) - v4 follow-up: now
// ported too (Update_PointNClick's own is_hover_actor/is_hover_trigger,
// checking events_ptr.ptr[0] != 0 - a compiled script is never truly empty,
// see that comment). SceneTryInteract (Top Down's own A-button interact)
// still runs whatever script is there unconditionally, same as before -
// that's a plain instant interact with no hover state to gate, unlike this
// genre's dedicated "is this even worth highlighting" concept.
static u8 actor_at_tile(s16 tx, s16 ty)
{
    u8 i;
    for (i = 1; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        s16 ax, ay;
        if (!actors[i].enabled) continue;
        if (!actors[i].active) continue;
        ax = SceneActorTileX(i);
        ay = SceneActorTileY(i);
        // Sequential ifs, not one wide &&/|| chain: see the actor_on_tile
        // comment up top.
        if (ty != ay && ty != ay + 1) continue;
        if (tx != ax - 1 && tx != ax && tx != ax + 1) continue;
        return i;
    }
    return 0xFF;
}

static u8 trigger_at_tile(s16 tx, s16 ty)
{
    u8 i;
    for (i = 0; i < scene_num_triggers && i < MAX_TRIGGERS; i++)
    {
        s16 tx_c = triggers[i].x + triggers[i].w - 1;
        s16 ty_c = triggers[i].y + triggers[i].h - 1;
        if (tx + 1 < triggers[i].x) continue;
        if (tx > tx_c) continue;
        if (ty < triggers[i].y) continue;
        if (ty > ty_c) continue;
        return i;
    }
    return 0xFF;
}

// Cursor movement is a direct pixel nudge (no actor_try_move/can_step at
// all - a genuinely collision-free floating cursor, per the M4 audit), so
// actors[0].moving stays 0 all the time here: the generic per-tile stepping
// loop in SceneUpdateActors (which owns Top Down's player movement instead -
// actor_try_move only arms `moving`+facing there) must never pick this actor
// up, or it would snap/halt the cursor to 8px tile boundaries like a walking
// actor instead of letting it glide freely.
// Diagonal-move parity toggle (user-found, comparing against B's real
// pointnclick.c): B moves the cursor via point_translate_angle() - real
// trig, so a diagonal move covers the same real-world distance per frame as
// a straight one. This engine's simple x+-1/y+-1-per-axis version moved on
// BOTH axes every frame a diagonal was held, covering sqrt(2) (~41%) more
// distance per frame than a straight move - a real, if minor, speed bug,
// not a stylistic difference. Fixed with a well-known integer-only trick
// instead of adding real trig (nothing else on this engine uses it, see the
// Projectiles direction-vs-angle decision for the same reasoning): only
// move ONE axis per frame while both are held, alternating - over N frames
// that's N/2 + N/2 pixels on the two axes = a diagonal distance of
// N/sqrt(2), matching a straight move's own distance of N to within
// integer rounding. Explicitly initialised (not left to .bss-style zero-init
// this toolchain doesn't reliably guarantee - see CLAUDE.md's "816-tcc traps
// hit so far"), so it's always 0 at boot; not otherwise reset per-scene,
// since which axis a diagonal move happens to prioritise on its very first
// frame has no visible effect either way.
static u8 pnc_diag_toggle = 0;

void Update_PointNClick(void)
{
    s16 tile_x, tile_y;
    s16 max_x = (s16)scene_width << 3;
    s16 max_y = (s16)scene_height << 3;
    u8 hit_actor, hit_trigger, is_hover_actor, is_hover_trigger;
    s8 dx = 0, dy = 0;

    actors[0].moving = 0;

    if (joy & KEY_LEFT) dx = -1;
    else if (joy & KEY_RIGHT) dx = 1;
    if (joy & KEY_UP) dy = -1;
    else if (joy & KEY_DOWN) dy = 1;

    if (dx && dy)
    {
        pnc_diag_toggle ^= 1;
        if (pnc_diag_toggle) dy = 0; else dx = 0;
    }

    // Clamped to the cursor's own real 16x16 render box (SceneRenderActors'
    // -8/-16 OAM offset - x spans [x-8, x+8], y spans [y-16, y]), not a flat
    // 8px margin on every edge: the old margin let the cursor's right edge
    // go 8px past max_x and its top edge 8px above y=0 before B's
    // equivalent bounds-based clamp would have stopped it (user-found,
    // comparing against B's real PLAYER.bounds-based clamp).
    if (dx < 0 && actors[0].x > 8) actors[0].x--;
    else if (dx > 0 && actors[0].x < max_x - 8) actors[0].x++;
    if (dy < 0 && actors[0].y > 16) actors[0].y--;
    else if (dy > 0 && actors[0].y < max_y) actors[0].y++;

    tile_x = SceneActorTileX(0);
    tile_y = SceneActorTileY(0);

    // One tile above the cursor's own tile for triggers, matching GB's own
    // `TriggerAtTile(tile_x, tile_y - 1)` call exactly - a deliberate GB
    // authoring choice (the cursor's hotspot reads as above its drawn tile),
    // kept as-is per the "behavioural reference" policy rather than guessed
    // away. The actor hit-test uses the cursor's own tile, also matching GB.
    hit_trigger = trigger_at_tile(tile_x, tile_y - 1);
    hit_actor = actor_at_tile(tile_x, tile_y);

    // Only treat a hit as "hovering" (or A-press-interactable) if it
    // actually has a real (non-empty) script - matches B's own
    // `hit_actor->script.bank` / `triggers[..].script.bank` gate
    // (user-found: this engine used to show the hover frame, and run a
    // script on A-press, for any actor/trigger at all - even a purely
    // decorative one with nothing authored). A compiled script is never
    // truly empty - it's always at least the single EVENT_END byte (opcode
    // 0x00, see script_cmds.c) - so "first byte is 0" is a reliable,
    // no-extra-compiled-data way to tell "nothing was authored" from
    // "something was".
    is_hover_actor = hit_actor != 0xFF && actors[hit_actor].events_ptr.ptr[0] != 0;
    is_hover_trigger = hit_trigger != 0xFF && triggers[hit_trigger].events_ptr.ptr[0] != 0;

    if ((is_hover_actor || is_hover_trigger) && actors[0].frames_len != 1)
    {
        actors[0].frame = 1;
    }
    else
    {
        actors[0].frame = 0;
    }

    if ((joy & KEY_A) && !(prev_joy & KEY_A))
    {
        if (is_hover_actor)
        {
            run_script(actors[hit_actor].events_ptr, hit_actor);
        }
        else if (is_hover_trigger)
        {
            run_script(triggers[hit_trigger].events_ptr, 0);
        }
    }
}

/* v2 M5c: Adventure genre pair (states.h). Per the M4 audit, this is a
 * free-pixel movement variant of Top Down - both axes can move every frame
 * (real diagonal movement, unlike Top Down's single-axis-at-a-time input
 * priority) and the player is not tile-locked, reusing the same A-button
 * facing-interact (SceneTryInteract) and walk-over triggers (via
 * SceneActivateTriggerAt, called directly here rather than through
 * SceneCheckTriggers - see that function's own M5c comment for why). */
static s16 adv_last_trigger_tx = -1;
static s16 adv_last_trigger_ty = -1;
// Diagonal-move parity toggle (user-found comparing against B's real
// adventure.c, same class of bug already fixed in Point and Click - see
// Update_PointNClick's own comment for the full reasoning): B normalises
// diagonal speed via point_translate_angle() (real trig); this engine moved
// both axes at full move_speed every frame a diagonal was held, covering
// sqrt(2) (~41%) more ground per frame than a straight move. Fixed with the
// same integer-only "alternate one axis per frame" trick, applied to the
// *final* dir_x/dir_y (after the wall-collision checks below, not at input
// time) so a diagonal move that got partially blocked by a wall still
// alternates correctly on whichever axis is actually still moving.
static u8 adv_diag_toggle = 0;

#define ADVENTURE_CAMERA_DEADZONE 8

void Start_Adventure(void)
{
    // Guaranteed not to match any real tile, so the very first check on
    // scene entry always runs fresh rather than being suppressed by a
    // stale tile pair left over from whatever scene/genre ran before.
    adv_last_trigger_tx = -1;
    adv_last_trigger_ty = -1;

    // GB's own Start_Adventure sets an 8px camera deadzone - ported for
    // real (v4), same value both axes.
    camera_deadzone_x = ADVENTURE_CAMERA_DEADZONE;
    camera_deadzone_y = ADVENTURE_CAMERA_DEADZONE;
    camera_offset_x = 0;
    camera_offset_y = 0;
}

// Narrow, direction-biased collision test - deliberately NOT the full 16x16
// sprite or Top Down's 2-tile-wide can_step/npc_blocking footprint. GB's own
// Adventure.c also narrows its hitbox well below the sprite's full width,
// specifically so continuous 1px movement never has to reason about a
// footprint spanning 3 tile columns/rows at once (a narrow single-point
// test only ever touches one tile per axis, at any alignment). GB's exact
// pixel bias assumes a different, top-left-based position convention than
// this engine's centre-x/feet-y one (see gbs_types.h/SceneRenderActors) and
// isn't Mesen-verifiable this session (the input-simulation gap - see
// memory gbsnes-v2-migration), so this re-derives the same *idea* - a small,
// direction-biased look-ahead point test - rather than copying GB's own
// constants, which would risk porting a fencepost error with no way to
// catch it interactively.
void Update_Adventure(void)
{
    s16 x = actors[0].x;
    s16 y = actors[0].y;
    s16 body_row = (y - 1) >> 3;  // just above the feet - avoids the exact
                                   // tile-boundary case when y % 8 == 0
    s16 feet_col = x >> 3;        // column under the horizontal centre
    s16 tile_x, tile_y;
    s8 backup_dx, backup_dy;
    u8 input_x = 0, input_y = 0;

    actors[0].moving = 0;

    if (joy & KEY_LEFT)       { actors[0].dir_x = -1; actors[0].moving = 1; input_x = 1; }
    else if (joy & KEY_RIGHT) { actors[0].dir_x = 1;  actors[0].moving = 1; input_x = 1; }

    if (joy & KEY_UP)         { actors[0].dir_y = -1; actors[0].moving = 1; input_y = 1; }
    else if (joy & KEY_DOWN)  { actors[0].dir_y = 1;  actors[0].moving = 1; input_y = 1; }

    // Cancel a stale facing on the axis with no input held this frame, but
    // only when the OTHER axis has input - both held keeps both (a real
    // diagonal), neither held keeps both as-is (facing persists while idle,
    // matching how actor_face/dir_x/dir_y already behave everywhere else in
    // this engine). Ported from GB's own Adventure.c verbatim - it's plain
    // control flow, not pixel-geometry-dependent, so there was nothing to
    // re-derive here.
    if (input_x && !input_y) actors[0].dir_y = 0;
    else if (input_y && !input_x) actors[0].dir_x = 0;

    if ((joy & KEY_A) && !(prev_joy & KEY_A))
    {
        SceneTryInteract();
        if (script_ptr)
        {
            actors[0].moving = 0;
            return;
        }
    }

    // Saved so a fully-blocked step (below) can restore the player's
    // intended facing rather than leaving it at 0,0 - matches GB's own
    // `backup_dir`: bumping a wall should still visibly face into it, only
    // the actual movement is cancelled.
    backup_dx = actors[0].dir_x;
    backup_dy = actors[0].dir_y;

    if (actors[0].dir_x != 0)
    {
        s16 test_col = (x + actors[0].dir_x) >> 3;
        if (col_solid(test_col, body_row))
        {
            actors[0].dir_x = 0;
        }
    }
    if (actors[0].dir_y != 0)
    {
        s16 test_row = ((y + actors[0].dir_y) - 1) >> 3;
        if (col_solid(feet_col, test_row))
        {
            actors[0].dir_y = 0;
        }
    }

    if (actors[0].moving)
    {
        if (!actors[0].dir_x && !actors[0].dir_y)
        {
            actors[0].moving = 0;
            actors[0].dir_x = backup_dx;
            actors[0].dir_y = backup_dy;
        }
    }

    tile_x = SceneActorTileX(0);
    tile_y = SceneActorTileY(0);
    if (tile_x != adv_last_trigger_tx || tile_y != adv_last_trigger_ty)
    {
        adv_last_trigger_tx = tile_x;
        adv_last_trigger_ty = tile_y;
        if (SceneActivateTriggerAt(tile_x, tile_y))
        {
            return;
        }
    }

    // player_iframes / hit_actor / collision_group (GB's own "touch an
    // enemy, flash, take no more damage for N frames" mechanic) - v4
    // follow-up: PlayerContactUpdate() now handles this, shared across every
    // genre from SceneUpdate() rather than inline here (Adventure's own
    // narrow collision test above never blocks the player from overlapping
    // an actor, so this is the only place that damage can be detected).

    // Gated on `moving`, not on dir_x/dir_y being nonzero: dir_x/dir_y are
    // the actor's persistent *facing* (read by rendering and by
    // SceneTryInteract) and stay whatever they last were on a frame with no
    // input held - only `moving` reflects whether input was actually held
    // THIS frame (and survives the wall-bump restore above unchanged: it
    // was already cleared to 0 there). Gating on dir_x/dir_y directly would
    // make the player drift forever in its last-faced direction after
    // releasing the d-pad, and/or after a wall-bump restore reintroduces a
    // nonzero dir with no movement intended - matches GB's own
    // Adventure.c, which gates its own position update on `player.moving`.
    if (actors[0].moving)
    {
        u8 move_x = actors[0].dir_x != 0;
        u8 move_y = actors[0].dir_y != 0;
        if (move_x && move_y)
        {
            adv_diag_toggle ^= 1;
            if (adv_diag_toggle) move_y = 0; else move_x = 0;
        }
        if (move_x)
        {
            actors[0].x += (s16)actors[0].dir_x * actors[0].move_speed;
        }
        if (move_y)
        {
            actors[0].y += (s16)actors[0].dir_y * actors[0].move_speed;
        }
    }
}

/* v2 M5d: Platformer genre pair (states.h) - the real work per the M4
 * audit: fixed-point physics (walk/run acceleration+deceleration, gravity,
 * variable-height jump) built fresh, not a Top Down/Adventure variant.
 *
 * Deliberately NOT ported this milestone (documented, not half-invented):
 * - Ladders (GB's TILE_PROP_LADDER) - would need a second per-tile data
 *   channel this engine's 1-bit-per-tile collision bitmap has no room for;
 *   a real per-tile "ladder" flag needs the M7 data compiler that actually
 *   derives collision from project art, not something to bolt onto the
 *   dummy-fixture format now.
 * - Directional per-tile collision (GB's COLLISION_LEFT/RIGHT/TOP/BOTTOM -
 *   e.g. one-way platforms) - this engine's collision bitmap is a single
 *   solid/not-solid bit per tile (established since M4c); a solid tile
 *   blocks from every direction here, a documented simplification, not a
 *   partial port of GB's richer per-tile byte.
 * - player_iframes/hit_actor/collision_group (hit-invincibility) - v4
 *   follow-up: PlayerContactUpdate() (below Update_Shmup) now handles this
 *   for every genre, including Platform (this collision test above never
 *   blocks the player from overlapping an actor either).
 * - GB's pre-jump ceiling peek (declining a jump that would immediately
 *   headbutt a ceiling) - skipped for simplicity; the real ceiling-
 *   collision check later in this same function still catches it a frame
 *   later, just marginally less precise on the very first jump frame.
 *
 * Fixed-point scale matches GB's own Platform.c exactly - position in
 * 1/16px, velocity in 1/4096px/frame, applied via `pos += vel >> 8` - so
 * the Engine Fields these constants now are (v4, appData/src/snes/
 * engine.json, see engine_fields.h - the defaults there are the same
 * numbers, copied verbatim from GB Studio's own engine.json) produce the
 * same real-world speeds GB Studio's own field labels describe them as - a
 * different scale would make these numbers meaningless. Both axes safely
 * fit a plain s16 at this scale:
 * this target's own max scene width (2040px, 255 tiles, matching GB's D2
 * decision) times 16 is 32640, within s16 range - no need for wider
 * (untested on this toolchain) 32-bit arithmetic anywhere.
 *
 * Position/velocity are tracked separately from actors[0].x/y (matching
 * GB's own pl_pos_x/pl_vel_x, not player.pos) so sub-pixel motion survives
 * across frames even though actors[0].x/y (synced at the end of every
 * call) are whole pixels; re-synced from actors[0].x/y at the top of every
 * call (keeping the accumulated fractional part) so a script repositioning
 * the player (e.g. ACTOR_MOVE_TO) is honoured, mirroring GB's own re-sync.
 */
static s16 plat_x = 0;   /* 1/16px, sprite horizontal centre - see actors[].x */
static s16 plat_y = 0;   /* 1/16px, sprite feet/bottom - see actors[].y */
static s16 plat_vel_x = 0;
static s16 plat_vel_y = 0;
static u8 plat_grounded = 0;
static s16 plat_last_trigger_tx = -1;
static s16 plat_last_trigger_ty = -1;

/* PLAYER_BOUNCE (v4). plat_vel_y is file-static to this file, like every
 * other Platform physics variable - a small setter instead of a new extern,
 * matching the same "expose just the one thing script_cmds.c needs" shape
 * as SceneStartEmote. Setting it outside of Update_Platform's own gravity
 * step is safe - it's just a plain velocity impulse, no other state to keep
 * in sync (unlike a full jump, which also flips plat_grounded). Called from
 * genres other than Platform this does nothing useful (plat_vel_y is only
 * ever read back by Update_Platform), matching B's own Player: Bounce -
 * always compiles, only Platformer scenes actually do anything with it. */
void PlatformSetVelY(s16 v)
{
    plat_vel_y = v;
}

#define PLATFORM_CAMERA_DEADZONE_X 4
#define PLATFORM_CAMERA_DEADZONE_Y 16

void Start_Platform(void)
{
    plat_x = actors[0].x << 4;
    plat_y = actors[0].y << 4;
    plat_vel_x = 0;
    plat_vel_y = 0;
    plat_grounded = 0;
    plat_last_trigger_tx = -1;
    plat_last_trigger_ty = -1;

    if (actors[0].dir_x == 0)
    {
        actors[0].dir_y = 0;
        actors[0].dir_x = 1;
    }

    // GB's own camera deadzone here (4x/16y) - ported for real (v4).
    camera_deadzone_x = PLATFORM_CAMERA_DEADZONE_X;
    camera_deadzone_y = PLATFORM_CAMERA_DEADZONE_Y;
    camera_offset_x = 0;
    camera_offset_y = 0;
}

void Update_Platform(void)
{
    s16 px, py;
    s16 tile_x, tile_y;
    u8 hit_actor;

    // Re-sync from actors[0].x/y (in case a script moved the player),
    // keeping the accumulated fractional (low 4 bits) part - see the
    // function-group comment above.
    plat_x = (actors[0].x << 4) + (plat_x & 0xF);
    plat_y = (actors[0].y << 4) + (plat_y & 0xF);

    actors[0].dir_y = 0;

    if (joy & KEY_LEFT)
    {
        actors[0].dir_x = -1;
        if (joy & KEY_A)
        {
            plat_vel_x -= plat_run_acc;
            if (plat_vel_x < -plat_run_vel) plat_vel_x = -plat_run_vel;
            if (plat_vel_x > -plat_min_vel) plat_vel_x = -plat_min_vel;
        }
        else
        {
            plat_vel_x -= plat_walk_acc;
            if (plat_vel_x < -plat_walk_vel) plat_vel_x = -plat_walk_vel;
            if (plat_vel_x > -plat_min_vel) plat_vel_x = -plat_min_vel;
        }
    }
    else if (joy & KEY_RIGHT)
    {
        actors[0].dir_x = 1;
        if (joy & KEY_A)
        {
            plat_vel_x += plat_run_acc;
            if (plat_vel_x > plat_run_vel) plat_vel_x = plat_run_vel;
            if (plat_vel_x < plat_min_vel) plat_vel_x = plat_min_vel;
        }
        else
        {
            plat_vel_x += plat_walk_acc;
            if (plat_vel_x > plat_walk_vel) plat_vel_x = plat_walk_vel;
            if (plat_vel_x < plat_min_vel) plat_vel_x = plat_min_vel;
        }
    }
    else if (plat_grounded)
    {
        if (plat_vel_x < 0)
        {
            plat_vel_x += plat_dec;
            if (plat_vel_x > 0) plat_vel_x = 0;
        }
        else if (plat_vel_x > 0)
        {
            plat_vel_x -= plat_dec;
            if (plat_vel_x < 0) plat_vel_x = 0;
        }
    }

    plat_x += plat_vel_x >> 8;
    px = plat_x >> 4;
    py = plat_y >> 4;

    if (plat_grounded && (joy & KEY_A) && !(prev_joy & KEY_A))
    {
        tile_x = px >> 3;
        tile_y = (py - 1) >> 3;
        if (actors[0].dir_x > 0)
        {
            hit_actor = actor_at_tile(tile_x + 2, tile_y);
        }
        else
        {
            hit_actor = actor_at_tile(tile_x - 1, tile_y);
        }
        // A "hostile" actor is never A-press-interactable, only contact-
        // triggered - same B-matching fix as SceneTryInteract's own (its
        // comment has the full reasoning); B's platform.c has this exact
        // exclusion too (`!hit_actor->collision_group`).
        if (hit_actor != 0xFF && !actors[hit_actor].collision_group)
        {
            run_script(actors[hit_actor].events_ptr, hit_actor);
        }
    }

    if ((joy & KEY_B) && !(prev_joy & KEY_B) && plat_grounded)
    {
        plat_vel_y = -plat_jump_vel;
        plat_grounded = 0;
    }

    if (joy & KEY_B)
    {
        if (plat_vel_y < 0) plat_vel_y += plat_hold_grav;
        else plat_vel_y += plat_grav;
    }
    else
    {
        plat_vel_y += plat_grav;
    }
    if (plat_vel_y > plat_max_fall_vel) plat_vel_y = plat_max_fall_vel;

    plat_y += plat_vel_y >> 8;
    px = plat_x >> 4;
    py = plat_y >> 4;

    // Wall collision - the sprite's leading vertical edge against the tile
    // column it would newly enter, checked at both the feet row and the
    // head row (this engine's sprite is a real 16px tall, unlike GB's own
    // ~8px physics-body convention here - see the function-group comment).
    if (plat_vel_x < 0)
    {
        s16 col = (px - 8) >> 3;
        if (col_solid(col, (py - 1) >> 3) || col_solid(col, (py - 16) >> 3))
        {
            plat_vel_x = 0;
            px = ((col + 1) << 3) + 8;
            plat_x = px << 4;
        }
    }
    else if (plat_vel_x > 0)
    {
        s16 col = (px + 7) >> 3;
        if (col_solid(col, (py - 1) >> 3) || col_solid(col, (py - 16) >> 3))
        {
            plat_vel_x = 0;
            px = (col << 3) - 8;
            plat_x = px << 4;
        }
    }

    // Ground / ceiling collision - the sprite's leading horizontal edge
    // (feet falling, head rising) against both columns it spans.
    if (plat_vel_y >= 0)
    {
        s16 row = py >> 3;
        s16 col_l = (px - 8) >> 3;
        s16 col_r = (px + 7) >> 3;
        if (col_solid(col_l, row) || col_solid(col_r, row))
        {
            plat_grounded = 1;
            plat_vel_y = 0;
            py = row << 3;
            plat_y = py << 4;
        }
        else
        {
            plat_grounded = 0;
        }
    }
    else
    {
        s16 row = (py - 16) >> 3;
        s16 col_l = (px - 8) >> 3;
        s16 col_r = (px + 7) >> 3;
        if (col_solid(col_l, row) || col_solid(col_r, row))
        {
            plat_vel_y = 0;
            py = ((row + 1) << 3) + 16;
            plat_y = py << 4;
        }
    }

    // Clamp to the scene, matching Point and Click's own scene-bounds
    // clamp - a screen/scene edge with no floor tile still acts as an
    // implicit floor (GB's own behaviour), so the player can't fall
    // forever off the bottom of a scene that simply has no ground there.
    if (px < 8)
    {
        px = 8;
        plat_x = px << 4;
        plat_vel_x = 0;
    }
    else if (px > ((s16)scene_width << 3))
    {
        px = (s16)scene_width << 3;
        plat_x = px << 4;
        plat_vel_x = 0;
    }
    if (py < 8)
    {
        py = 8;
        plat_y = py << 4;
        plat_vel_y = 0;
    }
    else if (py > ((s16)scene_height << 3))
    {
        py = (s16)scene_height << 3;
        plat_y = py << 4;
        plat_vel_y = 0;
        plat_grounded = 1;
    }

    actors[0].x = px;
    actors[0].y = py;
    actors[0].animate = (u8)(plat_grounded && plat_vel_x != 0);

    tile_x = SceneActorTileX(0);
    tile_y = SceneActorTileY(0);
    if (tile_x != plat_last_trigger_tx || tile_y != plat_last_trigger_ty)
    {
        plat_last_trigger_tx = tile_x;
        plat_last_trigger_ty = tile_y;
        SceneActivateTriggerAt(tile_x, tile_y);
    }
}

/* v2 M5e: Shoot Em Up genre pair (states.h) - the last of the 5 genres,
 * the furthest from anything already built per the M4 audit: a forced
 * auto-scroll along one axis (decided once, at Start_Shmup, from the
 * player's initial facing - matches GB exactly), with player input only
 * steering the PERPENDICULAR axis. Once the scrollable edge of the scene
 * is reached, the scroll axis simply locks in place - matches GB's own
 * Update_Shmup precisely: once shooter_reached_end, the primary axis's
 * position is never touched again (not auto-scrolled AND not player-
 * controlled), only the perpendicular axis keeps moving - e.g. so a ship
 * can lock horizontally in a boss arena and still dodge vertically.
 *
 * v4 follow-up: both dependencies this comment used to flag (a
 * collision_group ACTOR field, and the Projectiles subsystem) now exist.
 * Shooting: author a script here (or anywhere) that calls Launch Projectile
 * on an input script. Taking damage from touching an enemy: handled by
 * PlayerContactUpdate() (below Update_Shmup), shared across every genre
 * rather than genre-specific code here - this genre's own collision test
 * above never blocks the player from overlapping an actor either.
 *
 * v4 follow-up #2: A-press interact was entirely missing (user-found,
 * comparing to B while looking at Adventure's own A-press gap - B's real
 * shmup.c has the same `!hit_actor->collision_group` + `script.bank` guard
 * as topdown.c/adventure.c/platform.c, all four states share the idea even
 * though B implements each inline). Ported the cheap way: reuses the exact
 * same SceneTryInteract() Top Down and Adventure already call on a fresh
 * KEY_A press - it already had the hostile-actor exclusion (previous v4
 * follow-up) and now also the empty-script gate (this follow-up, see
 * SceneTryInteract's own comment) - both were already correct for Shmup's
 * needs with zero Shmup-specific code, just never wired up.
 *
 * Collision uses the same narrow, direction-biased single-point test
 * Adventure already established (see its own comment) rather than GB's
 * own per-direction pixel biases (which differ oddly by direction there -
 * e.g. a 2-tile look-ahead on one side, none on the other, tuned to GB's
 * own hitbox convention this engine doesn't share) - consistent with this
 * engine's own established style, not a guess at GB's exact intent.
 *
 * Camera: GB's own Start_Shmup biases the view ahead of the scroll
 * direction with a fixed pixel camera_offset (no deadzone) - ported for
 * real (v4), same 4 magic numbers (48/-64/48/-48) and the same per-
 * direction branch this function already has for shmup_horizontal/
 * shmup_direction, just also setting camera_offset_x/y there. The
 * "reached the scrollable edge" threshold below is still derived from this
 * engine's own real camera clamp (game.c's cam_max_x/cam_max_y formula,
 * mirrored here since those helpers are file-static to game.c) rather than
 * switched over to GB's own offset-relative threshold - a separate, later
 * cleanup, not required for the offset itself to work.
 *
 * v4 follow-up #3 (user-found comparing Settings to GB's real Engine
 * Fields: "Scroll Speed" for Shoot Em Up didn't exist here at all).
 * Previously the primary-axis auto-scroll below just reused the player
 * actor's own move_speed - conflating two things GB keeps separate
 * (shooter_scroll_speed drives the forced auto-scroll; PLAYER.move_speed
 * only ever drives the player's own perpendicular dodge steering, see
 * shmup.c). Now a real Engine Field (appData/src/snes/engine.json,
 * engine_fields.h) - the primary-axis advance below uses
 * shooter_scroll_speed, the perpendicular advance still uses
 * actors[0].move_speed, matching GB's real split exactly.
 */
// game.c's own SCREEN_W_HALF/SCREEN_H_HALF are file-static - redefined here
// rather than exported, since they're plain screen-geometry constants
// (256x224 NTSC / 2).
#define SHMUP_SCREEN_W_HALF 128
#define SHMUP_SCREEN_H_HALF 112

static u8 shmup_horizontal = 0;
static s8 shmup_direction = 1;
static u8 shmup_reached_end = 0;
static s16 shmup_last_trigger_tx = -1;
static s16 shmup_last_trigger_ty = -1;

void Start_Shmup(void)
{
    camera_deadzone_x = 0;
    camera_deadzone_y = 0;
    camera_offset_x = 0;
    camera_offset_y = 0;

    if (actors[0].dir_x < 0)
    {
        // Right to left scrolling. Face the ship right so a single-facing
        // sprite doesn't flip - matches GB (a left-facing variant is up to
        // the project's own sprite sheet, same as GB's own comment there).
        shmup_horizontal = 1;
        shmup_direction = -1;
        actors[0].dir_x = 1;
        camera_offset_x = 48;
    }
    else if (actors[0].dir_x > 0)
    {
        shmup_horizontal = 1;
        shmup_direction = 1;
        camera_offset_x = -64;
    }
    else if (actors[0].dir_y < 0)
    {
        shmup_horizontal = 0;
        shmup_direction = -1;
        camera_offset_y = 48;
    }
    else
    {
        shmup_horizontal = 0;
        shmup_direction = 1;
        camera_offset_y = -48;
    }

    shmup_reached_end = 0;
    actors[0].animate = 1;
    shmup_last_trigger_tx = -1;
    shmup_last_trigger_ty = -1;
}

void Update_Shmup(void)
{
    // Mirrors game.c's own (file-static) cam_max_x/cam_max_y: the furthest
    // the camera can scroll before the scene's far edge is already fully
    // on-screen. 256/224 are this target's real screen pixel dimensions
    // (SCREEN_W_HALF*2/SCREEN_H_HALF*2 in game.c).
    s16 cam_max_x = (s16)scene_width * 8 - 256;
    s16 cam_max_y = (s16)scene_height * 8 - 224;
    s16 tile_x, tile_y;

    if (cam_max_x < 0) cam_max_x = 0;
    if (cam_max_y < 0) cam_max_y = 0;

    tile_x = SceneActorTileX(0);
    tile_y = SceneActorTileY(0);
    if (tile_x != shmup_last_trigger_tx || tile_y != shmup_last_trigger_ty)
    {
        shmup_last_trigger_tx = tile_x;
        shmup_last_trigger_ty = tile_y;
        if (SceneActivateTriggerAt(tile_x, tile_y))
        {
            return;
        }
    }

    if ((joy & KEY_A) && !(prev_joy & KEY_A))
    {
        SceneTryInteract();
        if (script_ptr)
        {
            return;
        }
    }

    if (shmup_horizontal)
    {
        s16 body_col = actors[0].x >> 3;

        if ((joy & KEY_UP) && actors[0].y > 8 &&
            !col_solid(body_col, ((actors[0].y - 1) - 1) >> 3))
        {
            actors[0].dir_y = -1;
            actors[0].dir_x = 0;
        }
        else if ((joy & KEY_DOWN) && actors[0].y < ((s16)scene_height << 3) &&
                 !col_solid(body_col, ((actors[0].y + 1) - 1) >> 3))
        {
            actors[0].dir_y = 1;
            actors[0].dir_x = 0;
        }
        else
        {
            actors[0].dir_y = 0;
            actors[0].dir_x = 1;
        }

        if (!shmup_reached_end)
        {
            if (shmup_direction == 1)
            {
                if (actors[0].x >= cam_max_x + SHMUP_SCREEN_W_HALF) shmup_reached_end = 1;
            }
            else
            {
                if (actors[0].x <= SHMUP_SCREEN_W_HALF) shmup_reached_end = 1;
            }
        }

        if (!shmup_reached_end)
        {
            actors[0].x += (s16)shmup_direction * (s16)shooter_scroll_speed;
        }
        actors[0].y += (s16)actors[0].dir_y * actors[0].move_speed;
    }
    else
    {
        s16 body_row = (actors[0].y - 1) >> 3;

        if ((joy & KEY_LEFT) && actors[0].x > 8 &&
            !col_solid(((actors[0].x - 1) - 8) >> 3, body_row))
        {
            actors[0].dir_x = -1;
            actors[0].dir_y = 0;
        }
        else if ((joy & KEY_RIGHT) && actors[0].x < ((s16)scene_width << 3) &&
                 !col_solid(((actors[0].x + 1) + 7) >> 3, body_row))
        {
            actors[0].dir_x = 1;
            actors[0].dir_y = 0;
        }
        else
        {
            actors[0].dir_x = 0;
            actors[0].dir_y = shmup_direction;
        }

        if (!shmup_reached_end)
        {
            if (shmup_direction == 1)
            {
                if (actors[0].y >= cam_max_y + SHMUP_SCREEN_H_HALF) shmup_reached_end = 1;
            }
            else
            {
                if (actors[0].y <= SHMUP_SCREEN_H_HALF) shmup_reached_end = 1;
            }
        }

        if (!shmup_reached_end)
        {
            actors[0].y += (s16)shmup_direction * (s16)shooter_scroll_speed;
        }
        actors[0].x += (s16)actors[0].dir_x * actors[0].move_speed;
    }
}

void SceneHandleInput(void)
{
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
    // v2 M5d, real bug found and fixed: this gate used to run unconditionally
    // for every genre, but "mid-step" (not exactly tile-aligned) is only a
    // meaningful concept for Top Down's tile-locked movement. Point and
    // Click's cursor, Adventure's free-pixel movement, and Platform's
    // fixed-point physics ALL leave tile alignment on their very first real
    // movement step and, unconditionally gated like this, would have been
    // permanently frozen from that point on - updateFuncs[scene_type]() (and
    // input scripts, below) would simply never run again for the rest of the
    // scene. Caught by Platform's gravity trace going dead after exactly 2
    // frames (y left alignment, then froze) - see MIGRATION_V2_AUDIT.md's
    // M5d section for the retroactive correction this forced on M5b/M5c's
    // own "verified" claims, which turn out to have exercised this same gate
    // without ever actually re-running past the first aligned frame either.
    if (scene_type == SCENE_TYPE_TOPDOWN)
    {
        if (!ACTOR_ON_TILE(0))
        {
            return; // mid-step
        }
    }

    // Input scripts: one slot per button (SET_INPUT_SCRIPT), only re-checked
    // once the raw joy state changes - matches the GB engine so a script
    // fires once per press rather than every frame the button stays held.
    if (joy != 0 && joy != prev_joy)
    {
        u16 gbj = SceneGbInputBits(joy);
        u8 i;
        for (i = 0; i < NUM_INPUT_SCRIPTS; i++)
        {
            if ((gbj & (1 << i)) && input_script_ptrs[i].ptr)
            {
                actors[0].moving = 0;
                run_script(input_script_ptrs[i], 0);
                return;
            }
        }
    }

    /* v2 M5a: player movement + A-button interact are genre-specific from
     * here on (Top Down's tile-locked d-pad + facing-tile interact vs., e.g.,
     * Point and Click's cursor-hover interact with no movement at all) -
     * see states.h. */
    updateFuncs[scene_type]();
}

// v2 M5c: shared "walk onto a trigger" primitive (GB's own ActivateTriggerAt,
// Trigger.c - a genuinely shared helper there too, called directly from each
// state's own Update_ function, not gated through one generic scene-wide
// hook). Scans type-0 (walk-over) triggers at tile (tx,ty) and runs the
// first match's script. Returns 1 if a trigger fired. Callers own their own
// debounce (GB's own ActivateTriggerAt compares against a remembered last
// checked tile; this engine's two callers below use different, already-
// proven debounce styles - Top Down's movement-armed `check_triggers` flag,
// Adventure's tile-compare - rather than being unified, since both already
// work and unifying them risks regressing Top Down's proven behaviour for
// no behavioural gain).
static u8 SceneActivateTriggerAt(s16 tx, s16 ty)
{
    u8 i;
    for (i = 0; i < scene_num_triggers && i < MAX_TRIGGERS; i++)
    {
        if (triggers[i].type != 0) continue;
        if (!in_box(tx, ty, triggers[i].x, triggers[i].y,
                    triggers[i].w, triggers[i].h)) continue;
        actors[0].moving = 0;
        run_script(triggers[i].events_ptr, 0);
        return 1;
    }
    return 0;
}

static void SceneCheckTriggers(void)
{
    s16 tx, ty;

    // Sequential ifs, not `a || b || c`: 816-tcc mis-links the branch targets of
    // a 3-term boolean chain in a conditional (a walk trigger was firing while a
    // scripted ACTOR_MOVE_TO of the player was still paused mid-script).
    //
    // v2 M5b: walk-over (type 0) triggers are a Top Down concept - GB's own
    // PointNClick.c never calls its ActivateTriggerAt equivalent at all (the
    // M4 audit's "collision-free floating cursor" finding). This check used
    // to run unconditionally every frame from SceneUpdate() below, which
    // only ever mattered while Top Down was the sole genre; once the cursor
    // (still actor 0) can wander across a walk-trigger's tile in Point and
    // Click, it would fire spuriously. Gated here rather than moved into a
    // per-genre "states" file - see states.h's file-split deferral note.
    //
    // v2 M5c: Adventure DOES want walk-over triggers (GB's own Adventure.c
    // calls ActivateTriggerAt too) but not through this function - its free
    // pixel movement is rarely exactly tile-aligned on both axes, so the
    // `actor_on_tile(0)` gate below (tuned for Top Down's per-tile stepping)
    // would make triggers unreliable there. Update_Adventure calls
    // SceneActivateTriggerAt directly instead, every frame, with its own
    // tile-compare debounce - matching GB's real per-genre-owned call sites
    // more closely than forcing every genre through one shared gate would.
    if (scene_type != SCENE_TYPE_TOPDOWN) return;
    if (!check_triggers) return;
    if (script_ptr) return;
    if (!actor_on_tile(0)) return;

    tx = SceneActorTileX(0);
    ty = SceneActorTileY(0);

    if (SceneActivateTriggerAt(tx, ty))
    {
        check_triggers = 0;
    }
}

// Random-walk / random-face NPC AI, on frames 0/64/128/192 like the GB engine.
// PERF.md: touching every actor on the same AI-tick frame means every one
// that decides to walk also runs npc_blocking()'s O(actor count) scan that
// same frame - up to N calls each O(N), concentrated exactly where a frame
// could be dropped. The GB engine (Scene_b.c) never does this either: it
// only considers *half* the actors per tick - odd indices on frames 0/128,
// even on 64/192 - so each actor's own decision cadence is every 128 frames,
// not 64, but no two actors' decisions ever pile up on the same frame. Ported
// that striping here (the SNES port previously touched every actor every 64
// frames, twice as often as GB and with no such spread).
static void SceneUpdateAi(void)
{
    u8 i, first;
    s8 dirs[4][2] = {{0, -1}, {0, 1}, {-1, 0}, {1, 0}};

    if ((time & 0x3F) != 0)
    {
        return;
    }
    first = (u8)(time == 0 || time == 128);
    for (i = 1; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        if (script_ptr) return;
        if ((i & 1) != first) continue;
        if (!actors[i].enabled) continue;
        if (!actors[i].active) continue;
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
        // v2 M5c: Adventure's own Update_Adventure already applied this
        // frame's movement directly (free-pixel, not tile-quantized - see
        // its own comment on why it can't use actor_try_move/this stepping
        // loop). It still sets actors[0].moving purely so the walk-cycle
        // gate below (SceneAnimateActors) animates - stepping position
        // again here would double-move the player. Scoped to i==0 only:
        // NPCs (movement_type-driven AI, still tile-locked everywhere)
        // keep using this loop exactly as before, in every genre.
        if (i == 0 && scene_type == SCENE_TYPE_ADVENTURE)
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
            // -8 x / -16 y: a 16x16 sprite whose feet sit at the bottom of the
            // actor's tile, matching the GB engine (actor pos = tile*8+8, GB
            // OAM shows at pos - {8,16}); -8 y put every sprite a tile too low
            // (an actor placed "on the stairs" rendered one row below them).
            // M7 (v4): priority 0, not 2 - Mode 1's OBJ0 sits below a BG1
            // "high priority" tile (BG_TIL_PRIO), so a painted priority tile
            // now actually renders above the actor; a normal (non-priority)
            // BG1 tile still sits below OBJ0, so ordinary scenes are
            // unaffected. See EVENTS.md's Parallax/Priority sections for the
            // full Mode 1 layer ordering this relies on.
            oamSet(oid, actors[i].x - scroll_x - 8, actors[i].y - scroll_y - 16, 0,
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
        /* M7 (v4): priority 0, same reasoning as the actor oamSet above -
         * the emote bubble is a world-space sprite (floats above the
         * actor's head), so it should respect priority tiles the same way. */
        oamSet(EMOTE_OID, actors[emote_actor].x - scroll_x - 8,
               actors[emote_actor].y - scroll_y - 32, 0, 0, 0,
               EMOTE_TILE0 + emote_id * 2, 1);
        oamSetEx(EMOTE_OID, OBJ_LARGE, OBJ_SHOW);
    }
    else
    {
        oamSetVisible(EMOTE_OID, OBJ_HIDE);
    }
}

void ProjectileSpawn(s16 x, s16 y, s8 dir_x, s8 dir_y, u8 speed, u8 sprite_slot,
                      u8 collision_group, u8 collision_mask, u8 ttl)
{
    u8 i;
    for (i = 0; i < MAX_PROJECTILES; i++)
    {
        if (projectiles[i].active) continue;
        projectiles[i].active = 1;
        projectiles[i].x = x;
        projectiles[i].y = y;
        projectiles[i].dir_x = dir_x;
        projectiles[i].dir_y = dir_y;
        projectiles[i].speed = speed;
        projectiles[i].sprite_slot = sprite_slot;
        projectiles[i].collision_group = collision_group;
        projectiles[i].collision_mask = collision_mask;
        projectiles[i].ttl = ttl;
        return;
    }
    /* Pool exhausted - silently dropped, matching B's own projectile_launch()
     * behaviour (no warning/queueing mechanism on that side either). */
}

/* Fires the hit actor's own script matching the projectile's collision_group -
 * "player" (bit 1) fires the actor's regular interact script (this schema has
 * no player-specific hit slot - see ActorEditor.tsx's hitTabs on the B side,
 * which maps its own "Player" hit tab to that same "script" key), groups
 * 1/2/3 (bits 2/4/8) fire hit1/2/3_idx respectively. Dropped (not queued) if
 * a script is already running - this engine only ever runs one script at a
 * time project-wide, same constraint every other script-launch site already
 * lives with (SceneTryInteract, timers, triggers). */
static void projectile_fire_hit_script(u8 actor_i, u8 collision_group)
{
    if (script_ptr) return;
    if (collision_group == 1) { run_script(actors[actor_i].events_ptr, actor_i); return; }
    if (collision_group == 2) { run_script(event_ptrs[actors[actor_i].hit1_idx], actor_i); return; }
    if (collision_group == 4) { run_script(event_ptrs[actors[actor_i].hit2_idx], actor_i); return; }
    if (collision_group == 8) { run_script(event_ptrs[actors[actor_i].hit3_idx], actor_i); }
}

void ProjectilesUpdate(void)
{
    u8 i, j;
    for (i = 0; i < MAX_PROJECTILES; i++)
    {
        u16 oid;
        u8 tile, flip;

        if (!projectiles[i].active) continue;
        oid = PROJECTILE_OID_BASE + ((u16)i << 2);

        if (projectiles[i].ttl)
        {
            projectiles[i].ttl--;
            if (!projectiles[i].ttl)
            {
                projectiles[i].active = 0;
                oamSetVisible(oid, OBJ_HIDE);
                continue;
            }
        }

        projectiles[i].x += (s16)projectiles[i].dir_x * projectiles[i].speed;
        projectiles[i].y += (s16)projectiles[i].dir_y * projectiles[i].speed;

        /* Leaving the scene despawns it - the only lifetime check
         * LAUNCH_PROJECTILE relies on (its wire format has no lifeTime
         * field to count down instead, see the PROJECTILE struct comment). */
        if (projectiles[i].x < 0 || projectiles[i].x >= ((s16)scene_width << 3) ||
            projectiles[i].y < 0 || projectiles[i].y >= ((s16)scene_height << 3))
        {
            projectiles[i].active = 0;
            oamSetVisible(oid, OBJ_HIDE);
            continue;
        }

        /* Collision vs. the player (index 0, follow-up - the actor loop just
         * below only ever tested 1..scene_num_actors). Fires the scene's
         * playerHit1/2/3Script by the *projectile's own* collision_group -
         * "1"/"2"/"3" (bits 2/4/8) map to player_hit_idx[0/1/2]; "player"
         * (bit 1) fires nothing (no slot for it - matches B: a player-owned
         * projectile hitting the player isn't a thing to author against). No
         * player_iframes/invincibility-window concept here, unlike B's own
         * actor-walks-into-player path - not needed for this path specifically
         * since a projectile is always a single, one-shot hit (destroyed
         * immediately below), never a multi-frame overlap that would need
         * debouncing the way a standing/wandering hostile actor would. */
        if (actors[0].enabled && (actors[0].collision_group & projectiles[i].collision_mask))
        {
            s16 px = actors[0].x, py = actors[0].y;
            if (projectiles[i].x + 4 >= px - 8 && projectiles[i].x - 4 <= px + 8 &&
                projectiles[i].y + 4 >= py - 16 && projectiles[i].y - 4 <= py)
            {
                u8 g = projectiles[i].collision_group;
                if (g == 2 || g == 4 || g == 8)
                {
                    u8 idx = player_hit_idx[g == 2 ? 0 : g == 4 ? 1 : 2];
                    if (!script_ptr) run_script(event_ptrs[idx], 0);
                }
                projectiles[i].active = 0;
                oamSetVisible(oid, OBJ_HIDE);
            }
        }
        if (!projectiles[i].active) continue;

        /* Collision vs. actors (1..scene_num_actors). */
        for (j = 1; j <= scene_num_actors && j < MAX_ACTORS; j++)
        {
            s16 ax, ay;
            if (!actors[j].enabled) continue;
            if (!actors[j].active) continue;
            if (!(actors[j].collision_group & projectiles[i].collision_mask)) continue;
            ax = actors[j].x;
            ay = actors[j].y;
            /* Actor box: x-8..x+8, y-16..y (matches SceneRenderActors' own
             * -8/-16 OAM offset). Projectile box: a small 8x8 centred on its
             * own x,y. */
            if (projectiles[i].x + 4 < ax - 8) continue;
            if (projectiles[i].x - 4 > ax + 8) continue;
            if (projectiles[i].y + 4 < ay - 16) continue;
            if (projectiles[i].y - 4 > ay) continue;

            projectile_fire_hit_script(j, projectiles[i].collision_group);
            projectiles[i].active = 0;
            oamSetVisible(oid, OBJ_HIDE);
            break;
        }
        if (!projectiles[i].active) continue;

        /* Render: borrows sprite_slot's own tiles/palette (already loaded by
         * SceneInit for whichever actor/player sheet occupies that slot this
         * scene - see the PROJECTILE struct's own comment). Always frame 0,
         * h-flipped moving left - a full 4-direction facing pick (matching
         * actor_render_tile) was skipped for this first pass: most
         * projectile art (bullets, arrows fired only sideways) doesn't need
         * it, and it can be added later without changing the wire format. */
        tile = projectiles[i].sprite_slot * 2;
        flip = projectiles[i].dir_x < 0 ? 1 : 0;
        oamSet(oid, projectiles[i].x - scroll_x - 4, projectiles[i].y - scroll_y - 4, 0,
               flip, 0, tile, sprite_pal_for_slot[projectiles[i].sprite_slot]);
        oamSetEx(oid, OBJ_LARGE, OBJ_SHOW);
    }
}

/* Follow-up to Projectiles (v4): "walk into a hostile actor" damage -
 * B's actors_handle_player_collision() (fires script_p_hit1/2/3 + the
 * actor's own script, sets player_iframes), the "player_iframes/hit_actor/
 * collision_group" mechanic Adventure/Platform's own comments (above) have
 * flagged as not-ported since M5c/M5d. Both real dependencies it was
 * blocked on (Actor.collision_group, the playerHit1/2/3Script firing path)
 * now exist from the Projectiles work, so this is a much smaller follow-up
 * than it looked like at the time.
 *
 * Deliberately overlap-based, not movement-blocking-based, and shared
 * across every genre by one function (not genre-specific code in each
 * Update_*): Top Down's own actor_try_move()/npc_blocking() already BLOCKS
 * the player from ever stepping onto another actor's tile at all (so a
 * bump there never produces real overlap to detect), but Adventure and
 * Platform's player movement never call npc_blocking() in the first place -
 * their own collision tests are narrow, terrain-only (col_solid), so the
 * player can already freely walk through/over an NPC in those two genres
 * today. One overlap check, run after every genre's Update_* regardless of
 * how (or whether) that genre blocks actor-vs-actor movement, covers all
 * five without new genre-specific plumbing.
 *
 * Only fires the scene's playerHit1/2/3Script (same as a projectile hitting
 * the player) - not also the actor's own script the way B fires both context
 * fires, since this engine only ever runs one script at a time project-wide;
 * picking one consistently (matching the already-shipped projectile path)
 * beats trying to fire two and only getting to the first. */
void PlayerContactUpdate(void)
{
    u8 j;
    s16 px, py;

    if (player_iframes)
    {
        player_iframes--;
        return;
    }
    if (!actors[0].enabled) return;

    px = actors[0].x;
    py = actors[0].y;
    for (j = 1; j <= scene_num_actors && j < MAX_ACTORS; j++)
    {
        s16 ax, ay;
        u8 g;
        if (!actors[j].enabled) continue;
        if (!actors[j].active) continue;
        g = actors[j].collision_group;
        if (g != 2 && g != 4 && g != 8) continue; /* "1"/"2"/"3" only - see PROJECTILE's own note on the bit values */
        ax = actors[j].x;
        ay = actors[j].y;
        /* Same 16x16-actor-box-vs-16x16-actor-box test as everywhere else
         * actor bounds are compared (SceneRenderActors' -8/-16 OAM offset). */
        if (px + 8 < ax - 8) continue;
        if (px - 8 > ax + 8) continue;
        if (py + 8 < ay - 16) continue;
        if (py - 8 > ay) continue;

        if (!script_ptr)
        {
            u8 idx = player_hit_idx[g == 2 ? 0 : g == 4 ? 1 : 2];
            run_script(event_ptrs[idx], 0);
        }
        player_iframes = PLAYER_IFRAMES;
        return;
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
    ProjectilesUpdate();
    PlayerContactUpdate();
    UpdateScriptsProcess();
}
