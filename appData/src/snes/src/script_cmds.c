/*---------------------------------------------------------------------------------
    Opcode handlers + dispatch table - ported from appData/src/gb/src/ScriptRunner_b.c

    The table order below is the compiler contract with src/lib/events/
    scriptCommands.js. M4 implements the target-independent opcodes (flags, math,
    control flow, instant actor ops, wait); everything that needs Scene, UI,
    fades, sound, music or SRAM is Script_Noop_b for now and is filled in over
    M5 (UI/fades/camera), M8 (sound/music) and M4b (Scene / actor walking).
---------------------------------------------------------------------------------*/
#include "script_runner.h"
#include "scene.h"
#include "assets.h"
#include "fade.h"
#include "ui.h"
#include "camera.h"
#include "music.h"
#include "save.h"

/* SWITCH_SCENE fade handshake, owned by game.c */
extern u8 scene_fade_pending;
extern u8 scene_fade_speed;

#define ADVANCE() (script_ptr += 1 + script_cmd_args_len)
#define ARG16(a, b) (((u16)script_cmd_args[a] << 8) | script_cmd_args[b])

// The compiler emits valid indices; this is just insurance against a stray
// write trashing WRAM during bring-up.
static u16 var_clamp(u16 i)
{
    return i > NUM_VARIABLES ? NUM_VARIABLES : i;
}
#define VAR(i) script_variables[var_clamp(i)]

// PVSnesLib RNG (console.h)
extern u16 rand(void);

/* -------- no-op / not yet implemented -------- */
void Script_Noop_b(void)
{
    ADVANCE();
    script_continue = 1;
}

/* -------- control flow -------- */
void Script_End_b(void)
{
    script_ptr = 0;
}

void Script_Goto_b(void)
{
    script_ptr = script_start_ptr + ARG16(0, 1);
    script_continue = 1;
}

void Script_IfFlag_b(void)
{
    if (VAR(ARG16(0, 1)))
    {
        script_ptr = script_start_ptr + ARG16(2, 3);
    }
    else
    {
        ADVANCE();
    }
    script_continue = 1;
}

void Script_IfValue_b(void)
{
    u8 value = VAR(ARG16(0, 1));
    u8 cmp = script_cmd_args[3];
    u8 match;
    switch (script_cmd_args[2])
    {
    case OPERATOR_EQ:  match = value == cmp; break;
    case OPERATOR_LT:  match = value < cmp;  break;
    case OPERATOR_LTE: match = value <= cmp; break;
    case OPERATOR_GT:  match = value > cmp;  break;
    case OPERATOR_GTE: match = value >= cmp; break;
    case OPERATOR_NE:  match = value != cmp; break;
    default:           match = 0;
    }
    if (match)
    {
        script_ptr = script_start_ptr + ARG16(4, 5);
    }
    else
    {
        ADVANCE();
    }
    script_continue = 1;
}

void Script_IfValueCompare_b(void)
{
    u8 a = VAR(script_ptr_x);
    u8 b = VAR(script_ptr_y);
    u8 match;
    switch (script_cmd_args[0])
    {
    case OPERATOR_EQ:  match = a == b; break;
    case OPERATOR_LT:  match = a < b;  break;
    case OPERATOR_LTE: match = a <= b; break;
    case OPERATOR_GT:  match = a > b;  break;
    case OPERATOR_GTE: match = a >= b; break;
    case OPERATOR_NE:  match = a != b; break;
    default:           match = 0;
    }
    if (match)
    {
        script_ptr = script_start_ptr + ARG16(1, 2);
    }
    else
    {
        ADVANCE();
    }
    script_continue = 1;
}

// The compiler emits input masks in the GB engine's compact button layout. On
// the SNES target it is 2 bytes (little-endian) instead of 1 - the extra byte
// carries X / Y / L / R (KEY_BITS bits 8..11 in src/lib/compiler/helpers.js),
// which is why these four opcodes' args_len is GB + 1 in the table below.
// SceneGbInputBits() re-packs the raw PVSnesLib pad bits into the same layout.
void Script_IfInput_b(void)
{
    u16 mask = script_cmd_args[0] | ((u16)script_cmd_args[1] << 8);
    if ((SceneGbInputBits(joy) & mask) != 0)
    {
        script_ptr = script_start_ptr + ARG16(2, 3);
    }
    else
    {
        ADVANCE();
    }
    script_continue = 1;
}

// SET_INPUT_SCRIPT. args: mask lo/hi (GB layout + X/Y/L/R), bank (unused, always
// 0), event_ptrs index hi/lo. Registers a background script that fires on the
// next press of one of the masked buttons (SceneHandleInput / SceneSetInputScript).
void Script_SetInputScript_b(void)
{
    u16 mask = script_cmd_args[0] | ((u16)script_cmd_args[1] << 8);
    u16 idx = ARG16(3, 4);
    SceneSetInputScript(mask, event_ptrs[idx]);
    ADVANCE();
    script_continue = 1;
}

