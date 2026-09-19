/*
 * On Update subsystem (v4) - see update_script.h for the full design note.
 */
#include "update_script.h"
#include "script_runner.h"
#include "assets.h"

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
    u8 i, j;

    for (j = 0; j < SCRIPT_STACK_SIZE; j++)
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
        for (j = 0; j < SCRIPT_STACK_SIZE; j++)
        {
            script_stack[j] = update_ctxs[i].stack[j];
            script_start_stack[j] = update_ctxs[i].start_stack[j];
        }
        script_stack_ptr = update_ctxs[i].stack_ptr;
        script_actor = update_ctxs[i].actor;
        wait_time = update_ctxs[i].wait_time;
        script_action_complete = update_ctxs[i].action_complete;

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
        for (j = 0; j < SCRIPT_STACK_SIZE; j++)
        {
            update_ctxs[i].stack[j] = script_stack[j];
            update_ctxs[i].start_stack[j] = script_start_stack[j];
        }
        update_ctxs[i].stack_ptr = script_stack_ptr;
        update_ctxs[i].wait_time = wait_time;
        update_ctxs[i].action_complete = script_action_complete;
    }

    /* Restore the foreground's own live state - none of the above is ever
     * visible to it, and it was never touched while idle. */
    script_ptr = fg_ptr;
    script_start_ptr = fg_start_ptr;
    for (j = 0; j < SCRIPT_STACK_SIZE; j++)
    {
        script_stack[j] = fg_stack[j];
        script_start_stack[j] = fg_start_stack[j];
    }
    script_stack_ptr = fg_stack_ptr;
    script_actor = fg_actor;
    wait_time = fg_wait_time;
    script_action_complete = fg_action_complete;
}
