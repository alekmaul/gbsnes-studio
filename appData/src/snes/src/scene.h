#ifndef SCENE_H
#define SCENE_H

/*
 * Scene loader + per-frame update. Ported from appData/src/gb/src/Scene.c +
 * Scene_b.c.
 *
 * M4b : scenes loaded from an index-based blob (assets.c: scenes[]),
 *       actors[] / triggers[], scene script, walk/action triggers, SWITCH_SCENE.
 * M4c : tile-locked actor movement, a scene collision bitmap, ACTOR_MOVE_TO /
 *       _RELATIVE / _TO_VALUE, IF_ACTOR_AT_POSITION, and simple NPC AI.
 *
 * Deferred to M5: fades, camera transitions, emotes, directional sprite frames
 * (the dummy sprite has no facing frames yet - only left/right flip is applied).
 */
#include "gbs_types.h"
#include "assets.h" /* SPRITE_SLOTS */

/* v4 (user-asked): fixed VRAM layout (words) - every region lives at the
 * SAME address whether or not a scene routes through the Map Engine
 * (scene.c's SceneInit), so no call site has to branch on that to pick a
 * destination. Shared between game.c (boot-time setup) and scene.c
 * (per-scene DMA + BgMapWordOffset's own base, StreamColumn below) -
 * named here instead of repeating hex literals so the two can't silently
 * drift apart again. BG3's own two regions (UI_FONT_VRAM/UI_MAP_VRAM) are
 * ui.c-local, not needed outside that file, but follow the exact same map:
 *   OBJ gfx   0x0000-0x1FFF (512 4bpp tiles, SPR_TILES_SIZE - M8.3 grew this
 *             from 256 to the full 2-OBJ-page budget, SPRITE_EDITOR_PROGRESS.md)
 *   BG1 gfx   0x2000-0x5FFF (1024 4bpp tiles - targets/snes.js
 *             maxTilesetTiles, also the real ceiling: a tilemap cell's own
 *             tile-index field is only 10 bits, snesgfx.js's packed
 *             tile|pal<<10|... format)
 *   BG3 gfx   0x6000-0x67FF (235 2bpp tiles - ui.c's UI_FONT_VRAM)
 *   BG1 map   0x6800-0x77FF (SC_64x64 budget, 4096 words - matches
 *             PVSnesLib's own Map Engine address, map.h: "layer address is
 *             6800 for Layer 1", so it never has to move by routing)
 *   BG3 map   0x7800-0x7FFF (SC_32x32, 1024 of 2048 words needed -
 *             ui.c's UI_MAP_VRAM) */
#define OBJ_GFX_VRAM 0x0000
#define BG1_GFX_VRAM 0x2000
#define BG1_MAP_VRAM 0x6800

/* Per-scene OBJ slot tables - SceneInit fills them from the scene blob's [32]
 * sprite table each load (see compileSnesData.js). sprite_slot_for_index points
 * at the current scene's project-sprite-index -> slot map (PLAYER_SET_SPRITE). */
extern u8 sprite_type_for_slot[SPRITE_SLOTS];
extern u8 sprite_frames_for_slot[SPRITE_SLOTS];
extern u8 sprite_pal_for_slot[SPRITE_SLOTS];
/* Real-metasprite groundwork (SPRITE_EDITOR_PROGRESS.md M7) - how many real
 * OAM hardware sprites one actor using this sheet slot needs. Every entry is
 * compile-time 1 today (compileSnesData.js has no multi-tile metasprite data
 * to size this from yet, M8) - scaffolding only, but already read for real
 * by SceneInit's actor_oam_base[] prefix sum below, so the render loop is
 * ready for a real per-slot cost the moment M8 starts emitting one. */
extern u8 sprite_oam_ids_for_slot[SPRITE_SLOTS];
extern const unsigned char *sprite_slot_for_index;