// REMOVE_INPUT_SCRIPT. args: mask lo/hi (GB layout + X/Y/L/R).
void Script_RemoveInputScript_b(void)
{
    u16 mask = script_cmd_args[0] | ((u16)script_cmd_args[1] << 8);
    SceneRemoveInputScript(mask);
    ADVANCE();
    script_continue = 1;
}

// SHOW_SPRITES / HIDE_SPRITES.
void Script_ShowSprites_b(void)
{
    SceneShowSprites();
    ADVANCE();
    script_continue = 1;
}

void Script_HideSprites_b(void)
{
    SceneHideSprites();
    ADVANCE();
    script_continue = 1;
}

void Script_NextFrame_b(void)
{
    ADVANCE();
    script_continue = 0;
}

void Script_Wait_b(void)
{
    wait_time = script_cmd_args[0];
    ADVANCE();
    script_action_complete = 0;
}

void Script_AwaitInput_b(void)
{
    await_input = script_cmd_args[0] | ((u16)script_cmd_args[1] << 8);
    ADVANCE();
    script_action_complete = 0;
}

// SWITCH_SCENE. args: hi(index), lo(index), x, y, dir, fadeSpeed.
// SceneRequestSwitch clears script_ptr, so the current script ends here; the
// main loop holds the switch until the fade-out finishes, then SceneInit +
// FadeIn (scene_fade_pending).
void Script_LoadScene_b(void)
{
    u8 speed = script_cmd_args[5];
    SceneRequestSwitch(ARG16(0, 1), script_cmd_args[2], script_cmd_args[3],
                       script_cmd_args[4]);
    if (speed != 0)
    {
        scene_fade_pending = 1;
        scene_fade_speed = speed;
        FadeSetSpeed(speed);
        FadeOut();
    }
    script_action_complete = 1;
    script_continue = 0;
}

// SAVE_DATA. No args. Writes the save header + script_variables[] to SRAM
// (save.c) - see save.h for exactly what GB (and this) does and doesn't save.
void Script_SaveData_b(void)
{
    SaveGameData();
    ADVANCE();
    script_continue = 1;
}

// CLEAR_DATA. No args.
void Script_ClearData_b(void)
{
    ClearGameData();
    ADVANCE();
    script_continue = 1;
}

// LOAD_DATA. No args. Like SWITCH_SCENE, no ADVANCE() on the switching path -
// LoadGameData() -> SceneRequestSwitch already zeroes script_ptr, so the
// script ends here once the switch is requested.
void Script_LoadData_b(void)
{
    if (LoadGameData())
    {
        scene_fade_pending = 1;
        scene_fade_speed = 2;
        FadeSetSpeed(2);
        FadeOut();
        script_action_complete = 1;
        script_continue = 0;
    }
    else
    {
        // No save to load - fall through, like GB.
        ADVANCE();
        script_continue = 1;
    }
}

// IF_SAVED_DATA. args: hi(offset), lo(offset) - jump target if a save exists.
void Script_IfSavedData_b(void)
{
    if (SaveDataExists())
    {
        script_ptr = script_start_ptr + ARG16(0, 1);
    }
    else
    {
        ADVANCE();
    }
    script_continue = 1;
}

// SCENE_PUSH_STATE. Snapshots the current scene + player tile pos/facing.
void Script_ScenePushState_b(void)
{
    SceneStackPush();
    ADVANCE();
    script_continue = 1;
}

// SCENE_POP_STATE. args: fadeSpeed. Pops one level and switches there, always
// fading (unlike SWITCH_SCENE, GB doesn't skip the fade at speed 0 here).
// Like SWITCH_SCENE, no ADVANCE() on the switching path - SceneStackPop ->
// SceneRequestSwitch already zeroes script_ptr, so the script ends here.
void Script_ScenePopState_b(void)
{
    u8 speed = script_cmd_args[0];
    if (SceneStackPop(0))
    {
        scene_fade_pending = 1;
        scene_fade_speed = speed;
        FadeSetSpeed(speed);
        FadeOut();
        script_action_complete = 1;
        script_continue = 0;
    }
    else
    {
        // Nothing saved - fall through, like GB.
        ADVANCE();
        script_continue = 1;
    }
}

// SCENE_STATE_RESET. Clears the whole stack without switching anywhere.
void Script_SceneResetStack_b(void)
{
    SceneStackReset();
    ADVANCE();
    script_continue = 1;
}

// SCENE_POP_ALL_STATE. args: fadeSpeed. Pops all the way to the first pushed
// state (e.g. "return to where the player started a menu detour").
void Script_ScenePopAllState_b(void)
{
    u8 speed = script_cmd_args[0];
    if (SceneStackPop(1))
    {
        scene_fade_pending = 1;
        scene_fade_speed = speed;
        FadeSetSpeed(speed);
        FadeOut();
        script_action_complete = 1;
        script_continue = 0;
    }
    else
    {
        ADVANCE();
        script_continue = 1;
    }
}

