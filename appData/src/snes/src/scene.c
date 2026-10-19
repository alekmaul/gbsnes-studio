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
#include "music.h"
#include "input_defines.h"

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

/* Horizontal background streaming (v4) - see SceneStreamBackground's own
 * comment (scene.h). 0xff = no active streaming background (the common
 * case - reset every SceneInit, only set when bg_map_w[bg_index] > 64). */
static u8 stream_bg_index = 0xff;
static u16 stream_bg_w = 0;
static u8 stream_bg_h = 0;
/* World tile-column currently occupying VRAM tile-column 0 of the 64-wide
 * ring buffer - i.e. VRAM column (worldCol & 63) always holds world column
 * worldCol, kept true by streaming a column in/out exactly as it crosses
 * the loaded window's edge. Starts at 0 (SceneInit's own initial DMA
 * already loads world columns 0-63 into VRAM columns 0-63 unchanged). */
static u16 stream_window_left = 0;

/* v4 (Map Engine streaming) - see scene.h's own comment. Reset every
 * SceneInit; mutually exclusive with stream_bg_index != 0xff. */
u8 map_engine_active = 0;

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
/* v4 perf fix (user-found: "top down 2D is slow, even with only 4/5
 * actors"; traced to a scene with several walk-triggers where the player
 * gets blocked against a wall while still holding a direction). See
 * SceneCheckTriggers's own comment for the full story - this pair mirrors
 * Adventure's own already-proven `adv_last_trigger_tx/ty` (real GB
 * behaviour: "compares against a remembered last checked tile"), which Top
 * Down never adopted. */
static s16 td_last_trigger_tx = -1;
static s16 td_last_trigger_ty = -1;
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
u8 sprite_oam_ids_for_slot[SPRITE_SLOTS]; /* M7 groundwork, see scene.h */
const unsigned char *sprite_slot_for_index = 0;

/* M7 groundwork, see scene.h - .bss isn't pre-zeroed either, SceneInit
 * always fills every entry up to scene_num_actors before anything reads it. */
u16 actor_oam_base[MAX_ACTORS];

/* M9.4 - see scene.h's own comment. All computed fresh in SceneInit, right
 * after the actor_oam_base[] prefix-sum loop, before anything else reads
 * them. */
u16 actor_oam_total;
u16 emote_oid;
u16 projectile_oid_base;
u16 avatar_oid;

/* M8.3 (SPRITE_EDITOR_PROGRESS.md): a slot's "extra" poses (anything beyond
 * its own primary/frame-0 pose, which still always lives at a fixed address
 * derived from the slot number itself - see actor_render_tile's own `fo`)
 * used to be at a fixed, compile-time offset from `fo` (ACTOR_UP_TILE0 etc,
 * now removed) - every slot's "up" pose 96 tiles past its "down" pose, no
 * matter what. Now each slot's real extra poses are packed on demand, per
 * scene, by compileSnesData.js's createScenePacker() (packSceneSprites.js),
 * so their VRAM address varies and has to be read back at runtime instead.
 * Each byte is a HALF-tile-base (real tile index = value << 1 - every
 * packer placement is 2-aligned, so this fits the full 0-511 tile range in
 * one byte); 0 = this pose was never placed for this slot (fewer real
 * frames than the pose needs) - never actually read in that case, since
 * sprite_frames_for_slot[]/direction gating already decide whether a given
 * pose is ever asked for. Filled by SceneInit from the scene blob's own
 * trailing [40] table (after the collision bitmap - see its own comment). */
u8 extra_pose_down_b[SPRITE_SLOTS];
u8 extra_pose_up_a[SPRITE_SLOTS];
u8 extra_pose_up_b[SPRITE_SLOTS];
u8 extra_pose_side_a[SPRITE_SLOTS];
u8 extra_pose_side_b[SPRITE_SLOTS];
/* M9.4 - see scene.h's own comment. .bss isn't pre-zeroed either, so
 * SceneInit always writes every entry (NULL or a real pointer) before
 * SceneRenderActors ever reads one. */
const unsigned char *metasprite_frame_base[SPRITE_SLOTS];

/* Named animation states (v4 follow-up) - see scene.h's own comment and
 * SceneInit's own parsing of the scene blob's trailing has_anim_states
 * section. anim_state_count[slot] is how many *extra* states (beyond the
 * sheet's own default/implicit state 0) this slot's sheet authors;
 * anim_state_dir[slot] points at that slot's own directory of
 * {frames_len, spriteType, byteOffset(u16)} entries, one per extra state,
 * or 0 if anim_state_count[slot] is 0. Same "always written before any
 * reader runs" discipline as metasprite_frame_base above. */
u8 has_anim_states;
u8 anim_state_count[SPRITE_SLOTS];
const unsigned char *anim_state_dir[SPRITE_SLOTS];

/* Adventure genre, Option 1 (box-sweep collision) - see scene.h's own
 * comment. .bss isn't pre-zeroed either, but SceneInit always writes all
 * four from the scene blob's trailing bytes before Update_Adventure (the
 * only reader) can ever run. */
s8 player_bounds_left, player_bounds_right, player_bounds_top, player_bounds_bottom;

/* MUSIC_PLAY preload (v4, "Space Battle" fix) - see scene.h's own comment. */
u8 scene_music_preload;

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
                             leaving the scene instead). WEAPON_ATTACK's
                             momentary hitbox always sets this (its own
                             WEAPON_ATTACK_TTL); LAUNCH_PROJECTILE now does
                             too (LAUNCH_PROJECTILE_TTL, script_cmds.c) -
                             without it, a scene with several actors
                             continuously firing (On Update scripts loop
                             forever) can permanently fill the small shared
                             MAX_PROJECTILES pool, starving every other
                             source (a real user-found bug: the player's own
                             shots silently found no free slot) */
} PROJECTILE;
static PROJECTILE projectiles[MAX_PROJECTILES];
/* On Player Hit script indices (collision group 1/2/3), read from the scene
 * blob by SceneInit right after the parallax table - see that code and
 * ProjectilesUpdate() below. */
static u16 player_hit_idx[3];

/* Contact damage follow-up (v4): walking into a hostile actor. See
 * PlayerContactUpdate()'s own comment for the full design. */
#define PLAYER_IFRAMES 60 /* ~1s at 60fps - no visual flash during it (GB's
                              own "flash" cue) yet, a documented simplification */
static u8 player_iframes = 0;
/* M7 fix (SPRITE_EDITOR_PROGRESS.md, found during the M7 OAM rework): this
 * used to be `(u16)(MAX_ACTORS + 1) << 2` - the *literal same expression* as
 * ui.c's AVATAR_OID, so the dialogue avatar and projectile pool slot 0
 * silently shared one hardware OAM id (both written every frame, SceneUpdate
 * then UIUpdate in game.c's main loop). One OAM id per pool slot, right
 * after the emote's own (EMOTE_OID, defined further down next to
 * SceneRenderActors) - now genuinely distinct from AVATAR_OID because both
 * are derived from the same tight scheme instead of two independently-hand-
 * picked constants that happened to collide. All three (EMOTE_OID/
 * PROJECTILE_OID_BASE/AVATAR_OID) assumed every actor costs exactly 1 OAM id
 * - flagged here, at the time, as needing to become real runtime values the
 * moment that stopped being true. M9.4 (SPRITE_EDITOR_PROGRESS.md) is that
 * moment: all three are now real u16 globals (projectile_oid_base, emote_oid,
 * avatar_oid - scene.h), computed once in SceneInit right after the
 * actor_oam_base[] prefix-sum loop from its own real running total
 * (actor_oam_total), not compile-time constants anymore.
 *
 * M8.3 correction (SPRITE_EDITOR_PROGRESS.md, user-found: snesgbs2's Sample
 * Town - 9 actors on screen at once - rendered no sprites at all): the
 * `<< 2` this comment's own first line describes as "the literal same
 * expression" was dropped here (and from EMOTE_OID/AVATAR_OID/the
 * actor_oam_base[] prefix sum below) on the theory that it was "incidental
 * `i << 2` spacing... reserved 4 ids/actor for no real reason." That theory
 * was wrong - confirmed by reading PVSnesLib's own real oamSet/oamSetEx/
 * oamSetVisible asm (sprites.asm) directly: every `id` parameter these
 * functions take is a **byte offset** into the real OAM shadow buffer
 * (`oamMemory`), not a plain sprite index - oamSet's own prologue does
 * `tax` on the raw 16-bit `id` then `sta.l oamMemory+0,x`, and oamSetEx's
 * `id >> 4` computation for the packed high-attribute table only produces
 * the right byte (4 sprites/byte, so byte = id/16 when id is itself
 * already sprite*4) under exactly this same assumption. Passing a plain
 * sprite count (0,1,2,...) instead of a byte offset (0,4,8,...) makes each
 * actor's OAM write partially overlap the next one's 4-byte slot - which
 * is exactly why only the very first field (X) of actor 0 ever looked
 * right in a real multi-actor Mesen check: Y/tile/attr all live at byte
 * offsets a later actor's own (wrongly 1-apart, not 4-apart) write then
 * clobbers. The real id-84 collision this comment documents was never
 * about removing `<<2` - 84 was always `(MAX_ACTORS+1) << 2`, i.e. this
 * exact value once `<<2` is restored; the actual pre-M7 bug was that
 * PROJECTILE_OID_BASE and AVATAR_OID were independently hand-picked
 * *equal* expressions, not that either was wrong to scale by 4. `<<2` is
 * restored here and on every other OID derived the same way (now via
 * projectile_oid_base, a real runtime value - see this comment's own first
 * paragraph and scene.h). */

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
// Perf: takes a pointer, not an index (table[i]-vs-pointer fix, same class as
// npc_blocking/actor_try_move/SceneRenderActors/SceneAnimateActors - see
// PERF.md) - every call site either already has actors[i]'s pointer in hand
// or is a compile-time-constant index (actors[0]), so this only ever removes
// redundant re-indexing, never adds any.
static u8 actor_on_tile(ACTOR *a)
{
    if ((a->x & 7) != 0) return 0;
    if ((a->y & 7) != 0) return 0;
    return 1;
}

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
            if (!actor_on_tile(&actors[0])) return;
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

// col_solid()/col_solid_row2() perf note (found investigating the Map/Object
// Engine milestone's M3 - see the roadmap artifact, and [[snes-map-object-
// engine-investigation]] in memory): this tiny-looking bitmap bit-test does
// NOT compile to a tiny-looking routine. Checked the real 816-tcc/816-opt
// output: `>> (idx & 7)` alone became a ~7-iteration runtime rotate loop
// (`ror`/`dey`/`bne`), and `ty * scene_width` a genuine `jsr.l tcc__mul`
// subroutine call - for what should be a couple of instructions each. This
// is called twice per move attempt (can_step) and in the movement/collision
// path PERF.md's own profiling already names as this engine's one measured
// slowdown. Two independent, low-risk fixes, both plain C, no hand-asm:
//   - a static lookup table turns the variable-shift rotate loop into one
//     table read + one AND, for every caller.
//   - col_solid_row2() hoists the ty*scene_width multiply for the two real
//     call patterns that test two x-positions at the same y (can_step,
//     ground/ceiling collision) - one multiply instead of two. The other
//     col_solid() call sites (different y each time, or mutually exclusive
//     if/else branches that only ever run one of the two per frame) have no
//     shared multiply to hoist, so they keep calling col_solid() directly.
static const u8 col_bit_mask[8] = { 1, 2, 4, 8, 16, 32, 64, 128 };

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
    if (scene_col[idx >> 3] & col_bit_mask[idx & 7]) return 1;
    return 0;
}

// Solid at (tx0, ty) or (tx1, ty)? Same bounds/bitmap semantics as
// col_solid(), but the ty*scene_width row multiply runs once for both tests
// instead of once per col_solid() call - see the perf note above.
static u8 col_solid_row2(s16 tx0, s16 tx1, s16 ty)
{
    u16 row;
    u16 idx;
    if (ty < 0) return 1;
    if (ty >= scene_height) return 1;
    row = (u16)ty * scene_width;

    if (tx0 < 0) return 1;
    if (tx0 >= scene_width) return 1;
    idx = row + (u16)tx0;
    if (scene_col[idx >> 3] & col_bit_mask[idx & 7]) return 1;

    if (tx1 < 0) return 1;
    if (tx1 >= scene_width) return 1;
    idx = row + (u16)tx1;
    if (scene_col[idx >> 3] & col_bit_mask[idx & 7]) return 1;

    return 0;
}

/* Directional collision + ladders (Update_Platform only). The editor's own
 * BrushToolbar.js already lets a project author per-tile COLLISION_TOP/
 * BOTTOM/LEFT/RIGHT and a ladder flag (inherited from GB Studio, consts.js'
 * own COLLISION_* / TILE_PROP_LADDER) - col_solid()/scene_col[] above never
 * carried that nuance through (1 bit/tile: "was the authored byte nonzero
 * at all" - see compileSnesData.js's own comment on this), so a painted
 * one-way platform or ladder silently behaved as a fully-solid wall on
 * this engine. This table is a second, optional, per-tile BYTE array
 * (1 byte/tile, raw authored collision byte) that Update_Platform consults
 * instead of col_solid() when the current scene actually used any of
 * these brushes - col_solid()/scene_col[] themselves, and every other
 * genre, are completely untouched.
 *
 * Sized smaller than SCENE_COL_BYTES's own 255x64 ceiling on purpose: a
 * byte/tile table at that same tile budget would be 16320 bytes, a real
 * WRAM cost for a feature most scenes won't use. 2040 tiles (e.g. 64x31)
 * comfortably covers a realistic Platform level; compileSnesData.js warns
 * if a scene's own width*height exceeds it, and SceneInit below clamps the
 * copy the same defensive way scene_col[] already does for its own bitmap. */
#define SCENE_COL_DIR_BYTES 2040
static u8 scene_col_dir[SCENE_COL_DIR_BYTES];
static u8 platform_has_col_dir = 0;

