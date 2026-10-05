/*
 * On Update subsystem (v4) - see update_script.h for the full design note.
 */
#include "update_script.h"
#include "script_runner.h"
#include "assets.h"
#include "scene.h"

typedef struct
{
    const unsigned char *ptr;
    const unsigned char *start_ptr;
    const unsigned char *stack[SCRIPT_STACK_SIZE];
    const unsigned char *start_stack[SCRIPT_STACK_SIZE];
    u8 stack_ptr;
    u8 actor;
    u8 wait_time;
    u8 action_complete;
    /* v4 fix: this context's own copy of the blocking-move state
     * (ACTOR_MOVE_TO/MOVE_RELATIVE's BEGIN_MOVE writes actor_move_settings/
     * actor_move_dest_x/y) - see ActorMoveAim's comment in scene.c for the
     * real bug this fixes (one context's own Move Relative silently
     * stealing another's in-flight move, freezing it forever). */
    u8 move_settings;
    s16 move_dest_x;
    s16 move_dest_y;
} UPDATE_CTX;

static UPDATE_CTX update_ctxs[MAX_UPDATE_CONTEXTS];
static u8 update_ctx_used[MAX_UPDATE_CONTEXTS] = {0};

/* actors[] is already declared extern by script_runner.h (included above). */

void UpdateScriptsReset(void)
{
    u8 i;
    for (i = 0; i < MAX_UPDATE_CONTEXTS; i++)
    {
        update_ctx_used[i] = 0;
    }
}

void ActorStartUpdate(u8 actor)
{
    BANK_PTR script;
    u8 i;

    if (actors[actor].update_ctx != UPDATE_CTX_NONE)
    {
        return;
    }

    script = event_ptrs[actors[actor].update_idx];
    if (script.ptr[0] == 0)
    {
        /* A compiled script is never truly empty (EVENT_END is a real,
         * always-emitted byte) - a first byte of 0 means nothing was
         * authored on the "On Update" tab, matching the same check
         * established for Point and Click's hover-gate / SceneTryInteract's
         * own script.bank-equivalent gate. */
        return;
    }

    for (i = 0; i < MAX_UPDATE_CONTEXTS; i++)
    {
        if (!update_ctx_used[i])
        {
            update_ctx_used[i] = 1;
            update_ctxs[i].ptr = script.ptr;
            update_ctxs[i].start_ptr = script.ptr;
            update_ctxs[i].stack_ptr = 0;
            update_ctxs[i].actor = actor;
            update_ctxs[i].wait_time = 0;
            update_ctxs[i].action_complete = 1;
            update_ctxs[i].move_settings = 0;
            update_ctxs[i].move_dest_x = 0;
            update_ctxs[i].move_dest_y = 0;
            actors[actor].update_ctx = i;
            return;
        }
    }
    /* Pool exhausted - documented cap (update_script.h), this actor's
     * update script simply doesn't run this scene. */
}

void ActorStopUpdate(u8 actor)
{
    u8 slot = actors[actor].update_ctx;
    if (slot == UPDATE_CTX_NONE)
    {
        return;
    }
    update_ctx_used[slot] = 0;
    actors[actor].update_ctx = UPDATE_CTX_NONE;
}

