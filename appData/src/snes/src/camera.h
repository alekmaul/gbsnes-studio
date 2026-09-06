#ifndef CAMERA_H
#define CAMERA_H

/*
 * Camera (M5). GB keeps camera_settings / camera_dest / camera_speed in
 * ScriptRunner + Scene; here the state and the per-frame step live in game.c
 * (CameraUpdate, called from the main loop). Default is LOCK = follow the
 * player, clamped to the scene bounds, same as the GB engine.
 */
#include <snes.h>

#define CAMERA_LOCK_FLAG  0x80
#define CAMERA_SPEED_MASK 0x1F

extern u8 camera_settings;
extern s16 camera_x, camera_y;
extern s16 camera_dest_x, camera_dest_y;
extern u8 camera_script_wait;   /* CAMERA_MOVE_TO / CAMERA_LOCK is blocking */

void CameraInit(void);                          /* lock, snap to player */
void CameraMoveTo(s16 px, s16 py, u8 settings); /* unlock, pan to a point */
void CameraLock(u8 settings);                   /* follow the player again */
void CameraUpdate(void);                        /* once per frame */

#endif