/* M8.3 (SPRITE_EDITOR_PROGRESS.md) - a slot's "extra" poses (anything beyond
 * its own primary/frame-0 pose), packed on demand per scene instead of at a
 * fixed compile-time offset - see scene.c's own header comment on these and
 * on actor_render_tile. Each byte is a HALF-tile-base (real VRAM tile index
 * = value << 1 - every placement from compileSnesData.js's
 * createScenePacker() is already 2-aligned, so the full 0-511 tile range
 * fits in one byte); 0 = this pose was never placed for this slot. */
extern u8 extra_pose_down_b[SPRITE_SLOTS];
extern u8 extra_pose_up_a[SPRITE_SLOTS];
extern u8 extra_pose_up_b[SPRITE_SLOTS];
extern u8 extra_pose_side_a[SPRITE_SLOTS];
extern u8 extra_pose_side_b[SPRITE_SLOTS];

/* M9.4 (SPRITE_EDITOR_PROGRESS.md): a slot using a free-form metasprite
 * sheet (Sprites page "Free-form (Metasprite)" mode) gets a real pointer
 * straight into the scene blob's own trailing per-slot frame-data section
 * (appended after extra_pose_side_b's own [40] table - see compileSnesData.js
 * and SceneInit's own parsing comment). NULL for every slot not using the
 * feature - the single existing condition SceneRenderActors branches on to
 * fall back to the untouched legacy single-OAM-per-pose path. Format per
 * slot: [frameOffset(u16) * sprite_frames_for_slot[slot]] (direct-indexed,
 * relative to the start of this slot's own frameOffset table), then for
 * each frame [entryCount(u8), entry*4 bytes {dx(s8),dy(s8),halfTileBase(u8),
 * flags(u8)}]. A pointer directly into the scene blob's own ROM-resident
 * data is safe for the scene's whole lifetime - the same pattern
 * sprite_slot_for_index already uses. */
extern const unsigned char *metasprite_frame_base[SPRITE_SLOTS];

/* Real per-actor OAM id base (SPRITE_EDITOR_PROGRESS.md M7) - a prefix sum
 * over sprite_oam_ids_for_slot[], computed once in SceneInit, replacing the
 * old incidental `i << 2` spacing (which reserved 4 ids/actor for no real
 * reason and happened to make EMOTE_OID/PROJECTILE_OID_BASE/AVATAR_OID
 * collide - AVATAR_OID and PROJECTILE_OID_BASE were the literal same
 * expression, a real pre-existing bug, fixed alongside this). Valid for
 * indices 0..scene_num_actors (the only ones SceneRenderActors ever visits -
 * see its own `i <= scene_num_actors` loop bound). */
extern u16 actor_oam_base[MAX_ACTORS];

/* M9.4 (SPRITE_EDITOR_PROGRESS.md): EMOTE_OID/PROJECTILE_OID_BASE/AVATAR_OID
 * used to be compile-time constants derived from MAX_ACTORS, correct only
 * because every actor_oam_base[] entry cost exactly 1 OAM id (4 bytes) -
 * the moment a real metasprite slot costs more, the real actor total can
 * exceed that fixed assumption while the old constants stayed put,
 * corrupting whichever of these came "right after" actors in the old
 * scheme. Now real runtime values, computed once in SceneInit right after
 * the actor_oam_base[] prefix-sum loop: actor_oam_total is that loop's own
 * final running total (the real byte-offset just past the last actor's
 * OAM range); emote/projectile/avatar are each placed right after the
 * previous one, same tight back-to-back scheme as before, just computed
 * instead of hand-picked. On every scene that exists today (every
 * sprite_oam_ids_for_slot[] entry still 1 everywhere), these compute to
 * the exact same values the old constants had. */
extern u16 actor_oam_total;
extern u16 emote_oid;
extern u16 projectile_oid_base;
extern u16 avatar_oid;

/* v4 fix (user-found: swapping sprite sheets at runtime left frames_len
 * stale - see Script_ActorSetSprite_b/Script_PlayerSetSprite_b in
 * script_cmds.c). Was file-local (static) to scene.c, only ever called from
 * SceneInit at actor spawn - exposed here so the runtime sprite-swap opcodes
 * can recompute it the same way instead of leaving the old sheet's value in
 * place. */
