#ifndef SCRIPT_RUNNER_H
#define SCRIPT_RUNNER_H

/*
 * Bytecode VM. Ported from appData/src/gb/src/ScriptRunner.c + ScriptRunner_b.c.
 *
 * The opcode -> handler dispatch table (script_cmds[]) MUST keep the exact
 * index order of src/lib/events/scriptCommands.js. Handlers advance script_ptr
 * by `1 + script_cmd_args_len`; unimplemented ones point at Script_Noop_b so
 * the pointer still advances correctly.
 *
 * D4: script_ptr is a far pointer walked within one section; the 7-byte arg
 * read is a plain indexed far read, no PUSH_BANK / ReadBankedUBYTE.
 */
#include "gbs_types.h"

#define SCRIPT_STACK_SIZE 8
#define SCRIPT_CMD_COUNT 94

extern const unsigned char *script_ptr;
extern const unsigned char *script_start_ptr;
extern u8 script_cmd_args[7];
extern u8 script_cmd_args_len;
extern u16 script_ptr_x, script_ptr_y;
extern u8 script_action_complete;
extern u8 script_continue;
extern u8 script_actor;
extern u16 await_input;
extern u8 wait_time;
extern u8 shake_time;
extern SCRIPT_CMD_FN last_fn;

extern const unsigned char *script_stack[SCRIPT_STACK_SIZE];
extern const unsigned char *script_start_stack[SCRIPT_STACK_SIZE];
extern u8 script_stack_ptr;

/* Kept as two parallel arrays, not an array of {fn, args_len} structs: a far
 * read of a mixed-size struct field mis-indexes under 816-tcc. */
extern const SCRIPT_CMD_FN script_cmds[SCRIPT_CMD_COUNT];
extern const u8 script_cmd_arg_lens[SCRIPT_CMD_COUNT];

/* Provided by game.c */
extern ACTOR actors[MAX_ACTORS];
extern u8 script_variables[NUM_VARIABLES + 1];
extern u16 joy;

void ScriptStart(BANK_PTR *events);
void ScriptRunnerUpdate(void);
/* Per-frame: decrement wait/shake timers (SceneHandleWait equivalent) */
void ScriptUpdateTimers(void);

#endif
