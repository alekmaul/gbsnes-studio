#ifndef RPN_H
#define RPN_H

/*
 * M3 (v4) - RPN math-expression evaluator.
 *
 * GB Studio 3.x's GBVM has a real value stack and a VM_RPN meta-instruction
 * whose "args" are a variable-length sub-program of .R_REF/.R_INT16/
 * .R_OPERATOR/.R_STOP micro-ops, interpreted one at a time by the VM. This
 * engine's own dispatch loop (script_runner.c) has no equivalent: every
 * opcode has a compile-time-fixed args_len (script_cmd_arg_lens[]) and
 * ADVANCE() always skips exactly `1 + script_cmd_args_len` bytes - there is
 * no "opcode consumes a self-described number of trailing bytes" mechanism
 * to build on, and adding one would touch every existing opcode.
 *
 * So instead each GBVM micro-op becomes its own top-level opcode here
 * (RPN_PUSH_CONST / RPN_PUSH_VAR / RPN_OPERATOR), each with its own small
 * fixed args_len like any other opcode - the compiler
 * (src/lib/helpers/rpn/ + scriptBuilder.js's _rpnEmit) walks the
 * shunting-yard output and emits one such opcode per token instead of one
 * opcode carrying a whole sub-program. IF_EXPRESSION / RPN_SET_VARIABLE
 * consume the final result left on the stack.
 *
 * The operator codes below (RPN_OP_*) are a from-scratch numbering, not
 * GBVM's - kept in sync by convention with RPN_OPERATOR_LOOKUP /
 * RPN_FUNCTION_LOOKUP in src/lib/compiler/helpers.js (mirrors how the
 * opcode table itself is kept in sync with scriptCommands.js).
 */
#include "gbs_types.h"

#define RPN_OP_DIV 0
#define RPN_OP_MUL 1
#define RPN_OP_ADD 2
#define RPN_OP_SUB 3 /* also unary minus - the JS tokenizer lowers "-x" to "0 x SUB" */
#define RPN_OP_MOD 4
#define RPN_OP_AND 5
#define RPN_OP_OR 6
#define RPN_OP_XOR 7
#define RPN_OP_NOT 8 /* unary, bitwise ~ */
#define RPN_OP_EQ 9
#define RPN_OP_NE 10
#define RPN_OP_LT 11
#define RPN_OP_LTE 12
#define RPN_OP_GT 13
#define RPN_OP_GTE 14
#define RPN_OP_LAND 15
#define RPN_OP_LOR 16
#define RPN_OP_MIN 17
#define RPN_OP_MAX 18
#define RPN_OP_ABS 19 /* unary */

/* Variables (script_variables[]) are u8, wrapping on overflow just like the
 * existing MATH_ADD/SUB/etc opcodes - the eval stack itself is s16 so an
 * expression can go through a negative/out-of-range intermediate result
 * (e.g. "$a$ - $b$" where b > a) before a final comparison or truncated
 * store. */
void RpnPush(s16 value);
s16 RpnPop(void);
void RpnApplyOperator(u8 op);

#endif
