/*
 * v2 M5a: genre dispatch tables. See states.h.
 */
#include "states.h"

void (*const startFuncs[])(void) = {Start_TopDown};
void (*const updateFuncs[])(void) = {Update_TopDown};