/* -------- M8: music, sound (see music.c/.h) -------- */

// MUSIC_PLAY. args: musicIndex, loop (0/1 - not wired yet, see music.c).
void Script_MusicPlay_b(void)
{
    MusicPlay(script_cmd_args[0]);
    ADVANCE();
    script_continue = 1;
}

// MUSIC_STOP. No args.
void Script_MusicStop_b(void)
{
    MusicStop();
    ADVANCE();
    script_continue = 1;
}

// SOUND_START_TONE. args: hi(period), lo(period) - a GB tone period, not a
// frequency. snesmod's BRR path has no "hold an arbitrary raw frequency"
// primitive, so play the beep sample at a mid pitch; SOUND_STOP_TONE is a
// no-op (the sample is a short one-shot). Layers over the music.
void Script_SoundStartTone_b(void)
{
    SoundPlayEffect(SFX_BEEP, 3);
    ADVANCE();
    script_continue = 1;
}

void Script_SoundStopTone_b(void)
{
    ADVANCE();
    script_continue = 1;
}

// SOUND_PLAY_BEEP. args: pitch (0-7, GB pitch table index). Map onto the BRR
// pitch range 1..6 (playback rate ~ pitch * 2000 Hz).
void Script_SoundPlayBeep_b(void)
{
    u8 gb_pitch = script_cmd_args[0];
    if (gb_pitch > 7) gb_pitch = 7;
    SoundPlayEffect(SFX_BEEP, 1 + ((gb_pitch * 5) / 7));
    ADVANCE();
    script_continue = 1;
}

// SOUND_PLAY_CRASH. No args.
void Script_SoundPlayCrash_b(void)
{
    SoundPlayEffect(SFX_CRASH, 3);
    ADVANCE();
    script_continue = 1;
}

/* -------- M5: text, fades, camera -------- */

void Script_Text_b(void)
{
    ADVANCE();
    UIShowText(string_ptrs[ARG16(1, 2)].ptr);
    script_action_complete = 0;
}

void Script_FadeOut_b(void)
{
    FadeSetSpeed(script_cmd_args[0]);
    FadeOut();
    fade_script_wait = 1;
    ADVANCE();
    script_action_complete = 0;
}

void Script_FadeIn_b(void)
{
    FadeSetSpeed(script_cmd_args[0]);
    FadeIn();
    fade_script_wait = 1;
    ADVANCE();
    script_action_complete = 0;
}

// CAMERA_MOVE_TO. args: tileX, tileY, settings (speed + lock flag).
void Script_CameraMoveTo_b(void)
{
    CameraMoveTo((s16)script_cmd_args[0] << 3, (s16)script_cmd_args[1] << 3,
                 script_cmd_args[2]);
    camera_script_wait = 1;
    ADVANCE();
    script_action_complete = 0;
}

// CAMERA_LOCK. args: settings (speed). Re-follow the player.
void Script_CameraLock_b(void)
{
    CameraLock(script_cmd_args[0]);
    camera_script_wait = 1;
    ADVANCE();
    script_action_complete = 0;
}

void Script_CameraShake_b(void)
{
    shake_time = script_cmd_args[0];
    ADVANCE();
    script_action_complete = 0;
}

// ACTOR_EMOTE. args: emoteId. Shows a bubble above actors[script_actor] and
// blocks the script until it clears (SceneUpdate counts emote_time down).
void Script_ActorEmote_b(void)
{
    SceneStartEmote(script_actor, script_cmd_args[0]);
    ADVANCE();
    script_action_complete = 0;
}

// TEXT_WITH_AVATAR. args: bank, strHi, strLo, avatarIndex.
void Script_TextWithAvatar_b(void)
{
    u16 idx = ARG16(1, 2);
    u8 avatar = script_cmd_args[3];
    ADVANCE();
    UIShowTextAvatar(string_ptrs[idx].ptr, avatar);
    script_action_complete = 0;
}

// OVERLAY_SHOW. args: colourIndex, x, y (x ignored - the panel always spans
// the full width; y is the top BG3 row it starts covering).
void Script_ShowOverlay_b(void)
{
    UIOverlayShow(script_cmd_args[0], script_cmd_args[2]);
    ADVANCE();
    script_continue = 1;
}

// OVERLAY_HIDE.
void Script_HideOverlay_b(void)
{
    UIOverlayHide();
    ADVANCE();
    script_continue = 1;
}

// OVERLAY_MOVE_TO. args: x (ignored), y, speed. Blocks until it arrives.
void Script_OverlayMoveTo_b(void)
{
    UIOverlayMoveTo(script_cmd_args[1], script_cmd_args[2]);
    ADVANCE();
    script_action_complete = 0;
}

