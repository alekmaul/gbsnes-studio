/*---------------------------------------------------------------------------------
    Bytecode VM core - ported from appData/src/gb/src/ScriptRunner.c

    Differences from the Game Boy version (D4):
      - script_ptr / script_start_ptr are far pointers, not 0x4000-window u16
      - the 7-byte arg block is read with an indexed far loop, not memcpy from a
        banked address after PUSH_BANK
      - ScriptRunnerUpdate is iterative, not recursive (65816 stack headroom)
---------------------------------------------------------------------------------*/
#include "script_runner.h"
#include "scene.h"

const unsigned char *script_ptr = 0;
const unsigned char *script_start_ptr = 0;
u8 script_cmd_args[7] = {0};
u8 script_cmd_args_len = 0;
u16 script_ptr_x = 0;
u16 script_ptr_y = 0;
u8 script_action_complete = 1;
u8 script_continue = 0;
u8 script_actor = 0;
u8 await_input = 0;
u8 wait_time = 0;
u8 shake_time = 0;
SCRIPT_CMD_FN last_fn = 0;

const unsigned char *script_stack[SCRIPT_STACK_SIZE] = {0};
const unsigned char *script_start_stack[SCRIPT_STACK_SIZE] = {0};
u8 script_stack_ptr = 0;

void ScriptStart(BANK_PTR *events)
{
    script_ptr = events->ptr;
    script_start_ptr = script_ptr;
    script_action_complete = 1;
    script_continue = 0;
    last_fn = 0;
}

// SceneHandleWait / SceneUpdateCameraShake_b - the timer side of blocking ops
void ScriptUpdateTimers(void)
{
    if (wait_time != 0)
    {
        wait_time--;
        if (wait_time == 0)
        {
            script_action_complete = 1;
        }
    }
    if (shake_time != 0)
    {
        shake_time--;
        if (shake_time == 0)
        {
            script_action_complete = 1;
        }
    }
    if (await_input != 0)
    {
        // Cleared as soon as it fires - unlike the GB engine (which gates on
        // last_fn instead), nothing here tracks which opcode is paused, so a
        // stale non-zero mask would wrongly complete a later, unrelated
        // blocking opcode the next time that button is pressed.
        if (SceneGbInputBits(joy) & await_input)
        {
            await_input = 0;
            script_action_complete = 1;
        }
    }
}

void ScriptRunnerUpdate(void)
{
    u8 idx, i;

    if (!script_ptr || !script_action_complete)
    {
        return;
    }

    do
    {
        script_continue = 0;

        idx = script_ptr[0];
        if (!idx)
        {
            // Implicit end-of-script terminator (compileEntityEvents pushes 0)
            if (script_stack_ptr)
            {
                script_stack_ptr--;
                script_ptr = script_stack[script_stack_ptr];
                script_start_ptr = script_start_stack[script_stack_ptr];
                script_continue = 1;
                continue;
            }
            script_ptr = 0;
            return;
        }

        script_cmd_args_len = script_cmd_arg_lens[idx];
        for (i = 0; i < 7; i++)
        {
            script_cmd_args[i] = script_ptr[1 + i];
        }

        last_fn = script_cmds[idx];
        script_cmds[idx]();
    } while (script_continue);
}