#define PLAT_COL_TOP    0x1
#define PLAT_COL_BOTTOM 0x2
#define PLAT_COL_LEFT   0x4
#define PLAT_COL_RIGHT  0x8
#define PLAT_COL_LADDER 0x10

/* Raw authored collision byte at (tx,ty), only meaningful while
 * platform_has_col_dir is set. Out of bounds degrades to "solid from every
 * direction, not a ladder" (0xF), matching col_solid()'s own "out of bounds
 * counts as solid" convention.
 *
 * Real bug (user-found: a wide scene's player got shoved backwards every
 * frame trying to move in either direction, on perfectly open ground). Past
 * the table's own tile budget (compileSnesData.js's own SCENE_COL_DIR_BYTES
 * warning covers exactly this case) used to hardcode 0xF too - "solid from
 * every direction" for a tile that was never actually painted solid at all,
 * on a scene wide enough that an entire row (not just a far corner) could
 * sit past the budget from the very first frame. platform_blocks()'s own
 * header comment already documented the INTENDED fallback - "the old flat
 * col_solid() rule" - but this function's code never actually deferred to
 * it for an out-of-budget tile, only for a scene with no directional table
 * at all. Now it does: col_solid() reads the separate, much larger
 * scene_col[] bitmap (SCENE_COL_BYTES, sized for the full scene regardless
 * of this table's own smaller budget), so an out-of-budget tile now
 * correctly reads as solid-every-direction only if it's REALLY painted
 * solid, and fully open otherwise - matching what every other genre's own
 * collision already does for the same tile. */
static u8 platform_col_byte(s16 tx, s16 ty)
{
    u16 idx;
    if (tx < 0) return 0xF;
    if (ty < 0) return 0xF;
    if (tx >= scene_width) return 0xF;
    if (ty >= scene_height) return 0xF;
    idx = (u16)ty * scene_width + (u16)tx;
    if (idx >= SCENE_COL_DIR_BYTES) return col_solid(tx, ty) ? 0xF : 0;
    return scene_col_dir[idx];
}

/* Does (tx,ty) block Platform movement in direction dirBit (one of
 * PLAT_COL_TOP/BOTTOM/LEFT/RIGHT)? When this scene has no directional
 * table (the common case - no one-way platform/ladder brush used),
 * this is exactly col_solid()'s own flat solid/not-solid bit, so every
 * existing project's Platform behaviour is completely unchanged. */
static u8 platform_blocks(s16 tx, s16 ty, u8 dirBit)
{
    if (!platform_has_col_dir) return col_solid(tx, ty);
    return (platform_col_byte(tx, ty) & dirBit) ? 1 : 0;
}

/* Two-column version of platform_blocks(), same shared-row shape as
 * col_solid_row2() for the Y-sweep's left/right foot pair. */
static u8 platform_blocks_row2(s16 tx0, s16 tx1, s16 ty, u8 dirBit)
{
    if (!platform_has_col_dir) return col_solid_row2(tx0, tx1, ty);
    if (platform_col_byte(tx0, ty) & dirBit) return 1;
    if (platform_col_byte(tx1, ty) & dirBit) return 1;
    return 0;
}

/* Is (tx,ty) a ladder tile? Always false without a directional table -
 * ladders need the same per-tile data one-way platforms do. */