// SET_TIMER_SCRIPT. args: duration (16-frame ticks), bank (unused, always 0),
// event_ptrs index hi/lo. Auto-repeating background script (SceneUpdateTimerScript).
void Script_SetTimerScript_b(void)
{
    u8 duration = script_cmd_args[0];
    u16 idx = ARG16(2, 3);
    SceneSetTimerScript(duration, event_ptrs[idx]);
    ADVANCE();
    script_continue = 1;
}

// TIMER_RESTART. Resets the countdown to its full duration without stopping it.
void Script_TimerRestart_b(void)
{
    SceneTimerRestart();
    ADVANCE();
    script_continue = 1;
}

// TIMER_DISABLE.
void Script_TimerDisable_b(void)
{
    SceneTimerDisable();
    ADVANCE();
    script_continue = 1;
}

// CHOICE. args: varHi, varLo, bank, strHi, strLo. Two options; cancel on B or
// on the last option, like the GB engine (UIShowChoice -> UIShowMenu ...|3).
void Script_Choice_b(void)
{
    u16 var = ARG16(0, 1);
    u16 idx = ARG16(3, 4);
    ADVANCE();
    UIShowMenu(var, string_ptrs[idx].ptr, 3, 0);
    script_action_complete = 0;
}

// MENU. args: varHi, varLo, bank, strHi, strLo, layout, cancelConfig.
void Script_Menu_b(void)
{
    u16 var = ARG16(0, 1);
    u16 idx = ARG16(3, 4);
    u8 layout = script_cmd_args[5];
    u8 cfg = script_cmd_args[6];
    ADVANCE();
    UIShowMenu(var, string_ptrs[idx].ptr, cfg, layout);
    script_action_complete = 0;
}

/* -------- variables -------- */
void Script_SetFlag_b(void)      { VAR(ARG16(0, 1)) = 1;                    ADVANCE(); script_continue = 1; }
void Script_ClearFlag_b(void)    { VAR(ARG16(0, 1)) = 0;                    ADVANCE(); script_continue = 1; }
void Script_SetFlagValue_b(void) { VAR(ARG16(0, 1)) = script_cmd_args[2];  ADVANCE(); script_continue = 1; }

void Script_IncFlag_b(void)
{
    u16 p = ARG16(0, 1);
    if (VAR(p) != 255) VAR(p)++;
    ADVANCE();
    script_continue = 1;
}

void Script_DecFlag_b(void)
{
    u16 p = ARG16(0, 1);
    if (VAR(p) != 0) VAR(p)--;
    ADVANCE();
    script_continue = 1;
}

void Script_SetFlagRandomValue_b(void)
{
    u8 modulo = script_cmd_args[3] + 1;
    VAR(ARG16(0, 1)) = script_cmd_args[2] + ((u8)rand() % modulo);
    ADVANCE();
    script_continue = 1;
}

void Script_ResetVariables_b(void)
{
    u16 i;
    for (i = 0; i <= NUM_VARIABLES; i++)
    {
        script_variables[i] = 0;
    }
    ADVANCE();
    script_continue = 1;
}

void Script_LoadVectors_b(void)
{
    script_ptr_x = ARG16(0, 1);
    script_ptr_y = ARG16(2, 3);
    ADVANCE();
    script_continue = 1;
}

void Script_CopyVal_b(void)    { VAR(script_ptr_x) = VAR(script_ptr_y);                  ADVANCE(); script_continue = 1; }
void Script_MathAdd_b(void)    { VAR(ARG16(0, 1)) += script_cmd_args[2];                 ADVANCE(); script_continue = 1; }
void Script_MathSub_b(void)    { VAR(ARG16(0, 1)) -= script_cmd_args[2];                 ADVANCE(); script_continue = 1; }
void Script_MathMul_b(void)    { VAR(ARG16(0, 1)) *= script_cmd_args[2];                 ADVANCE(); script_continue = 1; }
void Script_MathDiv_b(void)    { VAR(ARG16(0, 1)) /= script_cmd_args[2];                 ADVANCE(); script_continue = 1; }
void Script_MathMod_b(void)    { VAR(ARG16(0, 1)) %= script_cmd_args[2];                 ADVANCE(); script_continue = 1; }
void Script_MathAddVal_b(void) { VAR(script_ptr_x) = VAR(script_ptr_x) + VAR(script_ptr_y); ADVANCE(); script_continue = 1; }
void Script_MathSubVal_b(void) { VAR(script_ptr_x) = VAR(script_ptr_x) - VAR(script_ptr_y); ADVANCE(); script_continue = 1; }
void Script_MathMulVal_b(void) { VAR(script_ptr_x) = VAR(script_ptr_x) * VAR(script_ptr_y); ADVANCE(); script_continue = 1; }
void Script_MathDivVal_b(void) { VAR(script_ptr_x) = VAR(script_ptr_x) / VAR(script_ptr_y); ADVANCE(); script_continue = 1; }
void Script_MathModVal_b(void) { VAR(script_ptr_x) = VAR(script_ptr_x) % VAR(script_ptr_y); ADVANCE(); script_continue = 1; }
void Script_VariableAddFlags_b(void)   { VAR(ARG16(0, 1)) |= script_cmd_args[2];  ADVANCE(); script_continue = 1; }
void Script_VariableClearFlags_b(void) { VAR(ARG16(0, 1)) &= ~script_cmd_args[2]; ADVANCE(); script_continue = 1; }