void UpdateScriptsProcess(void)
{
    const unsigned char *fg_ptr = script_ptr;
    const unsigned char *fg_start_ptr = script_start_ptr;
    const unsigned char *fg_stack[SCRIPT_STACK_SIZE];
    const unsigned char *fg_start_stack[SCRIPT_STACK_SIZE];
    u8 fg_stack_ptr = script_stack_ptr;
    u8 fg_actor = script_actor;
    u8 fg_wait_time = wait_time;
    u8 fg_action_complete = script_action_complete;
    u8 fg_move_settings = actor_move_settings;
    s16 fg_move_dest_x = actor_move_dest_x;
    s16 fg_move_dest_y = actor_move_dest_y;
    u8 i, j;

    /* v4 perf fix (user-found: a real Shoot Em Up scene with 15 concurrently
     * active On Update contexts measured ~0.2 ticks/real-frame - a Mesen
     * bisection isolated most of the drop to this function). This loop (and
     * the 3 others below shaped just like it) used to always copy all
     * SCRIPT_STACK_SIZE (8) stack/start_stack slots regardless of how many
     * are actually in use - stack_ptr (saved/restored right alongside) is
     * the real depth, and nothing anywhere ever reads a stack slot at or
     * past the current stack_ptr (only Script_StackPush_b/StackPop_b -
     * ActorInvoke/sub-scripts - ever touch it; a plain custom-event call
     * inlines at compile time instead, so an update script built from one,
     * like these, never pushes at all), so copying past it is pure waste -
     * 816-tcc-generated code pays a real per-iteration cost for each of
     * those unconditional extra slots, now paid 2x per *active* context
     * (swap in + out) every single frame. Cuts this particular cost to
     * zero for a script that never pushes (the scene that exposed this),
     * and to the real depth for one that does. */
    for (j = 0; j < fg_stack_ptr; j++)
    {
        fg_stack[j] = script_stack[j];
        fg_start_stack[j] = script_start_stack[j];
    }

    for (i = 0; i < MAX_UPDATE_CONTEXTS; i++)
    {
        if (!update_ctx_used[i])
        {
            continue;
        }

        /* Swap this context's saved state into the shared globals the
         * opcode dispatch table operates on. */
        script_ptr = update_ctxs[i].ptr;
        script_start_ptr = update_ctxs[i].start_ptr;
        for (j = 0; j < update_ctxs[i].stack_ptr; j++)
        {
            script_stack[j] = update_ctxs[i].stack[j];
            script_start_stack[j] = update_ctxs[i].start_stack[j];
        }
        script_stack_ptr = update_ctxs[i].stack_ptr;
        script_actor = update_ctxs[i].actor;
        wait_time = update_ctxs[i].wait_time;
        script_action_complete = update_ctxs[i].action_complete;
        actor_move_settings = update_ctxs[i].move_settings;
        actor_move_dest_x = update_ctxs[i].move_dest_x;
        actor_move_dest_y = update_ctxs[i].move_dest_y;

        /* This context's own Wait countdown - mirrors what the main loop's
         * ScriptUpdateTimers() does for the foreground's wait_time, scoped
         * to just this one context (Camera Shake / Await Input aren't
         * supported inside an update script, see update_script.h). */
        if (wait_time != 0)
        {
            wait_time--;
            if (wait_time == 0)
            {
                script_action_complete = 1;
            }
        }

        ScriptRunnerUpdate();

        /* This context's own blocking-move step (ACTOR_MOVE_TO/MOVE_RELATIVE),
         * against its own move_settings/move_dest_x/y just swapped in above -
         * see ActorMoveAim's comment in scene.c. Runs after ScriptRunnerUpdate,
         * same order the foreground gets every frame (main.c: ScriptRunnerUpdate
         * then SceneUpdate/SceneUpdateActors), so a move just started by the
         * opcode above takes its first step this same turn, same as the
         * foreground would. */
        ActorMoveAim();

        if (!script_ptr)
        {
            /* Reached EVENT_END with an empty call stack - naturally
             * finished. Matches GB Studio 3.x: a completed update script
             * doesn't auto-relaunch on its own, Start Update Script
             * re-launches it fresh. */
            update_ctx_used[i] = 0;
            actors[update_ctxs[i].actor].update_ctx = UPDATE_CTX_NONE;
            continue;
        }

        /* Save this context's (possibly still in-progress, e.g. mid-Wait)
         * state back out. */
        update_ctxs[i].ptr = script_ptr;
        update_ctxs[i].start_ptr = script_start_ptr;
        for (j = 0; j < script_stack_ptr; j++)
        {
            update_ctxs[i].stack[j] = script_stack[j];
            update_ctxs[i].start_stack[j] = script_start_stack[j];
        }
        update_ctxs[i].stack_ptr = script_stack_ptr;
        update_ctxs[i].wait_time = wait_time;
        update_ctxs[i].action_complete = script_action_complete;
        update_ctxs[i].move_settings = actor_move_settings;
        update_ctxs[i].move_dest_x = actor_move_dest_x;
        update_ctxs[i].move_dest_y = actor_move_dest_y;
    }

    /* Restore the foreground's own live state - none of the above is ever
     * visible to it, and it was never touched while idle. */
    script_ptr = fg_ptr;
    script_start_ptr = fg_start_ptr;
    for (j = 0; j < fg_stack_ptr; j++)
    {
        script_stack[j] = fg_stack[j];
        script_start_stack[j] = fg_start_stack[j];
    }
    script_stack_ptr = fg_stack_ptr;
    script_actor = fg_actor;
    wait_time = fg_wait_time;
    script_action_complete = fg_action_complete;
    actor_move_settings = fg_move_settings;
    actor_move_dest_x = fg_move_dest_x;
    actor_move_dest_y = fg_move_dest_y;
}
