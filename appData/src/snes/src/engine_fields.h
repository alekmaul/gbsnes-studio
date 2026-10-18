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
 * end result (a real, still-mutable value), simpler mechanism for this
 * target: no init call needed, 816-tcc just links the real value in.
 *
 * Storage (v4 follow-up): one little-endian byte array, engine_fields_raw[],
 * rather than a separate C global per field - the ENGINE_FIELD_UPDATE/
 * UPDATE_WORD/UPDATE_VAR/UPDATE_VAR_WORD/STORE/STORE_WORD opcodes
 * (script_cmds.c) let a script read/write a field *at runtime*, addressed
 * by the same byte offset the compiler computes (src/lib/helpers/
 * engineFields.ts's precompileEngineFields() - cumulative byte size in
 * engine.json's own field order, 1 byte for UBYTE/BYTE, 2 for UWORD/WORD).
 * A named global has no such runtime address an opcode could target, hence
 * the switch to one packed array. Every macro below is a transparent lvalue
 * (`*(s16 *)&engine_fields_raw[N]` etc.) so every existing consumer
 * (scene.c's Update_TopDown/Update_Platform/Update_Shmup) keeps reading/
 * writing the plain field name unchanged - only this header's definition of
 * that name changed, not any call site. 65816 is little-endian, matching a
 * plain `s16`/`u16` store at that byte offset directly (no manual hi/lo
 * combining needed here - script_cmds.c's opcode handlers do that, since
 * the wire format itself is big-endian, matching every other opcode's
 * ARG16() convention).
 *
 * Every key here must match an engine.json field's own `key` exactly, and
 * every offset must match precompileEngineFields()'s real computed value
 * for the current engine.json - guarded by test/helpers/engineFieldsOffsets.
 * test.js, not just this comment. Changing engine.json's field list/order
 * means updating both ENGINE_FIELDS_SIZE and every offset below by hand.
 */
#include "gbs_types.h"

#define ENGINE_FIELDS_SIZE 22
extern u8 engine_fields_raw[ENGINE_FIELDS_SIZE];

#define topdown_grid          (engine_fields_raw[0])

#define plat_min_vel          (*(s16 *)&engine_fields_raw[1])
#define plat_walk_vel         (*(s16 *)&engine_fields_raw[3])
#define plat_run_vel          (*(s16 *)&engine_fields_raw[5])
#define plat_walk_acc         (*(s16 *)&engine_fields_raw[7])
#define plat_run_acc          (*(s16 *)&engine_fields_raw[9])
#define plat_dec              (*(s16 *)&engine_fields_raw[11])
#define plat_jump_vel         (*(s16 *)&engine_fields_raw[13])
#define plat_grav             (*(s16 *)&engine_fields_raw[15])
#define plat_hold_grav        (*(s16 *)&engine_fields_raw[17])
#define plat_max_fall_vel     (*(s16 *)&engine_fields_raw[19])

/* v4 follow-up: previously this genre's auto-scroll just reused the player
 * actor's own move_speed (conflating two different things B keeps separate
 * - see Update_Shmup's own comment in scene.c). Now a real, independently
 * configurable field, matching GB Studio's real shooter_scroll_speed. */
#define shooter_scroll_speed  (engine_fields_raw[21])

#endif