static u8 platform_is_ladder(s16 tx, s16 ty)
{
    if (!platform_has_col_dir) return 0;
    return (platform_col_byte(tx, ty) & PLAT_COL_LADDER) ? 1 : 0;
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
// Perf note (found investigating a real, much bigger slowdown than
// col_solid's own - see [[snes-map-object-engine-investigation]] in
// memory): 816-tcc has no CSE, so `actors[j].field` repeated for several
// fields on the same j each independently re-derives the array element's
// address from scratch. A local pointer, taken once per iteration and
// dereferenced for every field after that, is the fix the user asked for
// here - table[i] used often in a loop should become a pointer to
// table[i], used after. Measured: this loop alone (called every frame
// during player movement, uncapped - see actor_try_move/Update_TopDown)
// accounted for the whole real-gameplay slowdown found in the sneshtml
// sample's Outside scene.
static u8 npc_blocking(u16 skip, s16 tx, s16 ty)
{
    u8 j;
    for (j = 0; j <= scene_num_actors && j < MAX_ACTORS; j++)
    {
        ACTOR *a = &actors[j];
        s16 jx, jy;
        if (j == skip) continue;
        if (!a->enabled) continue;
        if (!a->active) continue;
        if (!a->collisions_enabled) continue;
        jx = (a->x - 8) >> 3;
        jy = (a->y - 8) >> 3;
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
    if (col_solid_row2(tx, tx + 1, ty)) return 0;
    return 1;
}

// Perf: pointer, not index - table[i]-vs-pointer fix, see actor_on_tile above.
static void actor_face(ACTOR *a, s16 dx, s16 dy)
{
    a->dir_x = (s8)dx;
    a->dir_y = (s8)dy;
    // flip/tile for a directional sprite are derived from dir_x/dir_y fresh
    // every render call (see actor_render_tile in SceneRenderActors below),
    // not persisted here - matches the GB engine's own SceneRenderActor_b.
}

// Try to start a tile-aligned step. Sets actors[i].moving.
// Perf: a local pointer replaces every actors[i] re-index below (see the
// perf note on npc_blocking) - including SceneActorTileX/Y(i), which
// existed purely to re-derive actors[i].x/y through a real function call;
// with the pointer already in hand, computing tx/ty directly is both the
// table->pointer fix and two fewer function calls per move attempt.
static void actor_try_move(u16 i, s16 dx, s16 dy)
{
    ACTOR *a = &actors[i];
    actor_face(a, dx, dy);

    if (dx == 0 && dy == 0)
    {
        a->moving = 0;
        return;
    }

    // NOCLIP scripted move: bypass collision. Nested ifs, not `a && b && c`.
    if (actor_move_settings & ACTOR_NOCLIP)
    {
        if (i == script_actor && script_ptr)
        {
            a->moving = 1;
            if (i == 0) check_triggers = 1;
            return;
        }
    }

    if (a->collisions_enabled)
    {
        // Destination tile, computed once and shared by npc_blocking/can_step.
        s16 tx = ((a->x - 8) >> 3) + dx;
        s16 ty = ((a->y - 8) >> 3) + dy;
        if (npc_blocking(i, tx, ty) != 0xFF)
        {
            a->moving = 0;
            return;
        }
        if (!can_step(tx, ty))
        {
            a->moving = 0;
            return;
        }
    }

    if (i == 0) check_triggers = 1;
    a->moving = 1;
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
 * Scene blob (see SceneInit and compileSnesData.js's sceneBlobs builder -
 * this comment had drifted out of sync with both as fields were added on
 * top over time; re-derived from the real byte offsets, not assumed):
 *   [0] bg_index  [1] num_actors  [2] num_triggers  [3..4] scene_script_idx
 *   [5] width     [6] height      [7] scene_type (genre dispatch byte)
 *   [8..31]  (24 bytes) per-scene OBJ slot table: sprite_type[8],
 *            sprite_frames[8], sprite_pal[8]
 *   [32..37] (6 bytes) up to 3 banded parallax layers: {lines, shift} each
 *   [38..43] (6 bytes) On Player Hit script indices (collision group 1/2/3)
 *   actors   (19 bytes each): tile_x, tile_y, dir, movement_type,
 *                       sprite_idx, script_idx (2B), sprite_type, anim_speed,
 *                       animate, collision_group, hit1_idx (2B), hit2_idx (2B),
 *                       hit3_idx (2B), update_idx (2B)
 *   triggers (7 bytes each): tile_x, tile_y, w, h, type, script_idx (2B)
 *   collision bitmap: ceil(width * height / 8) bytes, row-major, bit set = solid
 *   (trailing, variable-length, appended in this order - see each one's own
 *   parsing comment below rather than fixed offsets here): M8.3's [40]
 *   extra-pose table, M9.4's [2*SPRITE_SLOTS] metasprite-frame table, then
 *   Adventure genre Option 1's [4] player collision-bounds bytes (left,
 *   right, top, bottom - signed, see scene.h's player_bounds_* comment),
 *   then the MUSIC_PLAY preload's [1] byte (0xff = none, see scene.h's
 *   scene_music_preload comment)
 *

 * Every *_idx/script_idx field is a 2-byte little-endian event_ptrs[] index
 * (v4 fix, user-found: "the triggers are not working when I press A" in a
 * real multi-scene project) - it's a project-wide index shared across every
 * scene's scripts, cumulatively growing as compileSnesData.js compiles scene
 * after scene, so it routinely exceeds 255 well before the last scene of a
 * real game. A 1-byte field silently wrapped mod 256, making a later scene's
 * actor/trigger/hit/update script reference a random wrong script - not
 * just triggers, every one of these fields shares the same index space.
 */

/* frames_len from the per-actor sprite_type + the sheet's frame count:
 * a 6-frame SPRITE_ACTOR_ANIMATED walks 2 poses per direction; a SPRITE_STATIC
 * sheet with 2-6 frames auto-cycles all of them (GB Studio's "animated" type -
 * a 2-frame duck, a 4-frame torch, ...); a 3-frame SPRITE_ACTOR and 1-frame
 * sheet are a single frame. */
u8 frames_len_for(u8 sprite_type, u8 slot)
{
    if (sprite_type == SPRITE_ACTOR_ANIMATED) return 2;
    if (sprite_type == SPRITE_STATIC)
    {
        /* M9.4 (SPRITE_EDITOR_PROGRESS.md): a Free-form (Metasprite) sheet's
         * "fixed" animationType has no 2-6 cap - its real frame count is
         * however many frames were authored, read straight from
         * sprite_frames_for_slot[] (compileSnesData.js already clamps it to
         * 255 there). Only ever true for a metaspriteMode slot - every
         * legacy sheet still falls through to the capped check below,
         * unchanged. */
        if (metasprite_frame_base[slot]) return sprite_frames_for_slot[slot];
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
    u16 scene_script_idx = s[3] | ((u16)s[4] << 8);
    u8 sc_size = SC_32x32;
    const unsigned char *p;
    u16 col_bytes;
    u16 j;
    u8 i;
    u16 mapLen; /* v4 safety clamp, see its own comment further down */
    u8 use_map_engine; /* v4, Map Engine streaming - see map_engine_active (scene.h) */

    scene_num_actors = s[1];
    scene_num_triggers = s[2];
    scene_width = s[5] ? s[5] : SCENE_TILE_W;
    scene_height = s[6] ? s[6] : SCENE_TILE_H;
    /* v2 M5a: new header byte, see states.h. Existing dummy fixtures/
     * gen-dummy-gfx.js were updated to emit it - this is the only consumer
     * of this exact byte layout today (compileSnesData.js doesn't exist on
     * this branch yet, see M7). */
    scene_type = s[7];
    p = s + 8;

    /* [32] per-scene OBJ slot table: sprite_type[8], sprite_frames[8],
     * sprite_pal[8], sprite_oam_ids[8] (M7 groundwork, see scene.h) -
     * see compileSnesData.js. */
    for (i = 0; i < SPRITE_SLOTS; i++)
    {
        sprite_type_for_slot[i] = p[i];
        sprite_frames_for_slot[i] = p[SPRITE_SLOTS + i];
        sprite_pal_for_slot[i] = p[2 * SPRITE_SLOTS + i];
        sprite_oam_ids_for_slot[i] = p[3 * SPRITE_SLOTS + i];
    }
    sprite_slot_for_index = scene_sprite_slot_ptrs[scene_index];
    p += 4 * SPRITE_SLOTS;

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

    /* Projectiles (v4, follow-up): [6] On Player Hit script indices
     * (collision group 1/2/3, 2 bytes each) - see compileSnesData.js's
     * playerHit1/2/3ScriptIdx and ProjectilesUpdate()'s own comment for how
     * they're picked. */
    player_hit_idx[0] = p[0] | ((u16)p[1] << 8);
    player_hit_idx[1] = p[2] | ((u16)p[3] << 8);
    player_hit_idx[2] = p[4] | ((u16)p[5] << 8);
    p += 6;

    /* v4 (Map Engine streaming, see the plan): a wide background routes to
     * PVSnesLib's own Map Engine instead of this engine's hand-rolled
     * SceneStreamBackground, UNLESS this scene also uses parallax - the two
     * real conflicts (mapUpdateCamera's own independent camera-centering
     * algorithm, and the Map Engine's BG1HOFS fine-scroll write colliding
     * with parallax's banded HDMA override of the same register) rule out
     * ever combining them. bg_mapdata_ptrs[bg_index] is only non-null for a
     * background compileSnesData.js decided needs streaming at all (same
     * w > 64 threshold as bg_fullmap_ptrs), so this is a strict superset of
     * today's branching - every scene that doesn't need streaming is
     * unaffected either way. parallax_active was just computed above. */
    use_map_engine = bg_mapdata_ptrs[bg_index] && !parallax_active;

    /* pick the tilemap size from the BG dimensions (one 2-term test per if) */
    if (bg_map_w[bg_index] > 32) sc_size = SC_64x64;
    if (bg_map_h[bg_index] > 32) sc_size = SC_64x64;

    /* v4 safety clamp: compileSnesData.js now emits a background's real,
     * unpadded tilemap (fixed 2026-09-20 - it used to hard-cap at 32x32,
     * silently truncating anything bigger with no VRAM risk). SC_64x64's
     * real VRAM budget is 8192 bytes (4096 words) - a background over
     * 64x64 tiles (e.g. a 255-tile-wide scrolling scene) now has more map
     * data than fits, and dmaCopyVram doesn't know where the BG1 tilemap
     * region ends: an unclamped copy would plow straight through BG3's
     * tilemap (0x7800+, see the fixed VRAM map below). Real horizontal
     * streaming (loading only a sliding 64-tile window and DMAing new
     * columns as the camera scrolls) is the intended fix for those scenes -
     * not done yet; until then, clamp to what SC_64x64 can safely hold so
     * the game only shows the top-left 64x64 corner instead of corrupting
     * VRAM. This only engages for scenes already beyond the compiler's own
     * 64x64 warning, so it's a silent no-op for every already-warned-about-
     * or-smaller scene. */
    mapLen = bg_maps_len[bg_index];
    if (mapLen > 8192) mapLen = 8192;

    /* Force blank for the (large) VRAM DMAs; setBrightness() restores it below,
     * or leaves it black if a fade-in is pending after a SWITCH_SCENE. */
    WaitForVBlank();
    setScreenOff();
    dmaCopyVram((u8 *)bg_tiles_ptrs[bg_index], BG1_GFX_VRAM, bg_tiles_len[bg_index]);
    if (!use_map_engine)
    {
        /* M7 (v4): a scene that painted TILE_PROP_PRIORITY tiles has its own
         * tilemap copy (scene_bg_map_ptrs[scene_index], real SNES BG_TIL_PRIO
         * bit set at those positions) - same length as the shared
         * bg_maps_ptrs[bg_index] it's derived from, just a different source.
         * Not available on the Map Engine path below - priority tiles aren't
         * supported there (see the plan's Phase 0d; neither real wide scene
         * in this project paints any, so this is a documented scope limit,
         * not a regression).
         *
         * v4 (user-asked): BG1's tilemap now lives at the SAME fixed VRAM
         * address (0x6800) whether or not this scene uses the Map Engine -
         * see the fixed VRAM map in game.c's own boot-time comment. Used to
         * be 0x0000 here specifically (switching address depending on
         * routing); unifying it removes that distinction entirely. */
        dmaCopyVram(
            (u8 *)(scene_bg_map_ptrs[scene_index] ? scene_bg_map_ptrs[scene_index] : bg_maps_ptrs[bg_index]),
            BG1_MAP_VRAM, mapLen);
    }
    SceneUploadBgPalette(bg_index);
    /* UI (BG3) palette -> CGRAM 16..19 (palette field 4), after the BG palette. */
    dmaCopyCGram((u8 *)ui_pal, 16, UI_PAL_SIZE);
    /* this scene's OBJ tile sheet (8 KB) + 8-palette CGRAM image (bakes in the
     * emote / avatar palettes at OBJ pal 1 / 2). v4: OBJ now lives at 0x0000
     * (was 0x4000) - see game.c's fixed VRAM map comment. */
    dmaCopyVram((u8 *)scene_spr_ptrs[scene_index], OBJ_GFX_VRAM, SPR_TILES_SIZE);
    dmaCopyCGram((u8 *)scene_spr_pal_ptrs[scene_index], 128, SPR_PAL_SIZE);

    if (use_map_engine)
    {
        /* PVSnesLib's Map Engine owns BG1's tilemap at its own fixed VRAM
         * address (0x6800 words - map.h's own documented address, "layer
         * address is: 6800 for Layer 1"); mapLoad DMAs the real tilemap +
         * metatile-definition tables itself. tilesprop is a single all-zero
         * shared blob - collision stays on this engine's own
         * col_solid()/scene_col[] bitmap, never the Map Engine's
         * tile-identity-keyed one (see the plan). Same address the non-Map-
         * Engine branch above now also uses - this bgSetMapPtr call is
         * technically redundant with the one below it, kept for clarity at
         * this specific call site (mapLoad immediately follows it). */
        bgSetMapPtr(0, BG1_MAP_VRAM, SC_64x32);
        mapLoad((u8 *)bg_mapdata_ptrs[bg_index], (u8 *)bg_metatiles_ptrs[bg_index],
                (u8 *)mapengine_tilesprop);
        stream_bg_index = 0xff;
    }
    else
    {
        bgSetMapPtr(0, BG1_MAP_VRAM, sc_size);

        /* Horizontal background streaming (v4): only a background wider than
         * the 64-tile VRAM window needs it - bg_fullmap_ptrs[bg_index] is a
         * real pointer exactly when compileSnesData.js decided that (0
         * otherwise, the common case). The initial DMA above already loaded
         * world columns 0-63 into VRAM columns 0-63 unchanged, so the window
         * starts at 0 with no extra work here. */
        if (bg_fullmap_ptrs[bg_index])
        {
            stream_bg_index = bg_index;
            stream_bg_w = bg_map_w[bg_index];
            stream_bg_h = bg_map_h[bg_index];
            stream_window_left = 0;
        }
        else
        {
            stream_bg_index = 0xff;
        }
    }
    bgSetGfxPtr(0, BG1_GFX_VRAM);
    map_engine_active = use_map_engine;

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
    actors[0].anim_state_offset = 0; /* this sheet's own default/implicit state */
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
        actors[i].sprite_type = p[7];
        actors[i].anim_speed = p[8];
        actors[i].animate = p[9];
        actors[i].frames_len = frames_len_for(p[7], p[4]);
        actors[i].anim_state_offset = 0; /* this sheet's own default/implicit state */
        actors[i].events_ptr = event_ptrs[p[5] | ((u16)p[6] << 8)];
        /* Projectiles (v4): [10]=collision_group, [11..16]=hit1/2/3_idx (2
         * bytes each) - see compileSnesData.js actorEntries and
         * gbs_types.h's ACTOR comment. */
        actors[i].collision_group = p[10];
        actors[i].hit1_idx = p[11] | ((u16)p[12] << 8);
        actors[i].hit2_idx = p[13] | ((u16)p[14] << 8);
        actors[i].hit3_idx = p[15] | ((u16)p[16] << 8);
        /* On Update subsystem (v4): [17..18]=update_idx (2 bytes). update_ctx
         * is runtime-only (which UPDATE_CTX pool slot owns this actor, or
         * UPDATE_CTX_NONE) - reset here so a previous scene's slot index
         * left over in this ACTOR struct entry (actors[] isn't cleared
         * between scenes) never gets misread as "already running"; the
         * actual pool reset + auto-launch happens in the loop below, once
         * every actor's update_idx is known. */
        actors[i].update_idx = p[17] | ((u16)p[18] << 8);
        actors[i].update_ctx = UPDATE_CTX_NONE;
        p += 19;
    }
    for (; i < MAX_ACTORS; i++)
    {
        actors[i].enabled = 0;
        actors[i].active = 0;
        actors[i].update_ctx = UPDATE_CTX_NONE;
        /* M9.4: no longer hides this slot's own OAM id here (i<<2) - that
         * only ever worked because EMOTE_OID/PROJECTILE_OID_BASE/AVATAR_OID
         * were fixed constants always placed right after MAX_ACTORS' worth
         * of ids. Now that those are real per-scene values (can be smaller
         * than MAX_ACTORS*4), a flat 0..MAX_ACTORS-1 sweep here could either
         * clobber a lower-numbered emote/projectile/avatar id before it's
         * even computed, or (just as bad) stop short of a stale id a
         * previous, bigger-cast scene left visible. See the single
         * actor_oam_total..hardware-ceiling sweep below instead, done once
         * real OIDs are known. */
    }

    /* M7 groundwork (SPRITE_EDITOR_PROGRESS.md) - real per-actor OAM id
     * base, a prefix sum over sprite_oam_ids_for_slot[] (just read above).
     * actors[i].frame_offset>>1 is this actor's sprite slot - same lookup
     * sprite_pal_for_slot[] already uses in SceneRenderActors.
     *
     * M8.3 correction (user-found: snesgbs2's Sample Town, 9 actors on
     * screen at once, rendered no sprites at all): this prefix sum used to
     * accumulate in units of 1 (`j += sprite_oam_ids_for_slot[...]`,
     * producing actor_oam_base[i] == i), on the theory that the pre-M7
     * `i << 2` spacing it replaced was "incidental" and "wasted" space, not
     * a real requirement. That was wrong - PVSnesLib's own oamSet/oamSetEx/
     * oamSetVisible asm (sprites.asm) takes `id` as a **byte offset** into
     * the real OAM shadow buffer (4 bytes/sprite: X, Y, tile, attr), not a
     * sprite index - oamSet's prologue does `tax` on the raw `id` then
     * `sta.l oamMemory+0,x` directly, and oamSetEx's `id >> 4` (to find the
     * packed-high-attribute-table byte, 4 sprites/byte) only lands on the
     * right byte when `id` is already `spriteIndex * 4`. Passing a plain
     * unscaled index made every actor's 4-byte OAM write overlap the next
     * one's, corrupting Y/tile/attr while leaving X (byte 0 of actor 0's
     * own slot, the only byte no other actor's write could reach) looking
     * fine in isolation - exactly the "nothing renders" symptom this fix
     * resolves. Every entry of sprite_oam_ids_for_slot[] is still 1 today
     * (nothing yet emits a real >1 OAM-entries-per-pose cost), so this now
     * computes exactly actor_oam_base[i] == i*4 - byte-for-byte equivalent
     * to the original pre-M7 `i << 2` scheme, restoring it without losing
     * the real per-slot-cost plumbing M7 built around it. */
    j = 0;
    for (i = 0; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        actor_oam_base[i] = j;
        j += (u16)sprite_oam_ids_for_slot[actors[i].frame_offset >> 1] << 2;
    }
    /* M9.4 (SPRITE_EDITOR_PROGRESS.md): real runtime OIDs, replacing the old
     * MAX_ACTORS-derived compile-time constants - see scene.h's own comment.
     * `j` here is this loop's own final running total: the real byte-offset
     * just past the last actor's OAM range THIS SCENE actually uses. Placed
     * back-to-back (emote, then the whole projectile pool, then avatar),
     * same tight scheme the old constants used, just computed instead of
     * hand-picked. Unlike the old fixed constants, these are now genuinely
     * scene-relative - a scene with fewer actors than MAX_ACTORS-1 gets
     * smaller values than the old 80/84/100, not the same ones (only a
     * scene using every one of the MAX_ACTORS-1 real actor slots would
     * land back on those exact old numbers). */
    actor_oam_total = j;
    emote_oid = actor_oam_total;
    projectile_oid_base = emote_oid + 4;
    avatar_oid = projectile_oid_base + ((u16)MAX_PROJECTILES << 2);

    /* Because these are now scene-relative, a scene switch from a
     * bigger-cast scene to a smaller one can leave a stale, still-visible
     * sprite stranded at an OAM id this scene's own actor_oam_total..
     * avatar_oid range no longer reaches (e.g. an avatar visible right as
     * SWITCH_SCENE fires, landing at a higher id than the new scene's own,
     * smaller avatar_oid). Sweep everything from this scene's own real
     * total through the full 128-sprite hardware ceiling unconditionally -
     * emote/projectile/avatar's own per-frame update routines immediately
     * re-establish the right state for whichever of those ids this scene
     * actually uses, same "hide now, let the owning subsystem redraw next
     * frame" reasoning the old per-actor-slot loop above already used. */
    for (j = actor_oam_total; j < ((u16)128 << 2); j += 4)
    {
        oamSetVisible(j, OBJ_HIDE);
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
        /* M8.3 correction: `+ (i << 2)`, not plain `+ i` - same byte-offset
         * fix as PROJECTILE_OID_BASE's own comment and actor_oam_base[]'s
         * prefix sum above (M7 mistakenly dropped this). Each projectile is
         * still exactly 1 real OAM entry. */
        oamSetVisible(projectile_oid_base + ((u16)i << 2), OBJ_HIDE);
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
        triggers[i].events_ptr = event_ptrs[p[5] | ((u16)p[6] << 8)];
        p += 7;
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
    p += col_bytes;

    /* M8.3: [40] extra-pose half-tile-base table - 5 arrays of SPRITE_SLOTS
     * bytes (down-B, up-A, up-B, side-A, side-B), appended after the
     * collision bitmap (whose own length is variable) - see
     * compileSnesData.js's own comment at this table's emission for why it
     * lives here instead of alongside the [32] sprite-slot table above. The
     * M9.4 metasprite-frame-data section (below) is now the real last thing
     * in the scene blob instead. */
    for (i = 0; i < SPRITE_SLOTS; i++)
    {
        extra_pose_down_b[i] = p[i];
        extra_pose_up_a[i] = p[SPRITE_SLOTS + i];
        extra_pose_up_b[i] = p[2 * SPRITE_SLOTS + i];
        extra_pose_side_a[i] = p[3 * SPRITE_SLOTS + i];
        extra_pose_side_b[i] = p[4 * SPRITE_SLOTS + i];
    }
    p += 5 * SPRITE_SLOTS;

    /* M9.4 (SPRITE_EDITOR_PROGRESS.md): [2*SPRITE_SLOTS] trailing per-slot
     * free-form metasprite frame data - see scene.h's own comment on
     * metasprite_frame_base and compileSnesData.js's emission. Self-skipping
     * (slotByteLen covers this slot's whole frameOffset table + entry data),
     * so no separate size bookkeeping is needed here - p always ends up
     * exactly past the end of the scene blob once this loop finishes. */
    for (i = 0; i < SPRITE_SLOTS; i++)
    {
        u16 slotByteLen = p[0] | ((u16)p[1] << 8);
        p += 2;
        metasprite_frame_base[i] = slotByteLen ? p : 0;
        p += slotByteLen;
    }

    /* Adventure genre, Option 1: [4] trailing player collision-bounds bytes
     * (left, right, top, bottom - signed, see scene.h's player_bounds_*
     * comment and compileSnesData.js's own emission). */
    player_bounds_left = (s8)p[0];
    player_bounds_right = (s8)p[1];
    player_bounds_top = (s8)p[2];
    player_bounds_bottom = (s8)p[3];
    p += 4;

    /* MUSIC_PLAY preload (v4, "Space Battle" fix): [1] trailing byte - see
     * scene.h's own comment on scene_music_preload and
     * compileSnesData.js's hoistSceneMusicPreload. */
    scene_music_preload = p[0];
    p += 1;

    /* Ladders / one-way platforms (Update_Platform): [1] has_col_dir flag,
     * the real last thing in the scene blob now, optionally followed by a
     * dir_bytes-long per-tile directional-collision table (see
     * platform_col_byte()'s own comment above and compileSnesData.js's
     * emission) - most scenes paint no COLLISION_TOP/BOTTOM/LEFT/RIGHT/
     * ladder tiles at all and skip straight past this with just the one
     * flag byte. */
    platform_has_col_dir = p[0];
    p += 1;
    if (platform_has_col_dir)
    {
        u16 dir_bytes = (u16)scene_width * scene_height;
        u16 k;
        if (dir_bytes > SCENE_COL_DIR_BYTES)
        {
            dir_bytes = SCENE_COL_DIR_BYTES;
        }
        for (k = 0; k < dir_bytes; k++)
        {
            scene_col_dir[k] = p[k];
        }
        p += (u16)scene_width * scene_height;
    }

    /* Named animation states (v4 follow-up): [1] has_anim_states flag, the
     * real last thing in the scene blob now - 0 (the overwhelming common
     * case: no metaspriteMode sheet in this scene authors any extra named
     * state beyond its own default) skips straight past this with just the
     * one flag byte. Otherwise, for each of the SPRITE_SLOTS slots: [1]
     * stateCount (0 = this slot's sheet has no extra states), then
     * stateCount * [frames_len(u8), spriteType(u8), byteOffset(u16)] -
     * byteOffset is relative to metasprite_frame_base[slot] (the exact
     * pointer a sheet's own default/implicit state - "state 0" - already
     * used before this feature existed), see
     * ACTOR_SET_ANIM_STATE/PLAYER_SET_ANIM_STATE (script_cmds.c) and
     * compileSnesData.js's own emission. */
    has_anim_states = p[0];
    p += 1;
    if (has_anim_states)
    {
        for (i = 0; i < SPRITE_SLOTS; i++)
        {
            anim_state_count[i] = p[0];
            p += 1;
            anim_state_dir[i] = anim_state_count[i] ? p : 0;
            p += (u16)anim_state_count[i] * 4;
        }
    }
    else
    {
        for (i = 0; i < SPRITE_SLOTS; i++)
        {
            anim_state_count[i] = 0;
            anim_state_dir[i] = 0;
        }
    }

    actor_move_settings = 0;
    check_triggers = 1;
    /* A fresh scene's own starting tile must always be re-checked, even if
     * it numerically matches wherever the player happened to last check a
     * trigger in the *previous* scene. */
    td_last_trigger_tx = -1;
    td_last_trigger_ty = -1;
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

    /* MUSIC_PLAY preload (v4, "Space Battle" fix) - see scene.h's own
     * comment on scene_music_preload. Called synchronously, right here,
     * specifically because nothing else is competing for CPU time yet at
     * this point: the screen is still force-blanked (scene_unblank_pending
     * above - the real unblank happens a whole frame later, in main()) and
     * no On-Update context has been stepped even once (UpdateScriptsProcess
     * only ever runs from SceneUpdate(), called from the main loop on a
     * later frame - ActorStartUpdate() above only registers contexts, it
     * never steps them). PVSnesLib's spcLoad/spcPlay (inside MusicPlay(),
     * prebuilt binary) take dramatically longer to complete the more CPU
     * load is running concurrently - confirmed badly enough, in a real
     * Shoot Em Up scene with many active On-Update contexts, to never
     * resolve at all if MUSIC_PLAY is left to run at its normal position in
     * the script instead. */
    if (scene_music_preload != 0xff)
    {
        MusicPlay(scene_music_preload);
    }

    run_script(event_ptrs[scene_script_idx], 0);
}

/* Horizontal background streaming (v4) - this hand-rolled path (and the
 * functions below it) is now only used by a wide scene that ALSO uses
 * parallax (map_engine_active is 0 for it - see SceneInit's routing
 * decision); every other wide scene streams through PVSnesLib's own Map
 * Engine instead (mapLoad/mapUpdate/mapVblank, map_engine_active = 1),
 * which this 816-tcc-compiled path can't match for CPU cost on the widest
 * scenes (see PERF.md). Kept, not deleted, because it's the only option
 * for a scene needing both streaming and parallax (the Map Engine's own
 * BG1HOFS write and parallax's banded HDMA override of the same register
 * can't coexist - see the Map Engine plan).
 *
 * BgMapWordOffset mirrors compileSnesData.js's mapByteIndex exactly (word
 * units here, that function returns bytes - dmaCopyVram's own destination
 * argument is a word address, matching every other call in SceneInit
 * above) - the same real SC_64x64 four-screen VRAM layout (see that
 * function's own comment). col/row are always < 64 here (streaming only
 * ever touches the loaded window), so no bounds check is needed the way
 * the JS version has one. */
static u16 BgMapWordOffset(u8 col, u8 row)
{
    u8 qx = (col >= 32) ? 1 : 0;
    u8 qy = (row >= 32) ? 1 : 0;
    u8 lx = col - (qx << 5);
    u8 ly = row - (qy << 5);
    return ((u16)(qy * 2 + qx) << 10) + ((u16)ly << 5) + lx;
}

/* Streams one world column's worth of tile data (every row, up to the
 * background's real height or 64, whichever is smaller) from the full ROM
 * tilemap (bg_fullmap_ptrs) into the VRAM ring-buffer slot worldCol&63 -
 * see stream_window_left's own comment for the addressing scheme. One
 * dmaCopyVram per row (2 bytes each): a background's real tile data isn't
 * contiguous column-to-column in either the ROM source (row-major, w
 * apart) or the VRAM destination (quadrant-shaped, 32 or 64 words apart
 * depending on row) - see PERF.md for the CPU-budget context this was
 * verified against. */
static void StreamColumn(u16 worldCol)
{
    u8 vramCol = (u8)(worldCol & 63);
    u8 maxRow = (stream_bg_h < 64) ? stream_bg_h : 64;
    u8 row;
    const u8 *full = bg_fullmap_ptrs[stream_bg_index];
    for (row = 0; row < maxRow; row++)
    {
        u16 srcIdx = ((u16)row * stream_bg_w + worldCol) * 2;
        /* BgMapWordOffset is a pure in-window offset (0-based, mirroring
         * compileSnesData.js's own mapByteIndex, which has no notion of a
         * VRAM base either) - BG1_MAP_VRAM must be added here explicitly.
         * v4 (user-asked VRAM unification): this used to be a no-op (base
         * 0x0000) while this streaming path's own SceneInit DMA also used
         * 0x0000 - now that BG1's tilemap lives at a fixed BG1_MAP_VRAM
         * (0x6800) regardless of routing, forgetting this base here would
         * have silently streamed columns into OBJ's new graphics region at
         * the bottom of VRAM instead of the actual tilemap. */
        u16 dstWord = BG1_MAP_VRAM + BgMapWordOffset(vramCol, row);
        dmaCopyVram((u8 *)(full + srcIdx), dstWord, 2);
    }
}

/* Streams at most STREAM_MAX_COLUMNS_PER_FRAME columns per call - caps the
 * worst case (a scripted teleport/SWITCH_SCENE-style jump far from the
 * loaded window, or a single very fast frame) so one frame's vblank can't
 * be blown by an unbounded catch-up; the window just catches up over the
 * next few frames instead; ordinary walking speed never gets close to this
 * limit (see the plan's own Mesen verification). */
#define STREAM_MAX_COLUMNS_PER_FRAME 4
void SceneStreamBackground(void)
{
    s16 target_col;
    u8 n;

    if (stream_bg_index == 0xff) return;

    target_col = (s16)(scroll_x >> 3);
    if (target_col < 0) target_col = 0;
    if (target_col > (s16)(stream_bg_w - 64)) target_col = (s16)(stream_bg_w - 64);

    n = STREAM_MAX_COLUMNS_PER_FRAME;
    while ((u16)target_col > stream_window_left && n)
    {
        /* window slides right by 1: world column (stream_window_left+64)
         * becomes newly visible on the right edge, reusing the VRAM slot
         * world column stream_window_left just vacated on the left. */
        StreamColumn(stream_window_left + 64);
        stream_window_left++;
        n--;
    }
    n = STREAM_MAX_COLUMNS_PER_FRAME;
    while ((u16)target_col < stream_window_left && n)
    {
        /* window slides left by 1: symmetric case, world column
         * (stream_window_left-1) becomes newly visible on the left edge. */
        stream_window_left--;
        StreamColumn(stream_window_left);
        n--;
    }
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
            actor_face(&actors[i], -actors[0].dir_x, -actors[0].dir_y);
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
// Perf: a local pointer replaces every actors[0] re-index below, same as
// actor_try_move/npc_blocking - including the two SceneActorTileX/Y(0)
// calls, which existed purely to re-derive actors[0].x/y through a real
// function call each. This runs every single frame the player holds a
// direction, uncapped (unlike NPC AI's own 1-in-64-frame throttling) - see
// [[snes-map-object-engine-investigation]] in memory for the measured cost.
void Update_TopDown(void)
{
    ACTOR *player = &actors[0];
    s16 tile_x = (player->x - 8) >> 3;
    s16 tile_y = (player->y - 8) >> 3;
    s8 dx = 0, dy = 0;

    if (topdown_move_pending)
    {
        // Second 8px leg of a 16px move already validated as clear below.
        topdown_move_pending = 0;
        actor_try_move(0, topdown_move_dx, topdown_move_dy);
        return;
    }

    if ((joy & INPUT_TOPDOWN_INTERACT) && !(prev_joy & INPUT_TOPDOWN_INTERACT))
    {
        SceneTryInteract();
        if (script_ptr)
        {
            player->moving = 0;
            return;
        }
    }

    if (joy & KEY_LEFT)       dx = -1;
    else if (joy & KEY_RIGHT) dx = 1;
    else if (joy & KEY_UP)    dy = -1;
    else if (joy & KEY_DOWN)  dy = 1;

    if (!dx && !dy)
    {
        player->moving = 0;
        return;
    }

    if (topdown_grid == 16)
    {
        s16 destTx = tile_x + 2 * dx;
        s16 destTy = tile_y + 2 * dy;
        if (npc_blocking(0, destTx, destTy) != 0xFF || !can_step(destTx, destTy))
        {
            player->moving = 0;
            return;
        }
        actor_try_move(0, dx, dy);
        if (player->moving)
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

// Adventure genre, Option 1 (box-sweep collision + real diagonal trig,
// replacing the old integer "alternate one axis per frame" diagonal
// approximation and the old single-point collision test - see CLAUDE.md).
// Sub-pixel remainder accumulators for the real trig delta below - each
// holds a running sum of raw (unshifted) sine_wave[angle]*move_speed
// products, with the final /128 (>>7, same divisor GB's own
// point_translate_angle uses) applied once per frame when extracting that
// frame's whole-pixel delta, not before accumulating (see Update_Adventure's
// own comment on why the order matters: shifting first truncates to exactly
// 0 at the player's default move_speed of 1, for every angle, forever).
// Local to this genre only - actors[0].x/y themselves stay plain whole-pixel
// ints, read by every other system (rendering/scripts/triggers/save data)
// unchanged.
static s16 adv_frac_x = 0;
static s16 adv_frac_y = 0;

// Real sine table, ported verbatim from GB Studio 3.2.1's own
// appData/src/gb/src/core/math.c (int8_t sine_wave[256], amplitude ~127).
// Adventure only ever selects one of the 8 angles 32 apart (0/45/.../315 in
// this table's 256-units-per-turn scale), so no general SIN/COS macro layer
// is added - the two call sites below index this table directly (COS(a) is
// GB's own sine_wave[a+64] phase shift).
static const s8 sine_wave[256] = {
       0,   3,   6,   9,  12,  16,  19,  22,  25,  28,  31,  34,  37,  40,  43,  46,
      49,  51,  54,  57,  60,  63,  65,  68,  71,  73,  76,  78,  81,  83,  85,  88,
      90,  92,  94,  96,  98, 100, 102, 104, 106, 107, 109, 111, 112, 113, 115, 116,
     117, 118, 120, 121, 122, 122, 123, 124, 125, 125, 126, 126, 126, 127, 127, 127,
     127, 127, 127, 127, 126, 126, 126, 125, 125, 124, 123, 122, 122, 121, 120, 118,
     117, 116, 115, 113, 112, 111, 109, 107, 106, 104, 102, 100,  98,  96,  94,  92,
      90,  88,  85,  83,  81,  78,  76,  73,  71,  68,  65,  63,  60,  57,  54,  51,
      49,  46,  43,  40,  37,  34,  31,  28,  25,  22,  19,  16,  12,   9,   6,   3,
       0,  -3,  -6,  -9, -12, -16, -19, -22, -25, -28, -31, -34, -37, -40, -43, -46,
     -49, -51, -54, -57, -60, -63, -65, -68, -71, -73, -76, -78, -81, -83, -85, -88,
     -90, -92, -94, -96, -98,-100,-102,-104,-106,-107,-109,-111,-112,-113,-115,-116,
    -117,-118,-120,-121,-122,-122,-123,-124,-125,-125,-126,-126,-126,-127,-127,-127,
    -127,-127,-127,-127,-126,-126,-126,-125,-125,-124,-123,-122,-122,-121,-120,-118,
    -117,-116,-115,-113,-112,-111,-109,-107,-106,-104,-102,-100, -98, -96, -94, -92,
     -90, -88, -85, -83, -81, -78, -76, -73, -71, -68, -65, -63, -60, -57, -54, -51,
     -49, -46, -43, -40, -37, -34, -31, -28, -25, -22, -19, -16, -12,  -9,  -6,  -3
};
#define ADV_ANGLE_0    0
#define ADV_ANGLE_45   32
#define ADV_ANGLE_90   64
#define ADV_ANGLE_135  96
#define ADV_ANGLE_180  128
#define ADV_ANGLE_225  160
#define ADV_ANGLE_270  192
#define ADV_ANGLE_315  224

// Sweeps the player's collision box's leading X edge (right if moving_right,
// left otherwise) across every tile row the box's top..bottom spans at
// tile_row0..tile_row1 (inclusive), testing this engine's existing flat
// col_solid() - deliberately NOT GB's own directional COLLISION_LEFT/RIGHT
// flags (Option 1's whole point, see CLAUDE.md: a solid tile blocks from
// every direction here, same simplification Platformer's own collision
// already documents). If any swept tile is solid, snaps candidate_x to sit
// exactly one pixel short of it instead of cancelling the whole step - this
// is what makes the sweep smoother than the point test it replaces (a fast
// approach still advances right up to the wall, not stopping a whole tile
// early). One condition per `if` throughout (816-tcc mis-links longer
// boolean chains - this file's own established rule).
static s16 adv_sweep_x(s16 candidate_x, s16 tile_row0, s16 tile_row1, u8 moving_right)
{
    s16 ty;
    if (moving_right)
    {
        s16 tile_x = (candidate_x + player_bounds_right) >> 3;
        for (ty = tile_row0; ty <= tile_row1; ty++)
        {
            if (col_solid(tile_x, ty))
            {
                return (tile_x << 3) - player_bounds_right - 1;
            }
        }
    }
    else
    {
        s16 tile_x = (candidate_x + player_bounds_left) >> 3;
        for (ty = tile_row0; ty <= tile_row1; ty++)
        {
            if (col_solid(tile_x, ty))
            {
                return ((tile_x + 1) << 3) - player_bounds_left + 1;
            }
        }
    }
    return candidate_x;
}

// Same shape as adv_sweep_x, for the player's leading Y edge (bottom if
// moving_down, top otherwise) across tile_col0..tile_col1.
static s16 adv_sweep_y(s16 candidate_y, s16 tile_col0, s16 tile_col1, u8 moving_down)
{
    s16 tx;
    if (moving_down)
    {
        s16 tile_y = (candidate_y + player_bounds_bottom) >> 3;
        for (tx = tile_col0; tx <= tile_col1; tx++)
        {
            if (col_solid(tx, tile_y))
            {
                return (tile_y << 3) - player_bounds_bottom - 1;
            }
        }
    }
    else
    {
        s16 tile_y = (candidate_y + player_bounds_top) >> 3;
        for (tx = tile_col0; tx <= tile_col1; tx++)
        {
            if (col_solid(tx, tile_y))
            {
                return ((tile_y + 1) << 3) - player_bounds_top + 1;
            }
        }
    }
    return candidate_y;
}

#define ADVENTURE_CAMERA_DEADZONE 8

void Start_Adventure(void)
{
    // Guaranteed not to match any real tile, so the very first check on
    // scene entry always runs fresh rather than being suppressed by a
    // stale tile pair left over from whatever scene/genre ran before.
    adv_last_trigger_tx = -1;
    adv_last_trigger_ty = -1;

    // Sub-pixel diagonal-movement remainder (see its own comment above) -
    // .bss isn't pre-zeroed on this toolchain, and a stale remainder
    // carried in from whatever scene/genre ran before would bias the first
    // frame or two of movement in a new scene.
    adv_frac_x = 0;
    adv_frac_y = 0;

    // GB's own Start_Adventure sets an 8px camera deadzone - ported for
    // real (v4), same value both axes.
    camera_deadzone_x = ADVENTURE_CAMERA_DEADZONE;
    camera_deadzone_y = ADVENTURE_CAMERA_DEADZONE;
    camera_offset_x = 0;
    camera_offset_y = 0;
}

// Adventure genre, Option 1 (box-sweep collision + real diagonal trig).
// GB Studio 3.2.1's real adventure_update (gb-studio-3.2.1/appData/src/gb/
// src/states/adventure.c) was read directly and ported: real 8-angle
// selection + sine-table trig for diagonal movement (adv_frac_x/y above),
// and a real box-sweep (adv_sweep_x/y above) against the player's own
// authored collision bounds (player_bounds_*, from the SpriteSheet's
// boundsX/Y/Width/Height - compileSnesData.js) instead of a single
// direction-biased point test. The one deliberate deviation from GB's real
// code: GB's sweep tests a specific COLLISION_LEFT/RIGHT/TOP/BOTTOM flag on
// the tile ahead; this engine's collision bitmap has no directional bits
// (established since M4c, same simplification Platformer's own collision
// already documents), so the sweep tests the existing flat col_solid()
// instead - the sweep *shape* is GB-accurate, what counts as "blocked"
// stays this fork's existing rule. See CLAUDE.md for the full writeup.
void Update_Adventure(void)
{
    s16 tile_x, tile_y;
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
    // this engine). dir_x/dir_y are now purely facing/input-intent - the
    // box-sweep below is what actually blocks movement, so (unlike the old
    // point-test version) nothing here ever needs to zero or restore them
    // for collision reasons.
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

    // Matches GB's real behaviour, not a bug: `moving` (and so the walk
    // animation) reflects whether a direction is held, independent of
    // whether the sweep below actually produces any displacement - pushing
    // against a wall still plays the walk animation, it just doesn't move.
    if (actors[0].moving)
    {
        u8 angle;
        s16 dx, dy;

        if (actors[0].dir_x < 0)
        {
            if (actors[0].dir_y < 0) angle = ADV_ANGLE_315;
            else if (actors[0].dir_y > 0) angle = ADV_ANGLE_225;
            else angle = ADV_ANGLE_270;
        }
        else if (actors[0].dir_x > 0)
        {
            if (actors[0].dir_y < 0) angle = ADV_ANGLE_45;
            else if (actors[0].dir_y > 0) angle = ADV_ANGLE_135;
            else angle = ADV_ANGLE_90;
        }
        else if (actors[0].dir_y < 0)
        {
            angle = ADV_ANGLE_0;
        }
        else
        {
            angle = ADV_ANGLE_180;
        }

        // Real sub-pixel trig (GB's point_translate_angle: pos.x +=
        // (SIN(angle)*speed)>>7, pos.y -= (COS(angle)*speed)>>7, COS(a) ==
        // sine_wave[a+64]) - but GB applies that >>7 directly to a position
        // already kept in 1/16px fixed point; this engine's move_speed is
        // calibrated in whole pixels/frame instead (0/1/2/4/8 -
        // MOVEMENT_SPEED_LOOKUP), a different scale GB's own formula was
        // never calibrated for. Applying GB's >>7 up front, every frame,
        // before accumulating would truncate to exactly 0 at the player's
        // default move_speed of 1 for every angle (max |sine_wave| is 127,
        // always < 128) - forever, not just occasionally - reintroducing
        // the exact freeze this accumulator exists to prevent. Fixed by
        // accumulating the raw, unshifted sine*speed product instead and
        // only applying >>7 once, here, when extracting this frame's whole-
        // pixel delta - mathematically the same single /128 GB's own
        // formula performs, just deferred until after summing instead of
        // applied (and the remainder discarded) every single frame.
        // Arithmetic right-shift on a signed value floors correctly for a
        // negative remainder too, so no special-casing is needed here.
        adv_frac_x += (s16)sine_wave[angle] * actors[0].move_speed;
        adv_frac_y -= (s16)sine_wave[(u8)(angle + 64)] * actors[0].move_speed;
        dx = adv_frac_x >> 7;
        dy = adv_frac_y >> 7;
        adv_frac_x -= dx << 7;
        adv_frac_y -= dy << 7;

        // Step X then Step Y, in that order, matching GB's real code: Step
        // Y's own column sweep uses actors[0].x *after* Step X has already
        // written it, not the pre-move value.
        if (dx != 0)
        {
            s16 tile_row0 = (actors[0].y + player_bounds_top) >> 3;
            s16 tile_row1 = (actors[0].y + player_bounds_bottom) >> 3;
            actors[0].x = adv_sweep_x(actors[0].x + dx, tile_row0, tile_row1, dx > 0);
        }
        if (dy != 0)
        {
            s16 tile_col0 = (actors[0].x + player_bounds_left) >> 3;
            s16 tile_col1 = (actors[0].x + player_bounds_right) >> 3;
            actors[0].y = adv_sweep_y(actors[0].y + dy, tile_col0, tile_col1, dy > 0);
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
    // genre from SceneUpdate() rather than inline here (Adventure's own box
    // sweep above is terrain-only and never blocks the player from
    // overlapping an actor, so this is the only place that damage can be
    // detected).
}

/* v2 M5d: Platformer genre pair (states.h) - the real work per the M4
 * audit: fixed-point physics (walk/run acceleration+deceleration, gravity,
 * variable-height jump) built fresh, not a Top Down/Adventure variant.
 *
 * Ladders and directional per-tile collision (GB's TILE_PROP_LADDER and
 * COLLISION_LEFT/RIGHT/TOP/BOTTOM - e.g. one-way platforms) shipped later
 * (v4 follow-up) - see platform_col_byte()/platform_has_col_dir/
 * scene_col_dir above and compileSnesData.js's own colDirBytes comment.
 * col_solid()/scene_col[] themselves are still a flat 1-bit solid/not-solid
 * bitmap, used unchanged by every other genre - this is a second, optional
 * per-tile table Update_Platform alone consults when a scene actually
 * paints a one-way platform/ladder tile.
 *
 * Deliberately NOT ported (documented, not half-invented):
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
/* Ladders (v4). Only ever set/consulted when the current scene has a real
 * directional-collision table (platform_has_col_dir) - see
 * platform_is_ladder()'s own comment above. */
static u8 plat_on_ladder = 0;

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

    // Ladders (v4): if the scene starts the player standing on a ladder
    // tile, snap onto it immediately - mirrors GB's own platform_init
    // (checks the tile the player starts on, simplified from GB's "tile
    // just above the start position" check: this engine's own feet-row
    // convention already matches what Update_Platform's own ladder grab
    // checks use, see below).
    if (platform_is_ladder((actors[0].x) >> 3, (actors[0].y - 1) >> 3))
    {
        s16 ladder_tx = (actors[0].x) >> 3;
        plat_x = ((ladder_tx << 3) + 4) << 4;
        plat_on_ladder = 1;
    }
    else
    {
        plat_on_ladder = 0;
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

    if (plat_on_ladder)
    {
        // Ladders (v4): a scoped-down port of GB's own on_ladder branch in
        // platform.c - no slopes (this engine has none - see consts.js'
        // own TILE_PROP_PRIORITY comment), and LEFT/RIGHT always let go of
        // the ladder immediately rather than GB's own "only if the tile
        // you'd step into isn't itself a wall" check (a deliberate
        // simplification: if it is a wall, next frame's own normal wall
        // collision below stops the player right at it anyway - same end
        // position, just reached a frame later via the ordinary path
        // instead of a dedicated pre-check).
        px = plat_x >> 4;
        py = plat_y >> 4;
        plat_vel_x = 0;
        plat_vel_y = 0;
        actors[0].animate = 0;
        if (joy & KEY_UP)
        {
            if (platform_is_ladder(px >> 3, (py - 1) >> 3))
            {
                plat_vel_y = -plat_climb_vel;
            }
        }
        else if (joy & KEY_DOWN)
        {
            if (platform_is_ladder(px >> 3, py >> 3))
            {
                plat_vel_y = plat_climb_vel;
            }
        }
        else if (joy & KEY_LEFT)
        {
            plat_on_ladder = 0;
            actors[0].dir_x = -1;
        }
        else if (joy & KEY_RIGHT)
        {
            plat_on_ladder = 0;
            actors[0].dir_x = 1;
        }
        plat_y += plat_vel_y >> 8;
        py = plat_y >> 4;
        // Climbed off the top/bottom of the ladder's own run of tiles -
        // let go so normal gravity/ground collision takes over again.
        if (plat_on_ladder)
        {
            if (!platform_is_ladder(px >> 3, (py - 1) >> 3))
            {
                if (!platform_is_ladder(px >> 3, py >> 3))
                {
                    plat_on_ladder = 0;
                }
            }
        }
        plat_grounded = 0;
    }
    else
    {
        if (joy & KEY_LEFT)
        {
            actors[0].dir_x = -1;
            if (joy & INPUT_PLATFORM_RUN)
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
            if (joy & INPUT_PLATFORM_RUN)
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

        if (plat_grounded && (joy & INPUT_PLATFORM_INTERACT) && !(prev_joy & INPUT_PLATFORM_INTERACT))
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

        // Ladders (v4): grab on a fresh UP/DOWN press, checked from the
        // player's current centre column - mirrors GB's own grab checks in
        // platform.c (its own "Vertical Movement" block), simplified to
        // this engine's own px-is-centre convention (no half-width offset
        // needed - see platform_is_ladder()'s own callers). Takes effect
        // next frame (the branch above is only entered once per frame,
        // same as GB's own on_ladder flag) - the player keeps falling/
        // sliding under gravity for this one frame, exactly like GB.
        if (joy & KEY_UP)
        {
            if (platform_is_ladder(px >> 3, (py - 1) >> 3))
            {
                plat_on_ladder = 1;
                plat_vel_x = 0;
                px = ((px >> 3) << 3) + 4;
                plat_x = px << 4;
            }
        }
        else if (joy & KEY_DOWN)
        {
            if (platform_is_ladder(px >> 3, py >> 3))
            {
                plat_on_ladder = 1;
                plat_vel_x = 0;
                px = ((px >> 3) << 3) + 4;
                plat_x = px << 4;
            }
        }

        if ((joy & INPUT_PLATFORM_JUMP) && !(prev_joy & INPUT_PLATFORM_JUMP) && plat_grounded)
        {
            plat_vel_y = -plat_jump_vel;
            plat_grounded = 0;
        }

        if (joy & INPUT_PLATFORM_JUMP)
        {
            if (plat_vel_y < 0) plat_vel_y += plat_hold_grav;
            else plat_vel_y += plat_grav;
        }
        else
        {
            plat_vel_y += plat_grav;
        }
        if (plat_vel_y > plat_max_fall_vel) plat_vel_y = plat_max_fall_vel;

        {
            // old_py (before this frame's own Y movement) - needed below
            // to tell a genuine "falling onto a one-way platform from
            // above" apart from "already at/past its row, arrived from
            // below" (see the TOP-collision check's own comment).
            s16 old_py = plat_y >> 4;
            plat_y += plat_vel_y >> 8;
            px = plat_x >> 4;
            py = plat_y >> 4;

        // Wall collision - the sprite's leading vertical edge against the
        // tile column it would newly enter, checked at both the feet row
        // and the head row (this engine's sprite is a real 16px tall,
        // unlike GB's own ~8px physics-body convention here - see the
        // function-group comment). A tile only blocks sideways entry from
        // the side it was painted to (PLAT_COL_RIGHT stops entry from the
        // right i.e. moving left into it, PLAT_COL_LEFT the mirror) -
        // falls back to the old flat col_solid() rule when this scene has
        // no directional-collision table, so every existing project is
        // unaffected (see platform_blocks()'s own comment).
        if (plat_vel_x < 0)
        {
            s16 col = (px - 8) >> 3;
            if (platform_blocks(col, (py - 1) >> 3, PLAT_COL_RIGHT) || platform_blocks(col, (py - 16) >> 3, PLAT_COL_RIGHT))
            {
                plat_vel_x = 0;
                px = ((col + 1) << 3) + 8;
                plat_x = px << 4;
            }
        }
        else if (plat_vel_x > 0)
        {
            s16 col = (px + 7) >> 3;
            if (platform_blocks(col, (py - 1) >> 3, PLAT_COL_LEFT) || platform_blocks(col, (py - 16) >> 3, PLAT_COL_LEFT))
            {
                plat_vel_x = 0;
                px = (col << 3) - 8;
                plat_x = px << 4;
            }
        }

        // Ground / ceiling collision - the sprite's leading horizontal edge
        // (feet falling, head rising) against both columns it spans. A
        // one-way platform (PLAT_COL_TOP only, no LEFT/RIGHT/BOTTOM) is
        // solid to land on but never blocks rising through it from below -
        // the classic "jump up through, stand on top" platform.
        if (plat_vel_y >= 0)
        {
            s16 row = py >> 3;
            s16 col_l = (px - 8) >> 3;
            s16 col_r = (px + 7) >> 3;
            // Real bug found by Mesen A/B (a no-platform negative control
            // reached a materially higher true apex than the with-platform
            // run): checking only the *current* row/velocity sign means a
            // jump whose apex happens to land inside (or just past) a
            // one-way platform's own row, on the exact frame gravity flips
            // plat_vel_y non-negative, gets caught as if landing on it -
            // even though the player arrived from *below*, never fell onto
            // it from above. old_py (captured before this frame's own Y
            // movement) tells the two apart: only a player who was at or
            // above the tile's own top edge last frame can be landing on
            // it now - one already below/inside it (climbing up into it)
            // must keep rising through, untouched.
            if (old_py <= (row << 3))
            {
                if (platform_blocks_row2(col_l, col_r, row, PLAT_COL_TOP))
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
                plat_grounded = 0;
            }
        }
        else
        {
            s16 row = (py - 16) >> 3;
            s16 col_l = (px - 8) >> 3;
            s16 col_r = (px + 7) >> 3;
            if (platform_blocks_row2(col_l, col_r, row, PLAT_COL_BOTTOM))
            {
                plat_vel_y = 0;
                py = ((row + 1) << 3) + 16;
                plat_y = py << 4;
            }
        }
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
    {
        // User-found: a walk trigger whose own script gates on `IF_INPUT
        // up` (the common GB Studio "walk up to a door, press Up to
        // enter" pattern - this engine's dedup below only re-runs
        // SceneActivateTriggerAt when the player's tile actually changes,
        // so a player who reaches the door tile without already holding
        // Up (or who stops on it first) can never retrigger it while
        // standing still - tile_x/tile_y never change again once they've
        // stopped. Confirmed this is a real, intentional GB Studio
        // mechanism, not a bug in the author's script: GB's own real
        // platform.c calls the equivalent `trigger_activate_at_intersection(
        // ..., INPUT_UP_PRESSED)` - the third "force" argument bypasses its
        // own "don't reactivate the same trigger" dedup specifically on a
        // fresh Up press, for exactly this case. Mirrored here the same
        // way: a fresh (edge-triggered, not held) Up press forces a
        // recheck even on the same tile as last frame.
        u8 force_trigger = (u8)((joy & KEY_UP) && !(prev_joy & KEY_UP));
        if (force_trigger || tile_x != plat_last_trigger_tx || tile_y != plat_last_trigger_ty)
        {
            plat_last_trigger_tx = tile_x;
            plat_last_trigger_ty = tile_y;
            SceneActivateTriggerAt(tile_x, tile_y);
        }
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
 * Collision uses a narrow, direction-biased single-point test - the same
 * shape Adventure's own collision test used to use, before Adventure was
 * upgraded to a real box-sweep against the player's own authored collision
 * bounds (Option 1, see Update_Adventure's own comment) - rather than GB's
 * own per-direction pixel biases (which differ oddly by direction there -
 * e.g. a 2-tile look-ahead on one side, none on the other, tuned to GB's
 * own hitbox convention this engine doesn't share) - consistent with this
 * engine's own established style, not a guess at GB's exact intent. Shmup
 * was never revisited when Adventure was upgraded - its own perpendicular-
 * dodge check is a different enough shape (lateral dodge, not forward
 * movement) that the two were never sharing code, only the same idea.
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
 *
 * v4 follow-up #4 (user-found: "scrolling is really slow" in a real Shmup
 * scene). The field's default (1) and max (8) were ported from GB's own
 * engine.json unchanged - but GB's shooter_scroll_speed feeds
 * point_translate_dir() against PLAYER.pos, which GB stores in 16.4
 * fixed-point (1 real pixel = 16 units) - so GB's default of 16 is actually
 * exactly 1 real pixel/frame, not 16. This engine's actors[].x/y are plain
 * whole pixels (no fixed-point anywhere in this port), and the line below
 * adds shooter_scroll_speed directly - so porting GB's raw field numbers
 * unchanged left the real default at 1 whole pixel/frame (60px/s), when GB's
 * actual equivalent is also ~1px/frame - already correct by coincidence of
 * the units GB happens to use 16 for. The reported "really slow" was
 * real and reproduced (confirmed in Mesen: Update_Shmup runs at a true 1:1
 * per-frame rate against a normally-sized background, and each call that
 * scrolls adds exactly shooter_scroll_speed whole pixels - no hidden
 * half-rate or compiler-miscompile cause, this is genuinely just "1px/frame
 * feels too slow for a forced-scroll shooter"). Bumped default to 2
 * (~120px/s) - a modest, reasoned correction, not a GB-matching one (a
 * mechanical first attempt at 16 - copying GB's raw number - was tried and
 * reverted once this unit mismatch was found: 16 whole pixels/frame is
 * 960px/s, unreasonably fast). max left well above default (8) for a
 * project that wants a faster scroll. This is a feel/pacing call this
 * session can't verify by eye (no rendered output here, only WRAM reads) -
 * revisit by eye/playtest if 2 still isn't right.
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
        // Nested ifs, not a 3-term `a && b && c` chain: see the actor_on_tile
        // comment - 816-tcc mis-links the false-branch target of a 3+-term
        // &&/|| chain in a conditional, which here made the player's
        // perpendicular dodge movement silently never trigger (user-found:
        // "player can't move" in a Shmup scene).
        u8 can_up = 0;
        u8 can_down = 0;
        if (joy & KEY_UP)
        {
            if (actors[0].y > 8)
            {
                if (!col_solid(body_col, ((actors[0].y - 1) - 1) >> 3))
                {
                    can_up = 1;
                }
            }
        }
        if (joy & KEY_DOWN)
        {
            if (actors[0].y < ((s16)scene_height << 3))
            {
                if (!col_solid(body_col, ((actors[0].y + 1) - 1) >> 3))
                {
                    can_down = 1;
                }
            }
        }

        if (can_up)
        {
            actors[0].dir_y = -1;
            actors[0].dir_x = 0;
        }
        else if (can_down)
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
        // Same 3-term-chain fix as the horizontal branch above.
        u8 can_left = 0;
        u8 can_right = 0;
        if (joy & KEY_LEFT)
        {
            if (actors[0].x > 8)
            {
                if (!col_solid(((actors[0].x - 1) - 8) >> 3, body_row))
                {
                    can_left = 1;
                }
            }
        }
        if (joy & KEY_RIGHT)
        {
            if (actors[0].x < ((s16)scene_width << 3))
            {
                if (!col_solid(((actors[0].x + 1) + 7) >> 3, body_row))
                {
                    can_right = 1;
                }
            }
        }

        if (can_left)
        {
            actors[0].dir_x = -1;
            actors[0].dir_y = 0;
        }
        else if (can_right)
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
        if (!actor_on_tile(&actors[0]))
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
// checked tile) - this engine's two callers below both now do that same
// tile-compare (Top Down via td_last_trigger_tx/ty, added v4 as a perf fix;
// Adventure via adv_last_trigger_tx/ty, already had it) on top of their own
// separate per-genre gating, rather than being merged into one call site -
// see SceneCheckTriggers's own comment for why Top Down needed the
// tile-compare added.
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
    if (!actor_on_tile(&actors[0])) return;

    tx = SceneActorTileX(0);
    ty = SceneActorTileY(0);

    // v4 perf fix (user-found: "top down 2D is slow, even with only 4/5
    // actors" - traced to a scene with several walk-triggers). check_triggers
    // alone only ever gets cleared by a *successful match* (below) - so a
    // player blocked against a wall while still holding a direction (the
    // player is trivially "on tile" every frame while stationary) re-ran
    // this whole scan, including the SceneActivateTriggerAt loop over every
    // trigger, on *every single engine iteration* for as long as they stayed
    // blocked, even though the tile being checked never changed and the
    // result could never change either. Measured on a real 14-trigger scene:
    // this one function accounted for essentially the entire gap between a
    // stuck player and locked 60fps (tick/frame ratio 0.48 -> 0.935 with
    // just this call disabled). Adding the same "already checked this exact
    // tile" short-circuit Adventure's own trigger check already uses
    // (`adv_last_trigger_tx/ty` above - itself matching GB's real
    // ActivateTriggerAt, "compares against a remembered last checked tile")
    // makes the scan run at most once per distinct tile, regardless of how
    // long the player dwells there - moving through it or stuck against it.
    if (tx == td_last_trigger_tx && ty == td_last_trigger_ty) return;
    td_last_trigger_tx = tx;
    td_last_trigger_ty = ty;

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
// Perf: local pointer, same table[i]-vs-pointer fix as the other actor-loop
// functions in this file (see PERF.md) - actors[i] was re-indexed up to 6
// times per actor here (enabled, active, moving, x, movement_type, plus
// actor_face/actor_on_tile each re-indexing again internally before their
// own recent pointer fixes) - missed by the original movement/collision
// cleanup pass, which covered actor_try_move/npc_blocking/Update_TopDown
// but not this function.
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
        ACTOR *a = &actors[i];
        if (script_ptr) return;
        if ((i & 1) != first) continue;
        if (!a->enabled) continue;
        if (!a->active) continue;
        if (a->moving) continue;
        {
            u8 r = ((time >> 6) + i + a->x) & 3;
            if (a->movement_type == MOVE_AI_RANDOM_FACE)
            {
                actor_face(a, dirs[r][0], dirs[r][1]);
            }
            else if (a->movement_type == MOVE_AI_RANDOM_WALK)
            {
                if (actor_on_tile(a))
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
// Perf: local pointer, same table[i]-vs-pointer fix as the other actor-loop
// functions in this file - actors[i] was re-indexed up to 8 times per actor
// here.
static void SceneAnimateActors(void)
{
    u8 i, thr, do_anim;

    if ((time & 7) != 0) return;

    for (i = 0; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        ACTOR *a = &actors[i];
        if (!a->enabled) continue;
        if (a->frames_len <= 1) continue;

        thr = 7;
        if (a->anim_speed == 3) thr = 15;
        if (a->anim_speed == 2) thr = 31;
        if (a->anim_speed == 1) thr = 63;
        if (a->anim_speed == 0) thr = 127;
        if ((time & thr) != 0) continue;

        do_anim = 0;
        if (a->animate) do_anim = 1;
        /* anim_hold bridges the 1-frame `moving`=0 dips at tile boundaries so a
         * continuously-walking actor keeps cycling. */
        if (a->moving || a->anim_hold)
        {
            if (a->sprite_type != SPRITE_STATIC) do_anim = 1;
        }

        if (!do_anim)
        {
            /* settled idle (anim_hold ran out) -> back to the standing pose */
            if (a->sprite_type == SPRITE_ACTOR_ANIMATED && a->anim_hold == 0)
            {
                a->frame = 0;
            }
            continue;
        }

        if (a->frame + 1 >= a->frames_len) a->frame = 0;
        else a->frame++;
    }
}

// Script-commanded walk: re-aims whichever actor is currently targeted by
// the *active* blocking move (ACTOR_MOVE_TO/MOVE_RELATIVE's BEGIN_MOVE),
// reading/writing the shared actor_move_settings/actor_move_dest_x/y/
// script_actor/script_action_complete globals - same globals script_cmds.c's
// BEGIN_MOVE itself writes. Called once for the foreground (from
// SceneUpdateActors, below) and once per active On Update context (from
// UpdateScriptsProcess, update_script.c) - in both cases right after that
// context's own saved copies of these globals have been swapped in, so
// "the active move" always means the one the current caller owns, never a
// different context's (see UPDATE_CTX's own move_dest_x/y/settings fields
// and the user-found bug this fixes, below).
//
// v4 fix (user-found: an enemy's own On Update script doing a simple
// Move Relative "bob up, bob down" loop made the *player* freeze solid the
// moment the scene loaded, and permanently - not a stutter). Root cause:
// actor_move_settings/actor_move_dest_x/actor_move_dest_y (and, implicitly,
// which actor script_actor currently names) are the *only* state
// BEGIN_MOVE's blocking-move protocol has - and update_script.c's own
// design doc already flagged Camera Shake/Await Input as unsafe to author
// inside an On Update script for exactly this shared-global reason, but
// missed that Move To/Move Relative share the identical hazard. Before this
// fix, UpdateScriptsProcess swapped script_ptr/wait_time/stack per context
// but left these move globals untouched - so the moment *any* On Update
// context's own blocking move started, it stomped whichever move the
// foreground (or another context) already had in flight. Concretely: the
// scene's own init script does Move Relative on the player ($self$); an
// enemy's On Update script's Move Relative (even though its own actor
// parameter was never bound to a real actor, itself a separate project-
// authoring issue, not this bug) overwrote actor_move_dest_x/
// actor_move_settings mid-flight - the player's own move's destination was
// gone, this function never saw "arrived" again, script_action_complete
// stayed 0 forever, and the scene's own init script (which the player's
// gameplay controls live downstream of) never finished. Fixed by giving
// each UPDATE_CTX its own move_dest_x/y/settings, saved/restored around the
// swap exactly like wait_time already was, and the foreground's own copies
// saved/restored around the whole per-context loop the same way fg_wait_time
// already is - see update_script.c.
u8 ActorMoveAim(void)
{
    u8 scripting = 0;

    // Nested ifs, not `(a & b) && (c < d)`: see the actor_on_tile comment.
    if (actor_move_settings & ACTOR_MOVE_ENABLED)
    {
        if (script_actor < MAX_ACTORS)
        {
            scripting = 1;
        }
    }

    if (scripting && actor_on_tile(&actors[script_actor]))
    {
        u8 a = script_actor;
        ACTOR *sa = &actors[a];
        u8 arrived = 0;
        if (sa->x == actor_move_dest_x)
        {
            if (sa->y == actor_move_dest_y) arrived = 1;
        }
        if (arrived)
        {
            actor_move_settings &= ~ACTOR_MOVE_ENABLED;
            sa->moving = 0;
            script_action_complete = 1;
            scripting = 0;
        }
        else
        {
            s8 dx = 0, dy = 0;
            if (sa->x > actor_move_dest_x)      dx = -1;
            else if (sa->x < actor_move_dest_x) dx = 1;
            else if (sa->y > actor_move_dest_y) dy = -1;
            else if (sa->y < actor_move_dest_y) dy = 1;

            actor_try_move(a, dx, dy);
            if (!sa->moving)
            {
                // Blocked - abandon the move and let the script continue.
                actor_move_settings &= ~ACTOR_MOVE_ENABLED;
                script_action_complete = 1;
                scripting = 0;
            }
        }
    }

    return scripting;
}

static void SceneUpdateActors(void)
{
    u8 scripting;
    u8 i;

    scripting = ActorMoveAim();

    // Step every moving actor. A scripted actor keeps its `moving` flag between
    // tiles (only the aim block or arrival clears it).
    // Perf: local pointer, same table[i]-vs-pointer fix as npc_blocking/
    // actor_try_move/Update_TopDown/actor_render_tile - this loop runs
    // over every actor, every frame, uncapped.
    for (i = 0; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        ACTOR *a = &actors[i];
        u8 is_cmd = 0;
        if (scripting)
        {
            if (i == script_actor) is_cmd = 1;
        }
        // A hidden (enabled=0) actor must still be allowed to step forward if
        // it's the actor a scripted Move To/Move Relative is currently aiming
        // (is_cmd) - the aim block above (actor_try_move) isn't itself gated
        // on enabled, so without this exception a Hide immediately followed
        // by a scripted move on the same actor arms the move (sa->moving=1)
        // but this stepping loop then skips it forever: sa->x/y never reach
        // actor_move_dest_x/y, "arrived" is never true, script_action_complete
        // is never set, and the blocking move command - and the whole script
        // after it - hangs permanently (user-found: a scene's trigger script
        // doing Hide then Move Relative on the Player silently did nothing).
        // Rendering/animation are unaffected - SceneRenderActors has its own,
        // separate enabled check, so this doesn't make a hidden actor visible.
        if (!a->enabled && !is_cmd)
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
        if (!a->moving && !is_cmd)
        {
            if (a->anim_hold) a->anim_hold--;
            continue;
        }
        a->anim_hold = 4; /* moved this frame - see gbs_types.h */
        if (a->move_speed == 0)
        {
            if ((time & 1) == 0)
            {
                a->x += a->dir_x;
                a->y += a->dir_y;
            }
        }
        else
        {
            a->x += (s16)a->dir_x * a->move_speed;
            a->y += (s16)a->dir_y * a->move_speed;
        }

        if (actor_on_tile(a) && !is_cmd)
        {
            a->moving = 0;
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

/* M8.3 correction - see the PROJECTILE_OID_BASE comment above (scene.h's
 * emote_oid doc): `<<2` is required (oamSet's `id` is a byte offset, not a
 * sprite index), restored here after M7 mistakenly dropped it. M9.4: a real
 * runtime value (emote_oid, scene.h) instead of a compile-time constant. */

// M7-cont. sprite frames, M8.3 (SPRITE_EDITOR_PROGRESS.md) VRAM addressing.
// A 3-frame SPRITE_ACTOR sheet has one pose per direction (down =
// frame_offset, up/side read from extra_pose_up_a[]/extra_pose_side_a[],
// flipped when dir_x<0). A 6-frame SPRITE_ACTOR_ANIMATED sheet adds a 2nd
// walk pose per direction (the "_b" arrays); SceneAnimateActors toggles
// actors[i].frame 0<->1 while the actor moves. A 6-frame sheet on a
// non-moving actor is SPRITE_STATIC with frames_len 6 - actors[i].frame
// (0..5) then picks the sheet frame directly, in the order down-A, down-B,
// up-A, up-B, side-A, side-B. Facing for the ACTOR/ANIMATED cases is derived
// from dir_x/dir_y fresh every call, matching the GB engine's
// SceneRenderActor_b.
// M8.3: every pose beyond the primary/frame-0 one (which still always
// lives at `fo` itself, unchanged) used to be `fo + <fixed compile-time
// offset>` (ACTOR_UP_TILE0 etc, a project-wide constant - any slot's "up"
// pose was always exactly 96 tiles past its own "down" pose). Now each
// slot's real extra poses are packed on demand, per scene, so their VRAM
// address varies per slot and is read back from the extra_pose_*[] arrays
// (SceneInit) instead - `<<1` converts the stored half-tile-base back to a
// real tile index (every packer placement is 2-aligned, see scene.h).
// Perf: takes the caller's already-computed ACTOR* directly (its one call
// site, in SceneRenderActors, already has one) instead of an index it
// would have to re-derive `actors[i]` from all over again - same
// table[i]-vs-pointer fix as npc_blocking/actor_try_move/Update_TopDown,
// applied here since `frame` alone was re-indexed up to 5 times in the
// SPRITE_STATIC cycle below. Runs for every actor, every frame,
// uncapped - unlike SceneAnimateActors (throttled to 1-in-8 frames).
// M8.3: returns a real VRAM tile index, not a slot-relative byte - an extra
// pose packed into the dynamic region (tiles 96-511) can exceed 255, so this
// (and every variable that carries its result - see SceneRenderActors'
// `tile`) must stay u16 the whole way to oamSet's own u16 gfxoffset param.
// A u8 here would silently truncate any pose placed past tile 255.
static u16 actor_render_tile(ACTOR *a, u8 *flip_out)
{
    u8 fo = a->frame_offset;
    u8 st = a->sprite_type;
    u8 slot = fo >> 1;
    u8 pose_b = 0;
    u8 frame = a->frame;

    if (st == SPRITE_STATIC)
    {
        *flip_out = a->flip;
        if (a->frames_len <= 1) return fo;
        /* 6-frame manual/auto cycle */
        if (frame == 1) return (u16)extra_pose_down_b[slot] << 1;
        if (frame == 2) return (u16)extra_pose_up_a[slot] << 1;
        if (frame == 3) return (u16)extra_pose_up_b[slot] << 1;
        if (frame == 4) return (u16)extra_pose_side_a[slot] << 1;
        if (frame == 5) return (u16)extra_pose_side_b[slot] << 1;
        return fo;
    }

    if (st == SPRITE_ACTOR_ANIMATED)
    {
        if (frame & 1) pose_b = 1;
    }

    if (a->dir_y < 0) /* up */
    {
        *flip_out = 0;
        return (u16)(pose_b ? extra_pose_up_b[slot] : extra_pose_up_a[slot]) << 1;
    }
    if (a->dir_x != 0) /* side */
    {
        *flip_out = a->dir_x < 0 ? 1 : 0;
        return (u16)(pose_b ? extra_pose_side_b[slot] : extra_pose_side_a[slot]) << 1;
    }
    /* down / idle */
    *flip_out = 0;
    return pose_b ? (u16)extra_pose_down_b[slot] << 1 : fo;
}

/* M9.4 (SPRITE_EDITOR_PROGRESS.md): resolves which authored metasprite
 * frame index an actor's current pose/direction maps to - the SAME index
 * space a metaspriteMode sheet's own frames are authored in
 * (entitiesTypes.ts/MetaspriteFramesTimeline.tsx: a "fixed"/"multi"/
 * "multi_movement" metasprite sheet follows the exact same frame
 * convention a legacy sheet's own frames already do), confirmed directly
 * against actor_render_tile's own SPRITE_STATIC branch above: frame 0-5
 * already resolve to pose index 0-5 in exactly this order (primary,
 * down-B, up-A, up-B, side-A, side-B) - so no remapping is needed between
 * authoring and this lookup.
 * Deliberately duplicated from actor_render_tile rather than refactored
 * into it - that function is the single most bug-history-documented piece
 * of this file (three real OAM X/Y-wraparound bugs and a priority-layer
 * bug, all recorded as comments right there); this keeps the legacy path
 * provably untouched, and this new function only ever has to resolve a
 * plain pose INDEX, not a real VRAM tile address. */
static u8 actor_metasprite_pose(ACTOR *a, u8 *flip_out)
{
    u8 st = a->sprite_type;
    u8 pose_b = 0;

    if (st == SPRITE_STATIC)
    {
        *flip_out = a->flip;
        return a->frame;
    }
    if (st == SPRITE_ACTOR_ANIMATED && (a->frame & 1))
    {
        pose_b = 1;
    }
    /* SPRITE_ACTOR (a "multi" metasprite sheet) authors exactly 3 COMPACT
     * frames (down,up,side - MetaspriteFramesTimeline.tsx's own
     * frameCountFor), not 6 - compileSnesData.js's encodeMetaspriteSlot
     * packs sheet.metasprites[] 1:1 with no gap-filling, so this has to
     * return compact indices {0,1,2} for that type, not the 6-slot
     * numbering SPRITE_ACTOR_ANIMATED's own 6 real authored frames already
     * naturally match. Caught before the side-mirroring verification below
     * - reading pose index 4 against a 3-entry frameOffset table would have
     * read past the real data. */
    if (a->dir_y < 0) /* up */
    {
        *flip_out = 0;
        return (st == SPRITE_ACTOR) ? 1 : (pose_b ? 3 : 2);
    }
    if (a->dir_x != 0) /* side */
    {
        *flip_out = a->dir_x < 0 ? 1 : 0;
        return (st == SPRITE_ACTOR) ? 2 : (pose_b ? 5 : 4);
    }
    /* down / idle */
    *flip_out = 0;
    return (st == SPRITE_ACTOR) ? 0 : (pose_b ? 1 : 0);
}

static void SceneRenderActors(void)
{
    u8 i, flip;
    u16 tile; /* M8.3: a packed extra-pose address can exceed 255 (tiles
               * 96-511) - oamSet's own gfxoffset param is u16, this just
               * has to stay wide the whole way there. */
    u16 oid;
    s16 x_rel, y_rel;
    u8 slot; /* M9.4: hoisted so both the metasprite and legacy branches
              * below (and the disabled/hidden branch) share one lookup. */
    /* M9.4: a metasprite actor's own per-tile render locals. Declared here
     * (not in a nested block) matching this function's own existing flat
     * declaration style. */
    u8 meta_pose, meta_mirror, meta_j, meta_n, meta_flags;
    u8 meta_flip_x, meta_flip_y, meta_pri, meta_visible;
    s8 meta_dx, meta_dy;
    s16 meta_x, meta_y;
    u16 meta_tile, meta_oid, meta_frame_off;
    const unsigned char *meta_base;
    const unsigned char *meta_e;
    /* Only the used slots - SceneInit hid slots > scene_num_actors once. */
    for (i = 0; i <= scene_num_actors && i < MAX_ACTORS; i++)
    {
        ACTOR *a = &actors[i];
        oid = actor_oam_base[i]; /* M7: real per-actor base, see scene.h */
        slot = a->frame_offset >> 1;
        x_rel = a->x - scroll_x - 8;
        y_rel = a->y - scroll_y - 16;
        /* v4 fix (user-found, No$sns: "the rock and duck [show up] at the
         * bottom of the screen" while scrolling Sample Town, a 448x448px
         * scene - far bigger than this ever got exercised on before).
         * oamSet's x/y are u16; this engine used to hand it x_rel/y_rel
         * (s16, can go negative) with no range check at all, relying
         * entirely on OAM hardware coordinate wraparound (Y is 8 bits -
         * period 256; X is 9 bits - period 512) to hide off-screen actors.
         * That only works within one wrap period of the screen edge - an
         * actor further away than that (any scene bigger than ~256x256px,
         * not just Sample Town) wraps back into a visible-looking position
         * instead of disappearing, exactly what the user saw. Now an
         * explicit distance check gates whether this actor is drawn at
         * all - genuinely off-screen actors are hidden outright rather
         * than trusted to wrap correctly.
         *
         * v4 follow-up fix (user-found, No$sns: an actor's OAM X snapping
         * to 0 at a specific, exactly-reproducible scroll position - not
         * the original bug's random-looking wraparound). The original
         * +32px margin on the right edge (x_rel < 288) was itself wrong:
         * SNES OAM X is a 9-bit *signed* field - 0..255 are real on-screen
         * positions (naturally clipped by the PPU past column 255, no
         * special handling needed for a sprite hanging off the right
         * edge), but 256..511 are the *negative* half (256 = -256, not
         * "256"). x_rel in [256, 287] fell straight into that negative
         * half - 256 cast to u16 and handed to oamSet came back out as
         * raw X 0 (confirmed on real hardware: OAM low byte 0x00), i.e.
         * the sprite rendered pinned to the *left* screen edge instead of
         * being invisible off the right one. There is no legitimate use
         * for x_rel > 255 here - a sprite past the right edge just needs
         * to be culled, not encoded - so the upper X bound is exactly the
         * screen width, no margin.
         *
         * v4 fix (user-found, No$sns OAM viewer: a sprite with OAM Y=0xF8
         * showing a sliver at the TOP of the screen instead of staying
         * fully hidden below the bottom edge). The claim just above this -
         * "Y has no equivalent hardware ambiguity, its own 256 upper bound
         * was already correct" - was wrong: unlike X (9-bit, wraps at 512,
         * far past the 256px screen width, so the exact-256 cutoff above
         * has no wrap risk at all), Y is only 8-bit and wraps at 256, which
         * is *close* to the real 224px visible height. A 16px-tall sprite
         * (OBJ_LARGE) at y_rel in (224, 240] is safely invisible (rows
         * 224-255, entirely below row 223, no wrap) - but y_rel in
         * (240, 255] wraps: e.g. y_rel=248 spans OAM rows 248-263, and
         * 256-263 wrap to rows 0-7, showing the sprite's own bottom 8 rows
         * as a phantom sliver at the top of the screen. Matching X's own
         * treatment exactly (cull at the real visible boundary, not the
         * hardware wrap period) removes the unsafe window entirely: 224 is
         * this target's real NTSC visible height (also used verbatim by
         * cam_max_y two lines below/game.c's cam_max_y - no named constant
         * exists for it here). */
        if (metasprite_frame_base[slot])
        {
            /* M9.4 (SPRITE_EDITOR_PROGRESS.md): a Free-form (Metasprite)
             * actor - loop over this frame's own placed tiles instead of
             * the single oamSet the legacy branch below still does
             * unchanged. See scene.h's metasprite_frame_base comment for
             * the wire format and encodeMetaspriteSlot (compileSnesData.js)
             * for how it's built. */
            if (a->enabled && !sprites_hidden)
            {
                meta_pose = actor_metasprite_pose(a, &flip);
                /* User-asked (M9.4): a "multi"/"multi_movement" sheet's
                 * side pose auto-mirrors the whole placed-tile set for the
                 * opposite facing direction, matching the existing
                 * single-tile convention every other actor sheet already
                 * has (actor_render_tile's own dir_x<0 hardware hflip).
                 * SPRITE_STATIC's `flip` is a separate, per-actor manual
                 * flip control (a->flip) - XORed into each tile's own
                 * flipX below with no position change, not this same
                 * whole-composition mirror (never asked for, and a
                 * position-mirror for a non-directional sheet has no
                 * "opposite side" to mirror toward). */
                meta_mirror = (a->sprite_type != SPRITE_STATIC) && flip;
                /* Named animation states (v4 follow-up): anim_state_offset
                 * is 0 for every actor still on this sheet's own default
                 * state (the exact byte metasprite_frame_base[slot] always
                 * pointed at before this feature existed), so this is a
                 * no-op for every untouched project. */
                meta_base = metasprite_frame_base[slot] + a->anim_state_offset;
                meta_frame_off = meta_base[(u16)meta_pose * 2] |
                                  ((u16)meta_base[(u16)meta_pose * 2 + 1] << 8);
                meta_e = meta_base + meta_frame_off;
                meta_n = *meta_e++;
                /* Avoids a comma-operator increment clause
                 * (`meta_j++, meta_e += 4`) - untested syntax on this
                 * engine, no existing loop anywhere in this file uses one.
                 * Ruled out as the cause of this change's own real Mesen
                 * bug (that was compileSnesData.js's spriteTypeForActor,
                 * see its own comment) by testing this rewrite in
                 * isolation first and seeing the exact same symptom
                 * persist - kept anyway, advancing meta_e explicitly costs
                 * nothing and avoids relying on untested syntax. */
                for (meta_j = 0; meta_j < meta_n; meta_j++)
                {
                    meta_dx = (s8)meta_e[0];
                    meta_dy = (s8)meta_e[1];
                    meta_tile = (u16)meta_e[2] << 1;
                    meta_flags = meta_e[3];
                    meta_flip_x = meta_flags & 1;
                    meta_flip_y = (meta_flags & 2) ? 1 : 0;
                    meta_pri = (meta_flags & 4) ? 3 : 2;
                    if (meta_mirror)
                    {
                        /* Mirrors this tile's own position around the
                         * canvas's horizontal center (dx is already
                         * center-relative - see compileSnesData.js's own
                         * dx = tile.x - canvasWidth/2) and flips its pixels
                         * to match - a rigid mirror of the whole
                         * composition, not a per-tile-independent flip. */
                        meta_dx = (s8)(-(s16)meta_dx - 16);
                        meta_flip_x = meta_flip_x ? 0 : 1;
                    }
                    else if (a->sprite_type == SPRITE_STATIC && a->flip)
                    {
                        meta_flip_x = meta_flip_x ? 0 : 1;
                    }
                    meta_x = a->x - scroll_x + meta_dx;
                    meta_y = a->y - scroll_y + meta_dy;
                    meta_oid = oid + ((u16)meta_j << 2);
                    /* Same off-screen culling / OAM X/Y-wraparound safety
                     * this function's own single-tile path below needs
                     * (see its extensive comment) - a wide/tall composed
                     * sprite's outer tiles can cross these bounds even when
                     * the actor's own anchor doesn't, so each tile needs
                     * its own check, not just the actor's.
                     * Deliberately NOT a single 4-term && chain, matching
                     * this engine's own established defensive convention
                     * for new code (the documented 816-tcc 3+-term &&/||
                     * miscompile class - can_step/in_box/col_solid's own
                     * fix history) - though the real bug hit during this
                     * change's own Mesen verification turned out to be
                     * elsewhere (compileSnesData.js's spriteTypeForActor,
                     * see its own comment), not this chain; kept this way
                     * anyway since it costs nothing and matches precedent. */
                    meta_visible = 1;
                    if (meta_x <= -32) meta_visible = 0;
                    if (meta_x >= 256) meta_visible = 0;
                    if (meta_y <= -32) meta_visible = 0;
                    if (meta_y >= 224) meta_visible = 0;
                    if (meta_visible)
                    {
                        oamSetEx(meta_oid, OBJ_LARGE, OBJ_SHOW);
                        oamSet(meta_oid, (u16)meta_x, (u16)meta_y, meta_pri,
                               meta_flip_x, meta_flip_y, meta_tile,
                               sprite_pal_for_slot[slot]);
                    }
                    else
                    {
                        oamSetVisible(meta_oid, OBJ_HIDE);
                    }
                    meta_e += 4;
                }
                /* Hide this actor's own unused trailing sub-ids (this
                 * frame has fewer tiles than this slot's own cross-frame
                 * worst case, sprite_oam_ids_for_slot[slot]) so a smaller
                 * frame never leaves a stale sprite from a bigger one. */
                for (; meta_j < sprite_oam_ids_for_slot[slot]; meta_j++)
                {
                    oamSetVisible(oid + ((u16)meta_j << 2), OBJ_HIDE);
                }
            }
            else
            {
                for (meta_j = 0; meta_j < sprite_oam_ids_for_slot[slot]; meta_j++)
                {
                    oamSetVisible(oid + ((u16)meta_j << 2), OBJ_HIDE);
                }
            }
        }
        else if (a->enabled && !sprites_hidden &&
            x_rel > -32 && x_rel < 256 &&
            y_rel > -32 && y_rel < 224)
        {
            tile = actor_render_tile(a, &flip);
            // oamSet(id, x, y, priority, hflip, vflip, gfxoffset, pal)
            // frame_offset is always slot*2 (SceneInit / PLAYER_SET_SPRITE), so
            // frame_offset>>1 is the sprite slot -> its per-sheet OBJ palette.
            // -8 x / -16 y: a 16x16 sprite whose feet sit at the bottom of the
            // actor's tile, matching the GB engine (actor pos = tile*8+8, GB
            // OAM shows at pos - {8,16}); -8 y put every sprite a tile too low
            // (an actor placed "on the stairs" rendered one row below them).
            // v4 fix (user-found: "the sprites are displayed behind the
            // current BG"): priority 2, NOT 0. The M7 comment that used to
            // sit here got Mode 1's real layer order backwards - the
            // authoritative table (fullsnes' Background Priority Chart) is,
            // front to back with BG3 kept "priority high" as this engine
            // sets it: BG3.1 > OBJ3 > BG1.1 > BG2.1 > OBJ2 > BG1.0 > BG2.0 >
            // OBJ1 > OBJ0 > BG3.0 > Backdrop. So OBJ0 sits BELOW BG1.0/
            // BG2.0 (every ORDINARY tile, not just a painted priority one) -
            // priority 0 hid every actor behind the plain scene background.
            // Priority 2 sits below BG1.1/BG2.1 (still correctly occluded by
            // a painted "priority" tile - see EVENTS.md) but above BG1.0/
            // BG2.0, so ordinary tiles no longer cover the sprite. This is
            // also just reverting to what this code did before M7 (v4).
            //
            // v4 fix (user-found, No$sns OAM viewer: a duck actor scrolled
            // just past the left edge - x_rel a small negative number -
            // rendered pinned near the RIGHT edge instead, at the wrapped
            // low byte of x_rel). oamSetEx MUST run before oamSet, not
            // after: PVSnesLib's oamSetEx (sprites.asm) unconditionally
            // clears this sprite's OAM high-table X-MSB bit on its
            // OBJ_SHOW path (`and.l oamHideand,x` on the show branch) -
            // it doesn't know or care about X, it's just resetting
            // whatever oamSetVisible's own hide path leaves behind. oamSet
            // is the one that correctly computes and writes that same bit
            // from x_rel's sign (a real read-modify-write, verified in the
            // upstream pvsneslib/pvsneslib/source/sprites.asm). Calling
            // oamSetEx after oamSet silently zeroed the bit oamSet had just
            // set, so any sprite with a negative x_rel (already handled by
            // the -32..256 cull check above) had its OAM X reinterpreted as
            // a small *positive* value near the right edge instead of the
            // correct near-left-edge/off-screen position.
            oamSetEx(oid, OBJ_LARGE, OBJ_SHOW);
            oamSet(oid, (u16)x_rel, (u16)y_rel, 2,
                   flip, 0, tile, sprite_pal_for_slot[a->frame_offset >> 1]);
        }
        else
        {
            oamSetVisible(oid, OBJ_HIDE);
        }
    }

    if (emote_time != 0)
    {
        /* v4 fix: priority 2, same reasoning/reversion as the actor oamSet
         * above - the emote bubble is a world-space sprite (floats above
         * the actor's head), so it should respect priority tiles the same
         * way (and not be hidden behind ordinary BG1 tiles either). */
        ACTOR *ea = &actors[emote_actor];
        // v4 fix: oamSetEx before oamSet - same X-MSB-clobbering reasoning
        // as the actor oamSet above.
        oamSetEx(emote_oid, OBJ_LARGE, OBJ_SHOW);
        oamSet(emote_oid, ea->x - scroll_x - 8,
               ea->y - scroll_y - 32, 2, 0, 0,
               EMOTE_TILE0 + emote_id * 2, 1);
    }
    else
    {
        oamSetVisible(emote_oid, OBJ_HIDE);
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
        oid = projectile_oid_base + ((u16)i << 2); /* M8.3: byte offset, see scene.h's own comment; M9.4: a real runtime value */

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
        /* v4 fix: priority 2, same reasoning as the actor/emote oamSet
         * above - a world-space sprite, same layer as actors. oamSetEx
         * before oamSet - same X-MSB-clobbering reasoning as the actor
         * oamSet above. */
        oamSetEx(oid, OBJ_LARGE, OBJ_SHOW);
        oamSet(oid, projectiles[i].x - scroll_x - 4, projectiles[i].y - scroll_y - 4, 2,
               flip, 0, tile, sprite_pal_for_slot[projectiles[i].sprite_slot]);
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
 * Fires the scene's playerHit1/2/3Script (same as a projectile hitting the
 * player) when one is actually authored; B fires that *and* the touched
 * actor's own script unconditionally, but this engine only ever runs one
 * script at a time project-wide, so a real choice has to be made. v4
 * follow-up (user-found, a real GB Studio 3.2.1 sample project's "Path to
 * Sample Town" turnip-stomp scene - its whole stomp/hurt/defeat logic lives
 * in each Turnip actor's own plain `script` field, with every scene-level
 * playerHit1/2/3Script left empty, matching how that official sample is
 * actually authored): firing *only* the scene script left that content
 * dead - confirmed by compiling the real project and decoding the turnip's
 * own script bytes byte-exact, which correctly self-target each turnip's
 * real actor index (so the compiler side was never the problem), but
 * nothing here ever ran it. Now falls back to the touched actor's own
 * `events_ptr` when the scene script is empty (`ptr[0] != 0` - a compiled
 * script is never truly empty, EVENT_END is a real byte - the same
 * "real empty" check SceneTryInteract's own actor-script gate already
 * uses), rather than always picking one or the other: a scene that already
 * authors playerHit1/2/3Script keeps running exactly that, unchanged; a
 * scene that authors the touched actor's own script instead (this sample's
 * own convention, and also this engine's `projectile_fire_hit_script`'s own
 * established precedent for "something with a matching collision_group
 * touched an actor - run its own script") now actually runs it too. */
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
            if (event_ptrs[idx].ptr[0] != 0)
            {
                run_script(event_ptrs[idx], 0);
            }
            else if (actors[j].events_ptr.ptr[0] != 0)
            {
                run_script(actors[j].events_ptr, j);
            }
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
