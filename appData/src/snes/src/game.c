/*---------------------------------------------------------------------------------

    GB Studio - SNES (PVSnesLib) engine - main loop

    M3  video + input foundation (Mode 1 BG, OAM player, d-pad, camera scroll)
    M4  bytecode VM (script_runner.c / script_cmds.c)
    M4b Scene loader (scene.c) - scenes from a data blob, NPC actors, triggers,
        SWITCH_SCENE
    M4c tile-locked actor movement, collision bitmap, ACTOR_MOVE_TO family,
        simple NPC AI
    M5  dialogue box (BG3, ui.c), screen fades (fade.c), camera pan/lock/shake

    Maps to appData/src/gb/src/game.c:
      game_loop()  -> the ordered calls below
      stage switch -> the scene_index != scene_next_index check, gated on !IsFading
      vbl_update() -> UIFlush() right after WaitForVBlank

    Still to come: menus/choices/avatars/emotes (M5b), music + sound (M8).
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "assets.h"
#include "gbs_types.h"
#include "script_runner.h"
#include "scene.h"
#include "fade.h"
#include "ui.h"
#include "camera.h"
#include "music.h"

#define SCREEN_W_HALF 128
#define SCREEN_H_HALF 112

// --- engine state shared with the VM / Scene (see the *.h externs) ---
ACTOR actors[MAX_ACTORS];
u8 script_variables[NUM_VARIABLES + 1];
u16 joy;
u16 prev_joy;
u8 time;
s16 scroll_x;
s16 scroll_y;

// --- camera (camera.h) ---
u8 camera_settings = CAMERA_LOCK_FLAG;
s16 camera_x, camera_y;
s16 camera_dest_x, camera_dest_y;
u8 camera_script_wait = 0;
static u8 camera_speed = 0;

// SWITCH_SCENE fade handshake (set by Script_LoadScene_b)
u8 scene_fade_pending = 0;
u8 scene_fade_speed = 1;

static s16 clamp16(s16 v, s16 lo, s16 hi)
{
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static s16 cam_max_x(void)
{
    s16 m = (s16)scene_width * 8 - 256;
    if (m < 0) m = 0;
    return m;
}

static s16 cam_max_y(void)
{
    s16 m = (s16)scene_height * 8 - 224;
    if (m < 0) m = 0;
    return m;
}

void CameraInit(void)
{
    camera_settings = CAMERA_LOCK_FLAG;
    camera_speed = 0;
    camera_script_wait = 0;
    camera_x = clamp16(actors[0].x - SCREEN_W_HALF, 0, cam_max_x());
    camera_y = clamp16(actors[0].y - SCREEN_H_HALF, 0, cam_max_y());
    camera_dest_x = camera_x;
    camera_dest_y = camera_y;
}

void CameraMoveTo(s16 px, s16 py, u8 settings)
{
    camera_settings = settings & ~CAMERA_LOCK_FLAG;
    camera_speed = settings & CAMERA_SPEED_MASK;
    camera_dest_x = clamp16(px, 0, cam_max_x());
    camera_dest_y = clamp16(py, 0, cam_max_y());
}

void CameraLock(u8 settings)
{
    camera_settings = CAMERA_LOCK_FLAG;
    camera_speed = settings & CAMERA_SPEED_MASK;
}

static void cam_step(s16 *cur, s16 dest, s16 amount)
{
    s16 c = *cur;
    if (c < dest)
    {
        c += amount;
        if (c > dest) c = dest;
    }
    else if (c > dest)
    {
        c -= amount;
        if (c < dest) c = dest;
    }
    *cur = c;
}

void CameraUpdate(void)
{
    s16 sx, sy;
    s16 amount;

    if (camera_settings & CAMERA_LOCK_FLAG)
    {
        camera_dest_x = clamp16(actors[0].x - SCREEN_W_HALF, 0, cam_max_x());
        camera_dest_y = clamp16(actors[0].y - SCREEN_H_HALF, 0, cam_max_y());
    }

    amount = 1;
    if (camera_speed == 0)
    {
        amount = 256; // effectively instant
    }
    else if (camera_speed == 1)
    {
        amount = 2;
    }
    cam_step(&camera_x, camera_dest_x, amount);
    cam_step(&camera_y, camera_dest_y, amount);

    if (camera_script_wait)
    {
        if (camera_x == camera_dest_x && camera_y == camera_dest_y)
        {
            camera_script_wait = 0;
            script_action_complete = 1;
        }
    }

    sx = camera_x;
    sy = camera_y;
    if (shake_time != 0)
    {
        if (time & 2) sx += 2;
        else sx -= 2;
    }
    scroll_x = sx;
    scroll_y = sy;
    bgSetScroll(0, (u16)sx, (u16)sy);
}

int main(void)
{
    u16 i;

    for (i = 0; i < MAX_ACTORS; i++)
    {
        actors[i].enabled = 0;
    }
    for (i = 0; i <= NUM_VARIABLES; i++)
    {
        script_variables[i] = 0;
    }

    // One-time video setup. Sprite gfx + the BG3 text layer are uploaded once;
    // the scene BG (BG1 tiles + map + palette + size) is uploaded per scene by
    // SceneInit (M6). The screen stays force-blanked (bgInitTileSetData in
    // UIInit) until the first SceneInit has loaded VRAM.
    oamClear(0, 128);
    // OBJ tiles at VRAM 0x4000 (0x0000-0x0FFF is BG1 map, 0x2000 BG1 tiles,
    // 0x3000 BG3 font). Up to 8 actor sprites, slot k at grid tiles 2k..2k+17.
    /* The OBJ tile sheet + its 8-palette CGRAM image (which now bakes in the
     * emote and dialogue-avatar palettes at OBJ pal 1 / 2) are per-scene:
     * SceneInit uploads scene_index's. This boot call just sets the OBJ VRAM
     * base / sprite size and seeds the start scene's data. */
    oamInitGfxSet((u8 *)scene_spr_ptrs[START_SCENE], SPR_TILES_SIZE,
                  (u8 *)scene_spr_pal_ptrs[START_SCENE], SPR_PAL_SIZE, 0,
                  0x4000, OBJ_SIZE8_L16);
    UIInit();
    bgSetGfxPtr(0, 0x2000);
    bgSetMapPtr(0, 0x0000, SC_32x32);
    // Mode 1, BG3 at high priority so the dialogue box sits over the scene.
    setMode(BG_MODE1, BG3_MODE1_PRIORITY_HIGH);
    bgSetDisable(1); // BG2 unused
    FadeInit();
    SceneScheduledScriptsInit(); // zero input_script_ptrs[] - not pre-zeroed by the toolchain
    MusicInit(); // boots the SPC700 driver (M8 phase 1) - takes a moment

    // Start position (assets.h: START_SCENE / START_X / START_Y / START_DIR).
    scene_next_index = START_SCENE;
    map_next_x = START_X;
    map_next_y = START_Y;
    {
        s8 dx, dy;
        dir_to_vec(START_DIR, &dx, &dy);
        map_next_dir_x = dx;
        map_next_dir_y = dy;
    }

    while (1)
    {
        WaitForVBlank();
        UIFlush();

        joy = padsCurrent(0);

        if (!scene_loaded || scene_index != scene_next_index)
        {
            if (!IsFading())
            {
                scene_index = scene_next_index;
                SceneInit();
                CameraInit();
                if (scene_fade_pending)
                {
                    scene_fade_pending = 0;
                    FadeSetSpeed(scene_fade_speed);
                    FadeIn();
                }
            }
        }

        FadeUpdate();
        SceneUpdateTimerScript();

        if (UIIsClosed())
        {
            SceneHandleInput();
        }
        ScriptRunnerUpdate();
        ScriptUpdateTimers();
        SceneUpdate();
        UIUpdate();
        CameraUpdate();

        spcProcess(); // must run every frame - streams soundbank data to the APU

        prev_joy = joy;
        time++;
    }
    return 0;
}