/* -------- actors (instant ops only for M4; walking needs Scene, M4b) -------- */
void Script_ActorActivate_b(void)
{
    script_actor = script_cmd_args[0];
    ADVANCE();
    script_continue = 1;
}

// PLAYER_SET_SPRITE: arg is an index into the project's full spriteSheets[]
// (compiler's getSpriteIndex) - unlike GB, this engine doesn't stream sprite
// tiles into VRAM at runtime, so only a sheet already pre-loaded into one of
// the SPRITE_SLOTS OBJ slots (because some actor/the player uses it) can
// actually be switched to. sprite_slot_for_index[] (compileSnesData.js) maps
// every project sprite to its slot, or 0xFF if it was never loaded - no-op
// on 0xFF rather than pointing OAM at tiles that were never uploaded.
void Script_PlayerSetSprite_b(void)
{
    u16 idx = ARG16(0, 1);
    if (idx < NUM_SPRITE_SHEETS)
    {
        u8 slot = sprite_slot_for_index[idx];
        if (slot != 0xFF)
        {
            actors[0].frame_offset = slot * 2;
            actors[0].sprite_type = sprite_type_for_slot[slot];
            actors[0].frame = 0;
            actors[0].flip = 0;
        }
    }
    ADVANCE();
    script_continue = 1;
}

void Script_ActorSetDir_b(void)
{
    u8 d = script_cmd_args[0];
    actors[script_actor].dir_x = d == 2 ? -1 : d == 4 ? 1 : 0;
    actors[script_actor].dir_y = d == 8 ? -1 : d == 1 ? 1 : 0;
    ADVANCE();
    script_continue = 1;
}

void Script_ActorSetPos_b(void)
{
    actors[script_actor].x = ((s16)script_cmd_args[0] << 3) + 8;
    actors[script_actor].y = ((s16)script_cmd_args[1] << 3) + 8;
    ADVANCE();
    script_continue = 1;
}

/* -------- scripted actor movement (SceneUpdateActors walks it) -------- */
#define BEGIN_MOVE(dx, dy)                              \
    actor_move_dest_x = (dx);                           \
    actor_move_dest_y = (dy);                           \
    actor_move_settings = ACTOR_MOVE_ENABLED | ACTOR_NOCLIP; \
    ADVANCE();                                          \
    script_action_complete = 0

void Script_ActorMoveTo_b(void)
{
    BEGIN_MOVE(((s16)script_cmd_args[0] << 3) + 8,
               ((s16)script_cmd_args[1] << 3) + 8);
}

void Script_ActorMoveRel_b(void)
{
    s16 dx = (s16)script_cmd_args[0] << 3;
    s16 dy = (s16)script_cmd_args[2] << 3;
    BEGIN_MOVE(actors[script_actor].x + (script_cmd_args[1] ? -dx : dx),
               actors[script_actor].y + (script_cmd_args[3] ? -dy : dy));
}

void Script_ActorMoveToVal_b(void)
{
    BEGIN_MOVE(((s16)VAR(script_ptr_x) << 3) + 8,
               ((s16)VAR(script_ptr_y) << 3) + 8);
}

// ACTOR_PUSH. args: continuous (0 = push 2 tiles, 1 = slide to the scene edge
// / until blocked). Reuses the scripted-move machinery WITHOUT the NOCLIP bit
// so it stops at the first solid tile - which also happens to be exactly
// what "slide until collision" needs, and out-of-bounds already reads as
// solid (col_solid), so overshooting the edge target below is harmless.
void Script_ActorPush_b(void)
{
    u8 continuous = script_cmd_args[0];
    s8 pdx = actors[0].dir_x;
    s8 pdy = actors[0].dir_y;
    s16 destX = actors[script_actor].x;
    s16 destY = actors[script_actor].y;

    if (continuous)
    {
        if (pdx < 0) destX = 8;
        if (pdx > 0) destX = (s16)scene_width << 3;
        if (pdy < 0) destY = 8;
        if (pdy > 0) destY = (s16)scene_height << 3;
    }
    else
    {
        destX = destX + ((s16)pdx << 4);
        destY = destY + ((s16)pdy << 4);
    }

    actor_move_dest_x = destX;
    actor_move_dest_y = destY;
    actor_move_settings = ACTOR_MOVE_ENABLED;
    ADVANCE();
    script_action_complete = 0;
}

