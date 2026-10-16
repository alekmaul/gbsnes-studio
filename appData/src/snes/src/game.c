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
#include "mosaic.h"
#include "ui.h"
#include "camera.h"
#include "music.h"
#include "parallax.h"

#define SCREEN_W_HALF 128
#define SCREEN_H_HALF 112

// --- engine state shared with the VM / Scene (see the *.h externs) ---
ACTOR actors[MAX_ACTORS];
u8 script_variables[NUM_VARIABLES + 1];
u16 joy;
u16 prev_joy;
u8 time;
s16 scroll_x = 0;
s16 scroll_y = 0;

// --- camera (camera.h) ---
u8 camera_settings = CAMERA_LOCK_FLAG;
s16 camera_x, camera_y;
s16 camera_dest_x, camera_dest_y;
s8 camera_deadzone_x = 0, camera_deadzone_y = 0;
s8 camera_offset_x = 0, camera_offset_y = 0;
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
    scroll_x = camera_x;
    scroll_y = camera_y;
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
    s16 target, lo, hi, center;

    /* GB's real camera_update() (v3.2.1 core/camera.c): only push the camera
     * when the player leaves a deadzone window around the current camera
     * centre - deadzone 0 (Top Down's default) makes this degenerate back
     * to the old hard lock exactly (lo == hi == target, any drift snaps
     * straight back). offset_x/y shift the window itself (Shmup's
     * scroll-direction bias); both are 0 unless the scene's genre
     * Start_<Genre>() set them. This engine's camera_x/y hold the scroll
     * (left-edge) value, unlike GB's own camera_x/y, which hold a screen-
     * centre value (scroll = camera_x - halfscreen, see GB's own scroll.c);
     * the SCREEN_W_HALF/SCREEN_H_HALF add/subtract below convert between the
     * two conventions, everything else below is GB's formula unchanged. */
    if (camera_settings & CAMERA_LOCK_X_FLAG)
    {
        target = actors[0].x - camera_offset_x;
        lo = target - camera_deadzone_x;
        hi = target + camera_deadzone_x;
        center = camera_x + SCREEN_W_HALF;
        if (center < lo) center = lo;
        else if (center > hi) center = hi;
        camera_dest_x = clamp16(center - SCREEN_W_HALF, 0, cam_max_x());
    }

    if (camera_settings & CAMERA_LOCK_Y_FLAG)
    {
        target = actors[0].y - camera_offset_y;
        lo = target - camera_deadzone_y;
        hi = target + camera_deadzone_y;
        center = camera_y + SCREEN_H_HALF;
        if (center < lo) center = lo;
        else if (center > hi) center = hi;
        camera_dest_y = clamp16(center - SCREEN_H_HALF, 0, cam_max_y());
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
    /* The BG1 scroll registers are written at the top of the main loop, during
     * vblank - writing them here (mid-frame, after all the script/actor work)
     * shears the lower part of the screen while the camera is moving. */
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
    //
    // v4 (user-asked): fixed, unified VRAM map - every region now lives at
    // the SAME address whether or not a scene routes through the Map Engine
    // (see scene.c's SceneInit), instead of BG1's tilemap previously
    // switching between 0x0000 (hand-rolled streaming/plain path) and
    // 0x6800 (Map Engine - PVSnesLib's own hardcoded address, map.h: "layer
    // address is: 6800 for Layer 1"). Also moves OBJ down to 0x0000 and BG3
    // (graphics + tilemap) up past BG1 entirely, freeing a much bigger
    // contiguous run for BG1's own tile graphics than the old layout's
    // single 0x1000-word page - BG1's real tile *budget*
    // (targets/snes.js maxTilesetTiles) was raised 256->1024 to use it
    // (the same follow-up, not a separate change): 1024 is also the real
    // hardware ceiling (a tilemap cell's tile-index field is only 10 bits -
    // snesgfx.js's packed tile|pal<<10|... format), so BG1's graphics
    // region now has exactly as much room as that format can ever address.
    //   OBJ gfx    0x0000-0x0FFF (256 4bpp tiles, SPR_TILES_SIZE)
    //   BG1 gfx    0x2000-0x5FFF (1024 4bpp tiles - the full tile-index range)
    //   BG3 gfx    0x6000-0x67FF (235 2bpp tiles: font/frame/cursor)
    //   BG1 map    0x6800-0x77FF (SC_64x64 budget, 4096 words - matches
    //              PVSnesLib's own Map Engine address exactly, so it never
    //              has to move depending on routing)
    //   BG3 map    0x7800-0x7FFF (SC_32x32, 1024 words needed of 2048 free)
    oamClear(0, 128);
    /* The OBJ tile sheet + its 8-palette CGRAM image (which now bakes in the
     * emote and dialogue-avatar palettes at OBJ pal 1 / 2) are per-scene:
     * SceneInit uploads scene_index's. This boot call just sets the OBJ VRAM
     * base / sprite size and seeds the start scene's data. */
    oamInitGfxSet((u8 *)scene_spr_ptrs[START_SCENE], SPR_TILES_SIZE,
                  (u8 *)scene_spr_pal_ptrs[START_SCENE], SPR_PAL_SIZE, 0,
                  OBJ_GFX_VRAM, OBJ_SIZE8_L16);
    UIInit();
    bgSetGfxPtr(0, BG1_GFX_VRAM);
    bgSetMapPtr(0, BG1_MAP_VRAM, SC_64x32);
    // Mode 1, BG3 at high priority so the dialogue box sits over the scene.
    setMode(BG_MODE1, BG3_MODE1_PRIORITY_HIGH);
    bgSetDisable(1); // BG2 unused
    FadeInit();
    MosaicInit();
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
        /* Apply the camera scroll computed last frame - in vblank, before the
         * PPU starts drawing - so it never shears the screen mid-render while
         * the camera is moving. Also keeps BG1 and the OAM sprite positions
         * (SceneRenderActors also reads scroll_x/y) in lockstep.
         *
         * v4 (Map Engine streaming, see the plan): a scene routed to
         * PVSnesLib's own Map Engine (map_engine_active, set by SceneInit)
         * uses mapVblank() instead - it writes BG1's VRAM tilemap window AND
         * BG1HOFS/VOFS itself from the x_pos/y_pos written below, so the
         * plain bgSetScroll + hand-rolled SceneStreamBackground this engine
         * otherwise uses would fight it over the same registers/VRAM. Never
         * true together with parallax_active (SceneInit's own routing
         * decision - see scene.c). */
        if (map_engine_active)
        {
            mapVblank();
        }
        else
        {
            bgSetScroll(0, (u16)scroll_x, (u16)scroll_y);
            // Horizontal background streaming (v4, scene.c) - a no-op unless
            // this scene's background is wider than the 64-tile VRAM window.
            // Must run here (during vblank, right after the scroll this frame
            // is about to show), same VRAM-safety reasoning as bgSetScroll
            // itself just above.
            SceneStreamBackground();
        }
        // M6 (v4): banded X-axis parallax (see parallax.c) - HDMA overrides
        // BG1HOFS per scanline band for the rest of this frame's active
        // picture; the plain bgSetScroll above still owns Y (and X for any
        // scene with no parallax at all, the overwhelmingly common case).
        if (parallax_active)
        {
            ParallaxUpdate();
        }
        UIFlush();

        /* SceneInit leaves the screen force-blanked; un-blank it here, the
         * frame after, so the opening script's UI (curtain, palette) has been
         * flushed to VRAM by the UIFlush above before anything shows. */
        if (scene_unblank_pending)
        {
            scene_unblank_pending = 0;
            FadeRestoreBrightness();
        }

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
        MosaicUpdate();
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

        if (map_engine_active)
        {
            /* mapUpdateCamera() is deliberately never called - it runs its
             * own independent deadzone-based camera-centering algorithm,
             * which would desync from this engine's own scripted camera the
             * instant the two disagree. Writing x_pos/y_pos directly from
             * the camera this frame just computed and calling mapUpdate()
             * (which only ever reads them) gets the streaming decision this
             * engine wants with no second camera in the loop. */
            x_pos = (u16)scroll_x;
            y_pos = (u16)scroll_y;
            mapUpdate();
        }

        spcProcess(); // must run every frame - streams soundbank data to the APU

        prev_joy = joy;
        time++;
    }
    return 0;
}
