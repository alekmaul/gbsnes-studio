#ifndef CAMERA_H
#define CAMERA_H

/*
 * Camera (M5; v4 deadzone follow-up). GB keeps camera_settings / camera_dest
 * / camera_speed in ScriptRunner + Scene; here the state and the per-frame
 * step live in game.c (CameraUpdate, called from the main loop). Default is
 * LOCK = follow the player, clamped to the scene bounds, same as the GB
 * engine - CAMERA_LOCK_X_FLAG/CAMERA_LOCK_Y_FLAG are independent per-axis
 * bits (ported from GB's real camera.h constants verbatim, including the
 * 0x03 combined value) even though nothing on this fork's script side locks
 * one axis without the other yet.
 *
 * camera_deadzone_x/y (a follow window's pixel half-width around the
 * player) and camera_offset_x/y (a fixed shift of that window's centre) are
 * GB's own real camera-slack model (appData/src/gb/src/core/camera.c in the
 * v3.2.1 reference) - each genre's own Start_<Genre>() (scene.c) sets both
 * to its GB-matching defaults every scene load (0 for Top Down, an 8px
 * deadzone for Adventure, 4x/16y for Platform, 24 for Point and Click, a
 * scroll-direction-biased offset for Shmup) - there is still no scripting
 * event to set them, matching GB 3.2.1 exactly (no such event exists there
 * either, only genre-state defaults).
 */
#include <snes.h>

#define CAMERA_LOCK_X_FLAG 0x01
#define CAMERA_LOCK_Y_FLAG 0x02
#define CAMERA_LOCK_FLAG   0x03  /* both axes */
#define CAMERA_UNLOCKED    0x00
#define CAMERA_SPEED_MASK  0x1F

extern u8 camera_settings;
extern s16 camera_x, camera_y;
extern s16 camera_dest_x, camera_dest_y;
extern s8 camera_deadzone_x, camera_deadzone_y;
extern s8 camera_offset_x, camera_offset_y;
extern u8 camera_script_wait;   /* CAMERA_MOVE_TO / CAMERA_LOCK is blocking */

void CameraInit(void);                          /* lock, snap to player */
void CameraMoveTo(s16 px, s16 py, u8 settings); /* unlock, pan to a point */
void CameraLock(u8 settings);                   /* follow the player again */
void CameraUpdate(void);                        /* once per frame */

#endif
