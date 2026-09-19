#ifndef GBS_TYPES_H
#define GBS_TYPES_H

/*
 * Shared engine types for the SNES target. Mirrors appData/src/gb/include/
 * GameTypes.h / data_ptrs.h, using PVSnesLib's u8/u16/s8/s16.
 *
 * D4: a BANK_PTR is a plain far pointer - the 65816 dereferences it directly,
 * no bank switching. The M7 data compiler builds tables of these in data.asm
 * as `{ &__section_N + offset }`.
 */
#include <snes.h>

#define MAX_ACTORS 9
#define MAX_TRIGGERS 9
/* Projectiles (v4). B (GB Studio 3.x) allows 5 concurrent projectiles per
 * scene; this port picks a smaller pool - real OAM headroom isn't the
 * constraint (actors use ~10 of 128 hardware sprites), it's just no reason
 * to go bigger than what a scene realistically needs at once. */
#define MAX_PROJECTILES 4

/* Placeholder until the M7 data compiler emits the real count (data_ptrs.h) */
#ifndef NUM_VARIABLES
#define NUM_VARIABLES 128
#endif

typedef struct
{
    const unsigned char *ptr;
} BANK_PTR;

/* SPRITE_TYPE from GameTypes.h - drives the facing-frame offset in render */
enum
{
    SPRITE_STATIC = 0,
    SPRITE_ACTOR,
    SPRITE_ACTOR_ANIMATED
};

/* MOVEMENT_TYPE from GameTypes.h */
enum
{
    MOVE_NONE = 1,
    MOVE_PLAYER_INPUT,
    MOVE_AI_RANDOM_FACE,
    MOVE_AI_INTERACT_FACE,
    MOVE_AI_RANDOM_WALK,
    MOVE_AI_ROTATE_TRB
};

/*
 * Actor. D2 lets scenes be larger than 256 px, so position is s16 pixels
 * rather than the Game Boy's u8 tile-relative value.
 */
typedef struct
{
    s16 x, y;
    s8 dir_x, dir_y;
    u8 frame;
    u8 frame_offset;
    u8 frames_len;
    u8 animate;      /* always-cycle flag (decorative sprites) */
    u8 anim_hold;    /* frames since last moved - bridges the 1-frame gaps at
                        tile boundaries so a walk cycle doesn't stutter/reset */
    u8 enabled;
    u8 active;  /* M4 (v4): ACTOR_ACTIVATE/DEACTIVATE. Independent of `enabled`
                   (visibility, ACTOR_SHOW/HIDE) - this only gates AI/movement/
                   collision/interaction, matching GB Studio 3.x's real
                   active/inactive split; a hidden-but-active actor still
                   moves and blocks, an inactive-but-shown actor stands still
                   and can't be walked into or interacted with. Rendering
                   (SceneRenderActors) and per-frame animation cycling
                   (SceneAnimateActors) are unaffected - only `enabled`. */
    u8 flip;
    u8 moving;
    u8 move_speed;
    u8 anim_speed;
    u8 collisions_enabled;
    u8 movement_type;
    u8 sprite_type;
    BANK_PTR events_ptr;
    /* Projectiles (v4). collision_group is a bitmask (1=player, 2/4/8=group
     * 1/2/3 - collisionGroupDec(), src/lib/compiler/helpers.js) - what this
     * actor IS, for a projectile's own collision_mask to test against.
     * hit1/2/3_idx are event_ptrs[] indices (like events_ptr's own source
     * index) for this actor's Hit (Group 1/2/3) scripts - resolved to a real
     * BANK_PTR only at the moment a hit fires, not pre-resolved like
     * events_ptr, since most actors never get hit at all in a given scene. */
    u8 collision_group;
    u8 hit1_idx;
    u8 hit2_idx;
    u8 hit3_idx;
} ACTOR;

typedef struct
{
    u8 x, y;
    u8 w, h;
    u8 type; /* 0 = walk-over, 1 = action (A button) */
    BANK_PTR events_ptr;
} TRIGGER;

/* OPERATOR_TYPE from GameTypes.h - order is part of the compiler contract */
enum
{
    OPERATOR_EQ = 1,
    OPERATOR_NE,
    OPERATOR_LT,
    OPERATOR_GT,
    OPERATOR_LTE,
    OPERATOR_GTE
};

typedef void (*SCRIPT_CMD_FN)(void);

/* The opcode table is two parallel arrays (script_cmds[] / script_cmd_arg_lens[])
 * rather than an array of {fn, args_len}: a far read of a mixed-size struct
 * field mis-indexes under 816-tcc. */

#endif
