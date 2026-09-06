/*---------------------------------------------------------------------------------
    Cartridge SRAM save game - see save.h for the design (header + variables,
    via PVSnesLib's consoleCopySramWithOffset/consoleLoadSramWithOffset since
    there's no raw SRAM pointer on this toolchain, unlike GB's 0xA000 window).
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "save.h"
#include "scene.h"
#include "script_runner.h"

typedef struct
{
    u8 exists;
    u16 scene_index;
    u8 tile_x, tile_y;
    s8 dir_x, dir_y;
} SAVE_HEADER;

#define SAVE_VARS_OFFSET ((u16)sizeof(SAVE_HEADER))

u8 SaveDataExists(void)
{
    u8 exists = 0;
    consoleLoadSramWithOffset(&exists, 1, 0);
    // Exact equality, not truthiness: a never-written cartridge's SRAM reads
    // back as random garbage (confirmed via Mesen - a freshly created save
    // file is NOT zero-filled), so "nonzero" would read as "save exists" on
    // ~255/256 fresh carts. Matches the GB engine's own `*RAMPtr == TRUE`
    // check (ScriptRunner_b.c) - same 1/256 residual false-positive odds GB
    // already accepts, not a new gap introduced here.
    return exists == 1;
}

void SaveGameData(void)
{
    SAVE_HEADER header;
    header.exists = 1;
    header.scene_index = scene_index;
    header.tile_x = (u8)SceneActorTileX(0);
    header.tile_y = (u8)SceneActorTileY(0);
    header.dir_x = actors[0].dir_x;
    header.dir_y = actors[0].dir_y;

    consoleCopySramWithOffset((u8 *)&header, sizeof(header), 0);
    consoleCopySramWithOffset(script_variables, NUM_VARIABLES + 1, SAVE_VARS_OFFSET);
}

void ClearGameData(void)
{
    u8 notExists = 0;
    consoleCopySramWithOffset(&notExists, 1, 0);
}

u8 LoadGameData(void)
{
    SAVE_HEADER header;

    if (!SaveDataExists())
    {
        return 0;
    }

    consoleLoadSramWithOffset((u8 *)&header, sizeof(header), 0);
    consoleLoadSramWithOffset(script_variables, NUM_VARIABLES + 1, SAVE_VARS_OFFSET);

    /* dir code 1 (down) is a placeholder - SceneRequestSwitch's dir_to_vec
     * result is overwritten right after with the actual saved facing, same
     * trick SceneStackPop (scene.c) uses. */
    SceneRequestSwitch(header.scene_index, header.tile_x, header.tile_y, 1);
    map_next_dir_x = header.dir_x;
    map_next_dir_y = header.dir_y;
    return 1;
}