u8 frames_len_for(u8 sprite_type, u8 slot);

/* Dummy scenes reuse the M3 64x64 map (SceneInit's fallback when a scene
 * blob's width/height byte is 0 - dummy/test fixtures only, a real project
 * always populates both via compileSnesData.js). Left at 64x64 on purpose,
 * not tied to the collision buffer's own real ceiling below - this is a
 * "no size given" default, not a size cap. */
#define SCENE_TILE_W 64
#define SCENE_TILE_H 64

/* Real per-axis ceiling the collision bitmap is sized for - must match
 * targets/snes.js's maxBackgroundWidth/Height (in tiles, i.e. /8). Width
 * (255) is this engine's real horizontal-streaming ceiling (bg_map_w[] is
 * u8 - see compileSnesData.js/PERF.md); height (64) is SC_64x64's real
 * VRAM ceiling - there is no vertical streaming, so a background taller
 * than 64 tiles genuinely isn't supported today, unlike width. Product
 * (not W*W) since the two axes now have different real limits - user-found
 * (2026-09-27): the old symmetric 64x64 sizing here silently truncated
 * collision data for any real project scene needing more than 4096 tile-
 * cells (e.g. a 161x28 or 255x28 streaming background, both well over
 * 4096, regardless of the *tilemap*'s own real 255-wide support) - SceneInit
 * clamped the copy at the old SCENE_COL_BYTES with no warning, so those
 * scenes' collision was silently missing data at the tail (row-major, so
 * the last several rows) with no error, not even the misleading "too wide"
 * compiler warning this fix also addresses (that warning was purely about
 * the *tilemap*, which streaming already handled - collision was the
 * actually-still-broken part the warning's wording never named). */
#define SCENE_COL_MAX_W 255
#define SCENE_COL_MAX_H 64
#define SCENE_COL_BYTES ((SCENE_COL_MAX_W * SCENE_COL_MAX_H + 7) / 8)

/* actor_move_settings bits (Scene.h on GB) */
#define ACTOR_MOVE_ENABLED 0x80
#define ACTOR_NOCLIP 0x40

extern u16 scene_index;
extern u16 scene_next_index;
extern u8 scene_loaded;
/* v2 M5a: which genre drives this scene - indexes states.h's startFuncs[] /
 * updateFuncs[]. */
extern u8 scene_type;
extern u8 scene_unblank_pending;

extern u8 scene_num_actors;
extern u8 scene_num_triggers;
extern u8 scene_width;  /* tiles */
extern u8 scene_height; /* tiles */

extern s16 map_next_x;
extern s16 map_next_y;
extern s8 map_next_dir_x;
extern s8 map_next_dir_y;

extern u8 actor_move_settings;
extern s16 actor_move_dest_x;
extern s16 actor_move_dest_y;

/* Re-aims whichever actor script_actor currently names against
 * actor_move_dest_x/y, advancing or completing a blocking ACTOR_MOVE_TO/
 * MOVE_RELATIVE one tile at a time; returns whether a move is still active
 * for the caller's own (already swapped-in) copy of these globals. Called
 * once for the foreground (scene.c's own SceneUpdateActors) and once per
 * active On Update context (update_script.c's UpdateScriptsProcess) - see
 * ActorMoveAim's own comment in scene.c for why each caller must swap its
 * own move_dest_x/y/settings in first. */
u8 ActorMoveAim(void);

/* GB direction code (1 down, 2 left, 4 right, 8 up) -> unit vector */
void dir_to_vec(u8 d, s8 *dx, s8 *dy);

/* ACTOR_EMOTE (M5c): a bubble above actor `a` for a fixed number of frames */
void SceneStartEmote(u8 a, u8 emote_id);

/* Projectiles (v4). ProjectileSpawn is called from script_cmds.c's
 * LAUNCH_PROJECTILE/WEAPON_ATTACK handlers - dir_x/dir_y/speed/ttl==0 means
 * "moving, no ttl" (Launch Projectile); dir_x=dir_y=0/speed=0/ttl!=0 means
 * "static hitbox, self-destroys after ttl frames" (Weapon Attack). group/mask
 * are the packed collision byte's two nibbles, already split by the caller. */