void Script_IfActorPos_b(void)
{
    if (((s16)script_cmd_args[0] << 3) + 8 == actors[script_actor].x &&
        ((s16)script_cmd_args[1] << 3) + 8 == actors[script_actor].y)
    {
        script_ptr = script_start_ptr + ARG16(2, 3);
    }
    else
    {
        ADVANCE();
    }
    script_continue = 1;
}

void Script_IfActorDirection_b(void)
{
    u8 d = script_cmd_args[0];
    u8 match = (actors[script_actor].dir_x == 1 && d == 4) ||
               (actors[script_actor].dir_x == -1 && d == 2) ||
               (actors[script_actor].dir_y == 1 && d == 1) ||
               (actors[script_actor].dir_y == -1 && d == 8);
    if (match)
    {
        script_ptr = script_start_ptr + ARG16(1, 2);
    }
    else
    {
        ADVANCE();
    }
    script_continue = 1;
}

void Script_ActorSetPosRel_b(void)
{
    if (script_cmd_args[0])
        actors[script_actor].x += (script_cmd_args[1] ? -1 : 1) * ((s16)script_cmd_args[0] << 3);
    if (script_cmd_args[2])
        actors[script_actor].y += (script_cmd_args[3] ? -1 : 1) * ((s16)script_cmd_args[2] << 3);
    ADVANCE();
    script_continue = 1;
}

void Script_ActorGetPos_b(void)
{
    VAR(script_ptr_x) = (actors[script_actor].x - 8) >> 3;
    VAR(script_ptr_y) = (actors[script_actor].y - 8) >> 3;
    ADVANCE();
    script_continue = 1;
}

void Script_ActorSetPosToVal_b(void)
{
    actors[script_actor].x = ((s16)VAR(script_ptr_x) << 3) + 8;
    actors[script_actor].y = ((s16)VAR(script_ptr_y) << 3) + 8;
    ADVANCE();
    script_continue = 1;
}

void Script_ActorShow_b(void)           { actors[script_actor].enabled = 1;             ADVANCE(); script_continue = 1; }
void Script_ActorHide_b(void)           { actors[script_actor].enabled = 0;             ADVANCE(); script_continue = 1; }
void Script_ActorSetCollisions_b(void)  { actors[script_actor].collisions_enabled = script_cmd_args[0]; ADVANCE(); script_continue = 1; }
void Script_ActorSetMoveSpeed_b(void)   { actors[script_actor].move_speed = script_cmd_args[0]; ADVANCE(); script_continue = 1; }
void Script_ActorSetAnimSpeed_b(void)   { actors[script_actor].anim_speed = script_cmd_args[0]; ADVANCE(); script_continue = 1; }
void Script_TextSetAnimSpeed_b(void)
{
    UISetTextAnimSpeed(script_cmd_args[0], script_cmd_args[1], script_cmd_args[2]);
    ADVANCE();
    script_continue = 1;
}
void Script_ActorSetFrame_b(void)
{
    u8 n = actors[script_actor].frames_len ? actors[script_actor].frames_len : 1;
    actors[script_actor].flip = 0;
    actors[script_actor].frame = script_cmd_args[0] % n;
    ADVANCE();
    script_continue = 1;
}
void Script_ActorSetFlip_b(void)        { actors[script_actor].flip = script_cmd_args[0]; ADVANCE(); script_continue = 1; }
void Script_TextMulti_b(void) { UITextMulti(script_cmd_args[0]); ADVANCE(); script_continue = 1; }
void Script_ActorSetFrameToVal_b(void)
{
    u8 n = actors[script_actor].frames_len ? actors[script_actor].frames_len : 1;
    actors[script_actor].flip = 0;
    actors[script_actor].frame = VAR(ARG16(0, 1)) % n;
    ADVANCE();
    script_continue = 1;
}

/* -------- call stack (ActorInvoke / sub-scripts) -------- */
void Script_StackPush_b(void)
{
    script_stack[script_stack_ptr] = script_ptr + 1 + script_cmd_args_len;
    script_start_stack[script_stack_ptr] = script_start_ptr;
    script_stack_ptr++;
}

void Script_StackPop_b(void)
{
    script_stack_ptr--;
    script_ptr = script_stack[script_stack_ptr];
    script_start_ptr = script_start_stack[script_stack_ptr];
    script_continue = 1;
}

void Script_ActorInvoke_b(void)
{
    Script_StackPush_b();
    script_ptr = actors[script_actor].events_ptr.ptr;
    script_start_ptr = script_ptr;
    script_continue = 1;
}

