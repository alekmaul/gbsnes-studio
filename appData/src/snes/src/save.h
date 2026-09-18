#ifndef SAVE_H
#define SAVE_H

/*
 * LOAD_DATA / SAVE_DATA / CLEAR_DATA / IF_SAVED_DATA - cartridge SRAM save
 * game, ported from appData/src/gb/src/ScriptRunner_b.c's Script_*Data_b.
 *
 * GB reads/writes a fixed CPU address window (0xA000) that the MBC maps to
 * whichever SRAM bank is enabled. PVSnesLib has no such pointer - SRAM is
 * only reachable through consoleCopySramWithOffset/consoleLoadSramWithOffset
 * (pvsneslib/include/snes/console.h), which bank-switch to $70 internally
 * per call. So instead of a raw pointer + header struct like GB, this saves
 * a small header (save-exists flag, scene index, player tile pos + facing)
 * at the slot's SRAM offset, then script_variables[] right after it - the
 * same header-then-variables split GB uses, just via function calls instead
 * of a pointer.
 *
 * GB does NOT save anything else (other actors, scene stack, timers, input
 * scripts, ...) - matched here for parity, not because it's the only
 * reasonable design.
 *
 * NUM_SAVE_SLOTS independent slots, each its own fixed-size region
 * (SAVE_SLOT_SIZE bytes) starting at `slot * SAVE_SLOT_SIZE`. 3 slots x
 * ~137 bytes is under 1% of even the smallest configurable cartridge SRAM
 * (1 KB) - no budget concern. `slot` is clamped to a valid index so a
 * corrupt/out-of-range byte can't read or write outside the reserved
 * save region.
 */
#include "gbs_types.h"

#define NUM_SAVE_SLOTS 3

u8 SaveDataExists(u8 slot);
void SaveGameData(u8 slot);
void ClearGameData(u8 slot);

/* If a save exists in this slot: restores script_variables[], requests the
 * saved scene switch (SceneRequestSwitch + the same fade handshake
 * SWITCH_SCENE uses) and returns 1 - the caller must NOT ADVANCE() the
 * script on this path, same as SWITCH_SCENE (SceneRequestSwitch already
 * zeroes script_ptr). Returns 0 (nothing done) if no save exists. */
u8 LoadGameData(u8 slot);

#endif
