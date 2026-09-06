#ifndef UI_H
#define UI_H

/*
 * Dialogue box - the SNES stand-in for appData/src/gb/src/UI.c + UI_b.c. GB
 * uses the hardware window layer; here the box is drawn on BG3 (2bpp, high
 * priority in Mode 1) via a RAM tilemap shadow DMA'd during VBlank.
 *
 * M5: fixed dialogue box, typewriter reveal, "$NN$" substitution.
 * M5b: menus/choices (cursor, Up/Down/A/B). M5c: emotes (scene.c).
 * M5d: avatars, full-screen overlay, word-wrap.
 * M5e: box slide-in/out, 2-column menu layout, OVERLAY_MOVE_TO.
 */
#include <snes.h>

void UIInit(void);                          /* one-time: font + BG3 setup */
void UIShowText(const unsigned char *str);  /* far pointer to a NUL string */
/* Same, with a 16x16 avatar portrait (OBJ, palette 2) in the box corner */
void UIShowTextAvatar(const unsigned char *str, u8 avatar_index);
/* Options as "\n"-separated lines; writes the picked 1..N (or 0 on cancel) to
 * script_variables[flag]. cancel_cfg bit0 = last option cancels, bit1 = B
 * cancels. layout 1 = 2-column "menu" grid (Left/Right jump columns), else a
 * single column like the dialogue box. */
void UIShowMenu(u16 flag, const unsigned char *str, u8 cancel_cfg, u8 layout);
/* A solid BG3 panel covering rows [top_row..31] (colour arg unused for now) */
void UIOverlayShow(u8 color_idx, u8 top_row);
/* Animates the covered region toward top_row; frames-per-step, 0 = instant.
 * Blocks the script until it arrives (matches the GB engine). */
void UIOverlayMoveTo(u8 top_row, u8 speed);
void UIOverlayHide(void);
/* TEXT_SET_ANIM_SPEED: box slide-in/out speed and typewriter reveal speed.
 * 0-2 fastest (0 approximated as fastest, not a true zero-frame jump), 3/4/5
 * progressively slower - same ordinal scale as the GB engine's own speeds. */
void UISetTextAnimSpeed(u8 speed_in, u8 speed_out, u8 text_speed);
void UITextMulti(u8 mode); /* TEXT_MULTI - compiler-internal, see ui.c */
void UIUpdate(void);                        /* per frame: typewriter + input */
void UIFlush(void);                         /* per frame in VBlank: DMA if dirty */
u8 UIIsClosed(void);

extern u8 ui_script_wait;  /* TEXT blocks the script until the box closes */

#endif