/*---------------------------------------------------------------------------------
    Dispatch table - index order MUST match src/lib/events/scriptCommands.js
    (and appData/src/gb/src/ScriptRunner.c script_cmds[]).
---------------------------------------------------------------------------------*/
#define SCRIPT_CMD_TABLE \
    X(Script_End_b, 0) /* 0x00 END */ \
    X(Script_Text_b, 3) /* 0x01 TEXT */ \
    X(Script_Goto_b, 2) /* 0x02 JUMP */ \
    X(Script_IfFlag_b, 4) /* 0x03 IF_TRUE */ \
    X(Script_Noop_b, 0) /* 0x04 NOOP */ \
    X(Script_SetFlag_b, 2) /* 0x05 SET_TRUE */ \
    X(Script_ClearFlag_b, 2) /* 0x06 SET_FALSE */ \
    X(Script_ActorSetDir_b, 1) /* 0x07 ACTOR_SET_DIRECTION */ \
    X(Script_ActorActivate_b, 1) /* 0x08 ACTOR_SET_ACTIVE */ \
    X(Script_CameraMoveTo_b, 3) /* 0x09 CAMERA_MOVE_TO */ \
    X(Script_CameraLock_b, 1) /* 0x0A CAMERA_LOCK */ \
    X(Script_Wait_b, 1) /* 0x0B WAIT */ \
    X(Script_FadeOut_b, 1) /* 0x0C FADE_OUT */ \
    X(Script_FadeIn_b, 1) /* 0x0D FADE_IN */ \
    X(Script_LoadScene_b, 6) /* 0x0E SWITCH_SCENE */ \
    X(Script_ActorSetPos_b, 2) /* 0x0F ACTOR_SET_POSITION */ \
    X(Script_ActorMoveTo_b, 2) /* 0x10 ACTOR_MOVE_TO */ \
    X(Script_ShowSprites_b, 0) /* 0x11 SHOW_SPRITES */ \
    X(Script_HideSprites_b, 0) /* 0x12 HIDE_SPRITES */ \
    X(Script_PlayerSetSprite_b, 2) /* 0x13 PLAYER_SET_SPRITE */ \
    X(Script_ActorShow_b, 0) /* 0x14 ACTOR_SHOW */ \
    X(Script_ActorHide_b, 0) /* 0x15 ACTOR_HIDE */ \
    X(Script_ActorEmote_b, 1) /* 0x16 ACTOR_EMOTE */ \
    X(Script_CameraShake_b, 1) /* 0x17 CAMERA_SHAKE */ \
    X(Script_Noop_b, 0) /* 0x18 RETURN_TO_TITLE */ \
    X(Script_ShowOverlay_b, 3) /* 0x19 OVERLAY_SHOW */ \
    X(Script_HideOverlay_b, 0) /* 0x1A OVERLAY_HIDE */ \
    X(Script_Noop_b, 0) /* 0x1B OVERLAY_SET_POSITION */ \
    X(Script_OverlayMoveTo_b, 3) /* 0x1C OVERLAY_MOVE_TO */ \
    X(Script_AwaitInput_b, 2) /* 0x1D AWAIT_INPUT */ \
    X(Script_MusicPlay_b, 2) /* 0x1E MUSIC_PLAY */ \
    X(Script_MusicStop_b, 0) /* 0x1F MUSIC_STOP */ \
    X(Script_ResetVariables_b, 0) /* 0x20 RESET_VARIABLES */ \
    X(Script_NextFrame_b, 0) /* 0x21 NEXT_FRAME */ \
    X(Script_IncFlag_b, 2) /* 0x22 INC_VALUE */ \
    X(Script_DecFlag_b, 2) /* 0x23 DEC_VALUE */ \
    X(Script_SetFlagValue_b, 3) /* 0x24 SET_VALUE */ \
    X(Script_IfValue_b, 6) /* 0x25 IF_VALUE */ \
    X(Script_IfInput_b, 4) /* 0x26 IF_INPUT */ \
    X(Script_Choice_b, 5) /* 0x27 CHOICE */ \
    X(Script_ActorPush_b, 1) /* 0x28 ACTOR_PUSH */ \
    X(Script_IfActorPos_b, 4) /* 0x29 IF_ACTOR_AT_POSITION */ \
    X(Script_LoadData_b, 0) /* 0x2A LOAD_DATA */ \
    X(Script_SaveData_b, 0) /* 0x2B SAVE_DATA */ \
    X(Script_ClearData_b, 0) /* 0x2C CLEAR_DATA */ \
    X(Script_IfSavedData_b, 2) /* 0x2D IF_SAVED_DATA */ \
    X(Script_IfActorDirection_b, 3) /* 0x2E IF_ACTOR_DIRECTION */ \
    X(Script_SetFlagRandomValue_b, 4) /* 0x2F SET_RANDOM_VALUE */ \
    X(Script_ActorGetPos_b, 0) /* 0x30 ACTOR_GET_POSITION */ \
    X(Script_ActorSetPosToVal_b, 0) /* 0x31 ACTOR_SET_POSITION_TO_VALUE */ \
    X(Script_ActorMoveToVal_b, 0) /* 0x32 ACTOR_MOVE_TO_VALUE */ \
    X(Script_ActorMoveRel_b, 4) /* 0x33 ACTOR_MOVE_RELATIVE */ \
    X(Script_ActorSetPosRel_b, 4) /* 0x34 ACTOR_SET_POSITION_RELATIVE */ \
    X(Script_MathAdd_b, 3) /* 0x35 MATH_ADD */ \
    X(Script_MathSub_b, 3) /* 0x36 MATH_SUB */ \
    X(Script_MathMul_b, 3) /* 0x37 MATH_MUL */ \
    X(Script_MathDiv_b, 3) /* 0x38 MATH_DIV */ \
    X(Script_MathMod_b, 3) /* 0x39 MATH_MOD */ \
    X(Script_MathAddVal_b, 0) /* 0x3A MATH_ADD_VALUE */ \
    X(Script_MathSubVal_b, 0) /* 0x3B MATH_SUB_VALUE */ \
    X(Script_MathMulVal_b, 0) /* 0x3C MATH_MUL_VALUE */ \
    X(Script_MathDivVal_b, 0) /* 0x3D MATH_DIV_VALUE */ \
    X(Script_MathModVal_b, 0) /* 0x3E MATH_MOD_VALUE */ \
    X(Script_CopyVal_b, 0) /* 0x3F COPY_VALUE */ \
    X(Script_IfValueCompare_b, 3) /* 0x40 IF_VALUE_COMPARE */ \
    X(Script_LoadVectors_b, 4) /* 0x41 LOAD_VECTORS */ \
    X(Script_ActorSetMoveSpeed_b, 1) /* 0x42 ACTOR_SET_MOVE_SPEED */ \
    X(Script_ActorSetAnimSpeed_b, 1) /* 0x43 ACTOR_SET_ANIM_SPEED */ \
    X(Script_TextSetAnimSpeed_b, 3) /* 0x44 TEXT_SET_ANIM_SPEED */ \
    X(Script_ScenePushState_b, 0) /* 0x45 SCENE_PUSH_STATE */ \
    X(Script_ScenePopState_b, 1) /* 0x46 SCENE_POP_STATE */ \
    X(Script_ActorInvoke_b, 0) /* 0x47 ACTOR_INVOKE */ \
    X(Script_StackPush_b, 0) /* 0x48 STACK_PUSH */ \
    X(Script_StackPop_b, 0) /* 0x49 STACK_POP */ \
    X(Script_SceneResetStack_b, 0) /* 0x4A SCENE_STATE_RESET */ \
    X(Script_ScenePopAllState_b, 1) /* 0x4B SCENE_POP_ALL_STATE */ \
    X(Script_SetInputScript_b, 5) /* 0x4C SET_INPUT_SCRIPT */ \
    X(Script_RemoveInputScript_b, 2) /* 0x4D REMOVE_INPUT_SCRIPT */ \
    X(Script_ActorSetFrame_b, 1) /* 0x4E ACTOR_SET_FRAME */ \
    X(Script_ActorSetFlip_b, 1) /* 0x4F ACTOR_SET_FLIP */ \
    X(Script_TextMulti_b, 1) /* 0x50 TEXT_MULTI */ \
    X(Script_ActorSetFrameToVal_b, 2) /* 0x51 ACTOR_SET_FRAME_TO_VALUE */ \
    X(Script_VariableAddFlags_b, 3) /* 0x52 VARIABLE_ADD_FLAGS */ \
    X(Script_VariableClearFlags_b, 3) /* 0x53 VARIABLE_CLEAR_FLAGS */ \
    X(Script_SoundStartTone_b, 2) /* 0x54 SOUND_START_TONE */ \
    X(Script_SoundStopTone_b, 0) /* 0x55 SOUND_STOP_TONE */ \
    X(Script_SoundPlayBeep_b, 1) /* 0x56 SOUND_PLAY_BEEP */ \
    X(Script_SoundPlayCrash_b, 0) /* 0x57 SOUND_PLAY_CRASH */ \
    X(Script_SetTimerScript_b, 4) /* 0x58 SET_TIMER_SCRIPT */ \
    X(Script_TimerRestart_b, 0) /* 0x59 TIMER_RESTART */ \
    X(Script_TimerDisable_b, 0) /* 0x5A TIMER_DISABLE */ \
    X(Script_TextWithAvatar_b, 4) /* 0x5B TEXT_WITH_AVATAR */ \
    X(Script_Menu_b, 7) /* 0x5C MENU */ \
    X(Script_ActorSetCollisions_b, 1) /* 0x5D ACTOR_SET_COLLISIONS */

#define X(fn, n) fn,
const SCRIPT_CMD_FN script_cmds[SCRIPT_CMD_COUNT] = {SCRIPT_CMD_TABLE};
#undef X

#define X(fn, n) n,
const u8 script_cmd_arg_lens[SCRIPT_CMD_COUNT] = {SCRIPT_CMD_TABLE};
#undef X
