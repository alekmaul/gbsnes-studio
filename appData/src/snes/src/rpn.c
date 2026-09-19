/*---------------------------------------------------------------------------------
    RPN math-expression evaluator - see rpn.h for the design note.
---------------------------------------------------------------------------------*/
#include "rpn.h"

#define RPN_STACK_SIZE 8

static s16 rpn_stack[RPN_STACK_SIZE];
static u8 rpn_sp = 0;

void RpnPush(s16 value)
{
    if (rpn_sp < RPN_STACK_SIZE)
    {
        rpn_stack[rpn_sp] = value;
        rpn_sp++;
    }
}

s16 RpnPop(void)
{
    if (rpn_sp == 0)
    {
        return 0;
    }
    rpn_sp--;
    return rpn_stack[rpn_sp];
}

/* One flat switch, no nesting - a 3+-term &&/|| chain in an `if`/`while`
 * guard is known to mis-link branches under 816-tcc (see CLAUDE.md), so
 * RPN_OP_LAND/RPN_OP_LOR are built from nested ternaries instead of a
 * multi-term boolean guard. */
void RpnApplyOperator(u8 op)
{
    s16 a, b;
    switch (op)
    {
    case RPN_OP_NOT:
        a = RpnPop();
        RpnPush(~a);
        break;
    case RPN_OP_ABS:
        a = RpnPop();
        RpnPush(a < 0 ? -a : a);
        break;
    case RPN_OP_DIV:
        b = RpnPop();
        a = RpnPop();
        RpnPush(b != 0 ? a / b : 0);
        break;
    case RPN_OP_MUL:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a * b);
        break;
    case RPN_OP_ADD:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a + b);
        break;
    case RPN_OP_SUB:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a - b);
        break;
    case RPN_OP_MOD:
        b = RpnPop();
        a = RpnPop();
        RpnPush(b != 0 ? a % b : 0);
        break;
    case RPN_OP_AND:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a & b);
        break;
    case RPN_OP_OR:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a | b);
        break;
    case RPN_OP_XOR:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a ^ b);
        break;
    case RPN_OP_EQ:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a == b ? 1 : 0);
        break;
    case RPN_OP_NE:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a != b ? 1 : 0);
        break;
    case RPN_OP_LT:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a < b ? 1 : 0);
        break;
    case RPN_OP_LTE:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a <= b ? 1 : 0);
        break;
    case RPN_OP_GT:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a > b ? 1 : 0);
        break;
    case RPN_OP_GTE:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a >= b ? 1 : 0);
        break;
    case RPN_OP_LAND:
        b = RpnPop();
        a = RpnPop();
        RpnPush((a != 0) ? (b != 0 ? 1 : 0) : 0);
        break;
    case RPN_OP_LOR:
        b = RpnPop();
        a = RpnPop();
        RpnPush((a != 0) ? 1 : (b != 0 ? 1 : 0));
        break;
    case RPN_OP_MIN:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a < b ? a : b);
        break;
    case RPN_OP_MAX:
        b = RpnPop();
        a = RpnPop();
        RpnPush(a > b ? a : b);
        break;
    default:
        break;
    }
}
