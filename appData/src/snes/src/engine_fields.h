#ifndef ENGINE_FIELDS_H
#define ENGINE_FIELDS_H

/*
 * Engine Fields (v4) - per-project tunable engine constants, mirroring GB
 * Studio 3.2.1's engine.json -> Settings page mechanism (appData/src/snes/
 * engine.json is the schema: key/group/type/min/max/defaultValue, read by
 * useGroupedEngineFields.ts/EngineFieldsEditor.tsx to build the Settings UI
 * - that whole chain already existed and worked, engine.json's `"fields": []`
 * was just never populated until now).
 *
 * GB Studio 3.2.1's real engine writes a chosen value into these globals at
 * boot, via a GBVM assembly routine generated from the schema
 * (compileBootstrap.ts's `_script_engine_init`). This engine has no such VM
 * injection point (no GBVM), so compileSnesData.js bakes the chosen value
 * straight into a generated src/engine_fields.c initializer instead - same
 * end result (a real, still-mutable global), simpler mechanism for this
 * target: no init call needed, 816-tcc just links the real value in.
 *
 * Every key here must match an engine.json field's own `key` exactly -
 * compileSnesData.js emits one `<cType> <key> = <value>;` line per schema
 * entry, in schema order, so scene.c (or wherever a field is actually used)
 * only ever needs `extern` here, never a hardcoded default of its own.
 */
#include "gbs_types.h"

extern u8 topdown_grid;

extern s16 plat_min_vel;
extern s16 plat_walk_vel;
extern s16 plat_run_vel;
extern s16 plat_walk_acc;
extern s16 plat_run_acc;
extern s16 plat_dec;
extern s16 plat_jump_vel;
extern s16 plat_grav;
extern s16 plat_hold_grav;
extern s16 plat_max_fall_vel;

/* v4 follow-up: previously this genre's auto-scroll just reused the player
 * actor's own move_speed (conflating two different things B keeps separate
 * - see Update_Shmup's own comment in scene.c). Now a real, independently
 * configurable field, matching GB Studio's real shooter_scroll_speed. */
extern u8 shooter_scroll_speed;

#endif