void ProjectileSpawn(s16 x, s16 y, s8 dir_x, s8 dir_y, u8 speed, u8 sprite_slot,
                      u8 collision_group, u8 collision_mask, u8 ttl);
void ProjectilesUpdate(void);
/* Follow-up: walk-into-a-hostile-actor damage, see scene.c's own comment. */
void PlayerContactUpdate(void);

/* PLAYER_BOUNCE (v4) - a fixed velocity impulse, see scene.c's own comment. */
void PlatformSetVelY(s16 v);

void SceneInit(void);
void SceneHandleInput(void);
void SceneUpdate(void);
void SceneRequestSwitch(u16 index, u8 tile_x, u8 tile_y, u8 dir);

/* Horizontal background streaming (v4) - a background over 64 tiles wide
 * (bg_map_w[bg_index] > 64, compileSnesData.js) can't fit its whole tilemap
 * in VRAM at once; SceneInit loads the initial 64-tile window (tiles 0-63)
 * same as always, and this streams in new columns as the camera scrolls
 * past it - called once per frame, during vblank, right after bgSetScroll
 * (game.c) so it sees this frame's already-applied scroll_x. A no-op for
 * every scene whose background already fits in one VRAM load. Only used by
 * a wide scene that *also* uses parallax (see map_engine_active below) -
 * every other wide scene now streams through PVSnesLib's own Map Engine
 * instead, which this hand-rolled path can't be combined with parallax's
 * banded HDMA (see game.c/scene.c SceneInit for why). */
void SceneStreamBackground(void);

/* v4 (Map Engine streaming): set by SceneInit when this scene's background
 * needs streaming AND has no active parallax - PVSnesLib's own mapLoad/
 * mapUpdate/mapVblank (see map.h) drive BG1 instead of SceneStreamBackground
 * above. game.c's main loop reads this to pick which of the two streaming
 * paths runs each frame; mutually exclusive with stream_bg_index being set
 * (SceneInit never sets both). See the Map Engine plan for the two real
 * incompatibilities (mapUpdateCamera's own camera algorithm, parallax HDMA)
 * that rule out just always using the Map Engine. */
extern u8 map_engine_active;

/* actor's true tile (top-left), pixel pos is tile*8 + 8 like the GB engine */
s16 SceneActorTileX(u8 i);
s16 SceneActorTileY(u8 i);

/* M7-cont.: SET_INPUT_SCRIPT / SET_TIMER_SCRIPT execution. `joy`/`prev_joy`
 * are raw PVSnesLib pad bits; the compiler emits masks in the GB engine's
 * compact button layout (KEY_BITS in src/lib/compiler/helpers.js) - 8 bits on
 * GB, plus X/Y/L/R in bits 8..11 on SNES - so SceneGbInputBits() re-packs the
 * SNES bits into that layout wherever a compiler-emitted mask needs comparing
 * against - also used by IF_INPUT / AWAIT_INPUT. */
u16 SceneGbInputBits(u16 j);
void SceneScheduledScriptsInit(void); /* boot-only: zero input_script_ptrs[] */
void SceneSetInputScript(u16 mask, BANK_PTR target);
void SceneRemoveInputScript(u16 mask);
void SceneSetTimerScript(u8 duration, BANK_PTR target, u8 context);
void SceneTimerRestart(u8 context);
void SceneTimerDisable(u8 context);
void SceneUpdateTimerScript(void);

/* SHOW_SPRITES / HIDE_SPRITES */
void SceneShowSprites(void);
void SceneHideSprites(void);

/* SCENE_PUSH_STATE / SCENE_POP_STATE / SCENE_STATE_RESET / SCENE_POP_ALL_STATE */
void SceneStackPush(void);
u8 SceneStackPop(u8 all); /* returns 0 (nothing done) if the stack was empty */
void SceneStackReset(void);

#endif
