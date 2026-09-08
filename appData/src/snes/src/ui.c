/*---------------------------------------------------------------------------------
    Dialogue box (M5) - BG3 tilemap, typewriter, "$NN$" var substitution.
    Ported loosely from appData/src/gb/src/UI.c + UI_b.c (no window layer here).
    M5b menus/choices, M5c emotes (scene.c), M5d avatars/overlay/word-wrap,
    M5e box slide-in, 2-column menu layout, OVERLAY_MOVE_TO.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "ui.h"
#include "assets.h"
#include "script_runner.h"

/* provided by game.c */
extern u16 prev_joy;
extern u8 time;

/* VRAM layout (words): BG1 map 0x0000-0x0FFF, BG3 map 0x1000-0x17FF,
 * BG1 tiles 0x2000-0x2FFF (256 4bpp tiles), BG3 UI tiles 0x3000-0x375F
 * (235 2bpp tiles: 224 glyphs + fill + 9-slice frame + cursor), OBJ 0x4000. */
#define UI_MAP_VRAM  0x1000
#define UI_FONT_VRAM 0x3000

/* tilemap entry: palette field 4 (bits 10-12 -> CGRAM 16..19) + priority bit
 * (13), so the box wins over the opaque BG1 when $2105.3 (BG3 priority in
 * Mode 1) is set - see setMode(BG_MODE1, BG3_MODE1_PRIORITY_HIGH) in game.c. */
#define UI_PAL_BITS (0x1000 | 0x2000)
#define UI_ENTRY(t) ((u16)(t) | UI_PAL_BITS)
/* Glyph tile = char - 0x20; the space (tile 0) is transparent so it can double
 * as UI_BLANK, so a space inside text draws the opaque box-fill tile instead. */
#define UI_BOX_FILL (UI_FRAME_TILE0 + 4) /* nine-slice centre = box interior */
#define UI_CHAR(c) \
    UI_ENTRY((u8)(c) == 0x20 ? UI_BOX_FILL : (u8)((u8)(c) - 0x20))
#define UI_BLANK    0x0000

/* Visible screen height in tiles (224px NTSC = 28 rows). BG3's tilemap is 32
 * rows; rows >= this are past the bottom of the screen. The overlay fill must
 * never touch them: a real display (and Mesen's capture) still shows a sliver
 * of row 28 in the overscan area, so a "parked" overlay left with fill tiles
 * down there paints a stray dark line along the bottom edge. */
#define UI_SCREEN_ROWS 28

#define BOX_ROW0 20        /* top of the max-size box */
#define BOX_ROWS 8         /* max box height; the always-cleared + flushed region */
#define BOX_ROWS_MIN 4     /* 2 frame borders + >=2 content rows */
#define TXT_COL0 2
#define TXT_COLS 28

/* The box is anchored to its bottom edge (row BOX_ROW0 + BOX_ROWS) and grows
 * upward from there to fit its content (ui_set_box), so a 2-option menu or a
 * 1-line line of text isn't drawn as a near-empty 8-row slab. box_row0 /
 * box_rows are the *current* box; the region BOX_ROW0..+BOX_ROWS above it is
 * kept blank and is what UIFlush's partial DMA and the close path cover. */
static u8 box_row0 = BOX_ROW0;
static u8 box_rows = BOX_ROWS;
#define TXT_ROW0 (box_row0 + 1)
#define TXT_ROWS (box_rows - 2)

static void ui_set_box(u8 content_rows)
{
    u8 rows = content_rows + 2;
    if (rows < BOX_ROWS_MIN) rows = BOX_ROWS_MIN;
    if (rows > BOX_ROWS) rows = BOX_ROWS;
    box_rows = rows;
    box_row0 = (u8)(BOX_ROW0 + BOX_ROWS - rows);
}

/* M5e: box slides up from below the screen over a few frames. BG3 has nothing
 * else fixed to the screen (the avatar is OAM and is held back until the
 * slide finishes), so scrolling the whole layer is safe for the dialogue box.
 * NOTE: an active OVERLAY_SHOW shares BG3 too, so it rides along with the
 * slide if one happens to be up at the same time - a known M5e limitation. */
#define SLIDE_HIDDEN (-64)
#define SLIDE_STEP 16

/* TEXT_SET_ANIM_SPEED (0x44): 1-2 fastest (every frame), 3/4/5 progressively
 * slower (every 2nd/4th/8th frame) - the same ordinal scale and frame-skip
 * thresholds as the GB engine's UI_b.c UIUpdate_b(), collapsed from GB's
 * separate 1 vs 2 step-size distinction since this box moves/reveals in
 * coarser units already. 0 means instant (no animation), handled by the
 * caller, not this gate. Defaults (1) match pre-existing hardcoded behaviour. */
static u8 ui_slide_in_speed = 1;
static u8 ui_slide_out_speed = 1;
static u8 ui_text_speed = 1;
/* TEXT_MULTI (0x50): save/restore slots so a multi-page TEXT event can force
 * the box to stay "open" between pages (instant close before all-but-last
 * page, instant open after the first) without losing the real speeds. */
static u8 ui_tmp_slide_in_speed = 1;
static u8 ui_tmp_slide_out_speed = 1;

#define MENU_ROWS_PER_COL 4
#define MENU_COL_W 14

u8 ui_script_wait = 0;

static u16 ui_map[32 * 32];
static char ui_text[128];
static u8 ui_len;
static u8 ui_pos;
static u8 ui_col, ui_row;
static u8 ui_tick;
static u8 ui_state; /* 0 closed, 1 typing, 2 shown, 3 closing, 4 menu */
static u8 ui_dirty;
static u8 ui_blink;
static s16 ui_scroll_y; /* M5e: box slide offset, SLIDE_HIDDEN..0 */

/* menu / choice (M5b, M5e columns) */
static u16 ui_menu_flag;
static u8 ui_menu_count;
static u8 ui_menu_index;
static u8 ui_menu_cancel; /* bit0 = last option cancels, bit1 = B cancels */
static u8 ui_menu_cols;   /* 1 or 2 (M5e "menu" layout) */

/* avatar (M5d) */
static u8 ui_avatar_active;
static u8 ui_avatar_tile;
static u8 ui_xoff; /* text column offset (0, or past the avatar) */

/* overlay (M5d, M5e row targeting) */
static u8 ui_overlay;
static u8 ui_flush_full; /* DMA the whole 32x32 map, not just the box rows */
static u8 ui_ov_row;     /* current top filled BG3 row (0..31) */
static u8 ui_ov_target;
static u8 ui_ov_speed;
static u8 ui_ov_tick;
static u8 ui_ov_wait;    /* OVERLAY_MOVE_TO blocks the script until it arrives */

#define AVATAR_OID ((u16)(MAX_ACTORS + 1) << 2)

/*--------------------------------------------------------------------------- */

/* Fill the current box's rows with `entry`; blank the rows above it (up to the
 * BOX_ROW0..+BOX_ROWS max region UIFlush covers) so a shrunk box leaves nothing
 * behind. */
static void ui_fill_box(u16 entry)
{
    u8 r, c;
    for (r = 0; r < BOX_ROWS; r++)
    {
        u8 mr = (u8)(BOX_ROW0 + r);
        u16 e = UI_BLANK;
        if (mr >= box_row0) e = entry;
        for (c = 0; c < 32; c++)
        {
            ui_map[mr * 32 + c] = e;
        }
    }
}

/* Draw the assets/ui/frame.png nine-slice around the current box rows: top/
 * bottom edges, left/right edges, corners, centre fill; blank the rows above.
 * Text and the menu cursor are written over the centre afterwards. */
static void ui_frame_box(void)
{
    u8 r, c;
    for (r = 0; r < BOX_ROWS; r++)
    {
        u8 mr = (u8)(BOX_ROW0 + r);
        u8 br;
        u16 l, m, rt;
        if (mr < box_row0)
        {
            for (c = 0; c < 32; c++)
            {
                ui_map[mr * 32 + c] = UI_BLANK;
            }
            continue;
        }
        br = (u8)(mr - box_row0);
        if (br == 0)
        {
            l = UI_FRAME_TILE0 + 0;
            m = UI_FRAME_TILE0 + 1;
            rt = UI_FRAME_TILE0 + 2;
        }
        else if (br == (u8)(box_rows - 1))
        {
            l = UI_FRAME_TILE0 + 6;
            m = UI_FRAME_TILE0 + 7;
            rt = UI_FRAME_TILE0 + 8;
        }
        else
        {
            l = UI_FRAME_TILE0 + 3;
            m = UI_FRAME_TILE0 + 4;
            rt = UI_FRAME_TILE0 + 5;
        }
        for (c = 0; c < 32; c++)
        {
            u16 t = m;
            if (c == 0) t = l;
            else if (c == 31) t = rt;
            ui_map[mr * 32 + c] = UI_ENTRY(t);
        }
    }
}

void UIInit(void)
{
    u16 i;
    for (i = 0; i < 32 * 32; i++)
    {
        ui_map[i] = UI_BLANK;
    }
    /* Every UI static gets an explicit reset here: on this toolchain a plain
     * `u8 foo;` (no initializer) is NOT reliably pre-zeroed at boot, only
     * `.data`-style initialized globals are safe to assume a value for. */
    ui_state = 0;
    ui_dirty = 1;
    ui_scroll_y = 0;
    ui_menu_cols = 1;
    ui_avatar_active = 0;
    ui_xoff = 0;
    ui_blink = 0;
    ui_overlay = 0;
    ui_flush_full = 0;
    ui_ov_row = 0;
    ui_ov_target = 0;
    ui_ov_speed = 0;
    ui_ov_tick = 0;
    ui_ov_wait = 0;
    box_row0 = BOX_ROW0;
    box_rows = BOX_ROWS;

    /* force-blanks internally; main() calls setScreenOn() afterwards */
    bgInitTileSetData(2, (u8 *)ui_font, UI_FONT_SIZE, UI_FONT_VRAM);
    bgSetGfxPtr(2, UI_FONT_VRAM);
    bgSetMapPtr(2, UI_MAP_VRAM, SC_32x32);
    /* Blank the WHOLE BG3 map in VRAM, not just the dialogue-box rows. Left
     * uninitialised it held garbage tiles - some with the priority bit - which
     * showed through as dark blocks at the top of the screen (the M4b glitch). */
    dmaCopyVram((u8 *)ui_map, UI_MAP_VRAM, 32 * 32 * 2);
    dmaCopyCGram((u8 *)ui_pal, 16, UI_PAL_SIZE);
    bgSetScroll(2, 0, 0);
}

/* Copy `str` into ui_text, substituting "$NN$" with script_variables[NN]. */
static void ui_subst(const unsigned char *str)
{
    u8 i = 0, o = 0;
    while (str[i] != 0 && o < sizeof(ui_text) - 4)
    {
        if (str[i] == '$')
        {
            /* one test per if: 816-tcc mis-links long &&/|| chains (see scene.c) */
            u8 d0 = str[i + 1];
            u8 d1 = str[i + 2];
            u8 ok = 1;
            if (d0 < '0' || d0 > '9') ok = 0;
            if (d1 < '0' || d1 > '9') ok = 0;
            if (str[i + 3] != '$') ok = 0;
            if (ok)
            {
                u8 vi = (u8)((d0 - '0') * 10 + (d1 - '0'));
                u8 v = script_variables[vi];
                if (v >= 100)
                {
                    ui_text[o++] = (char)('0' + v / 100);
                }
                if (v >= 10)
                {
                    ui_text[o++] = (char)('0' + (v / 10) % 10);
                }
                ui_text[o++] = (char)('0' + v % 10);
                i += 4;
                continue;
            }
        }
        ui_text[o++] = (char)str[i++];
    }
    ui_text[o] = 0;
    ui_len = o;
}

/* Insert '\n' at a space when the next word would overflow `width` columns.
 * ui_text only ever gets shorter words per line, never longer, so it's in-place. */
static void ui_wrap(u8 width)
{
    u8 col = 0, i;
    for (i = 0; i < ui_len; i++)
    {
        char c = ui_text[i];
        if (c == '\n')
        {
            col = 0;
            continue;
        }
        if (c == ' ')
        {
            u8 wl = 0, j;
            for (j = i + 1; j < ui_len; j++)
            {
                if (ui_text[j] == ' ') break;
                if (ui_text[j] == '\n') break;
                wl++;
            }
            if (col + 1 + wl > width)
            {
                if (wl <= width)
                {
                    ui_text[i] = '\n';
                    col = 0;
                    continue;
                }
            }
        }
        col++;
    }
}

/* TEXT_SET_ANIM_SPEED tick gate: 1-2 tick every frame (fastest - 0 is
 * approximated as fastest too, rather than a true zero-frame jump, since the
 * box already animates in a handful of frames at that rate), 3/4/5
 * progressively slower, matching the GB engine's own frame-skip thresholds. */
static u8 ui_speed_tick(u8 speed)
{
    if (speed >= 5) return (time & 0x07) == 0;
    if (speed == 4) return (time & 0x03) == 0;
    if (speed == 3) return (time & 0x01) == 0;
    return 1;
}

void UISetTextAnimSpeed(u8 speed_in, u8 speed_out, u8 text_speed)
{
    ui_slide_in_speed = speed_in;
    ui_slide_out_speed = speed_out;
    ui_text_speed = text_speed;
}

/* TEXT_MULTI modes (matches the GB engine's own Script_TextMulti_b exactly -
 * this is a compiler-internal opcode, not a user-facing event, emitted around
 * a multi-page TEXT event): 0 save+instant close, 1 save+instant open,
 * 2 restore close, 3 restore both. */
void UITextMulti(u8 mode)
{
    if (mode == 0)
    {
        ui_tmp_slide_out_speed = ui_slide_out_speed;
        ui_slide_out_speed = 0;
    }
    else if (mode == 1)
    {
        ui_tmp_slide_in_speed = ui_slide_in_speed;
        ui_slide_in_speed = 0;
    }
    else if (mode == 2)
    {
        ui_slide_out_speed = ui_tmp_slide_out_speed;
    }
    else if (mode == 3)
    {
        ui_slide_in_speed = ui_tmp_slide_in_speed;
        ui_slide_out_speed = ui_tmp_slide_out_speed;
    }
}

static void ui_slide_reset(void)
{
    ui_scroll_y = SLIDE_HIDDEN;
    bgSetScroll(2, 0, (u16)ui_scroll_y);
}

static void ui_begin_text(const unsigned char *str, u8 xoff)
{
    u8 lines = 1, i;
    ui_xoff = xoff;
    ui_subst(str);
    ui_wrap(TXT_COLS - 1 - xoff);
    /* size the box to the wrapped line count (>= 2 rows for an avatar portrait) */
    for (i = 0; i < ui_len; i++)
    {
        if (ui_text[i] == '\n') lines++;
    }
    if (xoff && lines < 2) lines = 2;
    ui_set_box(lines);
    ui_pos = 0;
    ui_col = 0;
    ui_row = 0;
    ui_tick = 0;
    ui_state = 1;
    ui_script_wait = 1;
    ui_frame_box();
    ui_dirty = 1;
    ui_slide_reset();
}

void UIShowText(const unsigned char *str)
{
    ui_avatar_active = 0;
    ui_begin_text(str, 0);
}

void UIShowTextAvatar(const unsigned char *str, u8 avatar_index)
{
    ui_avatar_active = 1;
    ui_avatar_tile = (u8)(AVATAR_TILE0 + avatar_index * 2);
    ui_begin_text(str, 4);
}

/* Draw ui_text into the box all at once (no typewriter). Column TXT_COL0 is
 * left for the menu cursor. */
static void ui_draw_all(void)
{
    u8 r = 0, c = 0, i;
    for (i = 0; i < ui_len; i++)
    {
        char ch = ui_text[i];
        if (ch == '\n')
        {
            r++;
            c = 0;
            continue;
        }
        if (r < TXT_ROWS && c < TXT_COLS - 1)
        {
            ui_map[(TXT_ROW0 + r) * 32 + (TXT_COL0 + 1 + c)] = UI_CHAR(ch);
        }
        c++;
    }
}

/* Menu options, 1 or 2 columns (ui_menu_cols). Option index -> (row, col). */
static void ui_option_cell(u8 opt, u8 *row, u8 *col)
{
    if (ui_menu_cols == 2)
    {
        *row = opt % MENU_ROWS_PER_COL;
        *col = opt / MENU_ROWS_PER_COL;
    }
    else
    {
        *row = opt;
        *col = 0;
    }
}

static void ui_draw_menu_options(void)
{
    u8 opt = 0, c = 0, i;
    for (i = 0; i < ui_len; i++)
    {
        char ch = ui_text[i];
        if (ch == '\n')
        {
            opt++;
            c = 0;
            continue;
        }
        {
            u8 row, col;
            ui_option_cell(opt, &row, &col);
            if (row < TXT_ROWS)
            {
                u8 cx = TXT_COL0 + 1 + col * MENU_COL_W + c;
                if (cx < 32)
                {
                    ui_map[(TXT_ROW0 + row) * 32 + cx] = UI_CHAR(ch);
                }
            }
        }
        c++;
    }
}

static void ui_draw_cursor(void)
{
    u8 i;
    for (i = 0; i < ui_menu_count; i++)
    {
        u8 row, col;
        u16 e = UI_ENTRY(UI_BOX_FILL);
        ui_option_cell(i, &row, &col);
        if (i == ui_menu_index) e = UI_ENTRY(UI_CURSOR_TILE);
        ui_map[(TXT_ROW0 + row) * 32 + (TXT_COL0 + col * MENU_COL_W)] = e;
    }
}

void UIShowMenu(u16 flag, const unsigned char *str, u8 cancel_cfg, u8 layout)
{
    u8 i;
    ui_subst(str);
    ui_menu_count = 1;
    for (i = 0; i < ui_len; i++)
    {
        if (ui_text[i] == '\n') ui_menu_count++;
    }
    ui_menu_cols = 1;
    if (layout == 1) ui_menu_cols = 2;
    /* clamp to what the biggest box holds, then shrink the box to the rows the
     * options actually use (1 col: one row each; 2 cols: <= MENU_ROWS_PER_COL). */
    if (ui_menu_count > (u8)((BOX_ROWS - 2) * ui_menu_cols))
    {
        ui_menu_count = (u8)((BOX_ROWS - 2) * ui_menu_cols);
    }
    {
        u8 mrows = ui_menu_count;
        if (ui_menu_cols == 2)
        {
            mrows = (u8)((ui_menu_count + 1) >> 1);
            if (mrows > MENU_ROWS_PER_COL) mrows = MENU_ROWS_PER_COL;
        }
        ui_set_box(mrows);
    }
    ui_menu_flag = flag;
    ui_menu_index = 0;
    ui_menu_cancel = cancel_cfg;
    ui_state = 4;
    ui_script_wait = 1;

    ui_frame_box();
    ui_draw_menu_options();
    ui_draw_cursor();
    ui_dirty = 1;
    ui_slide_reset();
}

static void ui_reveal_char(void)
{
    char ch;
    if (ui_pos >= ui_len)
    {
        ui_state = 2;
        return;
    }
    ch = ui_text[ui_pos++];
    if (ch == '\n')
    {
        ui_col = 0;
        ui_row++;
        return;
    }
    if (ui_row < TXT_ROWS && ui_col < TXT_COLS - ui_xoff)
    {
        ui_map[(TXT_ROW0 + ui_row) * 32 + (TXT_COL0 + ui_xoff + ui_col)] =
            UI_CHAR(ch);
        ui_dirty = 1;
    }
    ui_col++;
    if (ui_col >= TXT_COLS - ui_xoff)
    {
        ui_col = 0;
        ui_row++;
    }
}

static void ui_render_avatar(void)
{
    u8 show = 0;
    if (ui_avatar_active)
    {
        if (ui_scroll_y == 0)
        {
            if (ui_state == 1 || ui_state == 2) show = 1;
        }
    }
    if (show)
    {
        /* box top-left: TXT_COL0*8, TXT_ROW0*8 */
        oamSet(AVATAR_OID, TXT_COL0 * 8, TXT_ROW0 * 8, 2, 0, 0, ui_avatar_tile, 2);
        oamSetEx(AVATAR_OID, OBJ_LARGE, OBJ_SHOW);
    }
    else
    {
        oamSetVisible(AVATAR_OID, OBJ_HIDE);
    }
}

/* ---- overlay (M5d/M5e) ------------------------------------------------ */

static void ui_overlay_fill_from(u8 row)
{
    u16 r, c;
    /* An overlay parked at/below the screen bottom (OVERLAY_MOVE_TO off the
     * bottom edge) is fully hidden - fill nothing. Leaving fill tiles in the
     * off-screen rows painted a stray dark line along the bottom edge, because
     * a sliver of row 28 still shows in the overscan area. A genuine curtain
     * (row on-screen) still fills all the way down. */
    u8 hidden = row >= UI_SCREEN_ROWS;
    for (r = 0; r < 32; r++)
    {
        u16 e = UI_BLANK;
        if (!hidden && r >= row) e = UI_ENTRY(UI_FILL_TILE);
        for (c = 0; c < 32; c++)
        {
            ui_map[r * 32 + c] = e;
        }
    }
    ui_flush_full = 1;
    ui_dirty = 1;
}

void UIOverlayShow(u8 color_idx, u8 top_row)
{
    (void)color_idx; /* the UI palette is fixed; always the dark fill for now */
    ui_overlay = 1;
    ui_ov_row = top_row;
    ui_ov_target = top_row;
    ui_ov_wait = 0;
    ui_overlay_fill_from(top_row);
}

void UIOverlayMoveTo(u8 top_row, u8 speed)
{
    ui_ov_target = top_row;
    ui_ov_speed = speed;
    ui_ov_tick = 0;
    ui_ov_wait = 1;
}

void UIOverlayHide(void)
{
    u16 i;
    for (i = 0; i < 32 * 32; i++)
    {
        ui_map[i] = UI_BLANK;
    }
    ui_overlay = 0;
    ui_ov_wait = 0;
    ui_flush_full = 1;
    ui_dirty = 1;
}

static void ui_update_overlay(void)
{
    if (!ui_overlay)
    {
        return;
    }
    if (ui_ov_row == ui_ov_target)
    {
        if (ui_ov_wait)
        {
            ui_ov_wait = 0;
            script_action_complete = 1;
        }
        return;
    }
    if (ui_ov_speed != 0)
    {
        ui_ov_tick++;
        if (ui_ov_tick < ui_ov_speed)
        {
            return;
        }
        ui_ov_tick = 0;
    }
    if (ui_ov_row < ui_ov_target) ui_ov_row++;
    else ui_ov_row--;
    ui_overlay_fill_from(ui_ov_row);
}

/* ---- per-frame ---------------------------------------------------------- */

void UIUpdate(void)
{
    ui_update_overlay();
    ui_render_avatar();

    if (ui_state == 0)
    {
        return;
    }

    /* M5e: slide the box up into place before typing/menu input starts. */
    if (ui_scroll_y != 0)
    {
        if (ui_state == 1 || ui_state == 4)
        {
            if (ui_speed_tick(ui_slide_in_speed))
            {
                ui_scroll_y += SLIDE_STEP;
                if (ui_scroll_y > 0) ui_scroll_y = 0;
                bgSetScroll(2, 0, (u16)ui_scroll_y);
            }
            return;
        }
    }

    if (ui_state == 1)
    {
        /* One character per tick (~60 chars/s at the default text_speed=1,
         * matching the GB engine's default text_draw_speed=1 rate), gated by
         * TEXT_SET_ANIM_SPEED's ui_text_speed via ui_speed_tick(). */
        if (ui_speed_tick(ui_text_speed))
        {
            ui_reveal_char();
        }
        return;
    }

    if (ui_state == 2)
    {
        u8 b = time & 0x10;
        if (b != ui_blink)
        {
            u16 e = UI_ENTRY(UI_BOX_FILL);
            ui_blink = b;
            if (b) e = UI_ENTRY(UI_CURSOR_TILE);
            /* inside the frame, bottom-right corner of the text area */
            ui_map[((u8)(box_row0 + box_rows - 2)) * 32 + 29] = e;
            ui_dirty = 1;
        }
        if ((joy & KEY_A) && !(prev_joy & KEY_A))
        {
            ui_state = 3;
        }
        return;
    }

    if (ui_state == 4)
    {
        u8 up = 0, dn = 0, lt = 0, rt = 0, a = 0, bcancel = 0;
        if ((joy & KEY_UP) && !(prev_joy & KEY_UP)) up = 1;
        if ((joy & KEY_DOWN) && !(prev_joy & KEY_DOWN)) dn = 1;
        if ((joy & KEY_LEFT) && !(prev_joy & KEY_LEFT)) lt = 1;
        if ((joy & KEY_RIGHT) && !(prev_joy & KEY_RIGHT)) rt = 1;
        if ((joy & KEY_A) && !(prev_joy & KEY_A)) a = 1;
        if (ui_menu_cancel & 2)
        {
            if ((joy & KEY_B) && !(prev_joy & KEY_B)) bcancel = 1;
        }

        if (up && ui_menu_index > 0)
        {
            ui_menu_index--;
            ui_draw_cursor();
            ui_dirty = 1;
        }
        if (dn && ui_menu_index + 1 < ui_menu_count)
        {
            ui_menu_index++;
            ui_draw_cursor();
            ui_dirty = 1;
        }
        if (ui_menu_cols == 2)
        {
            if (lt && ui_menu_index >= MENU_ROWS_PER_COL)
            {
                ui_menu_index -= MENU_ROWS_PER_COL;
                ui_draw_cursor();
                ui_dirty = 1;
            }
            if (rt && ui_menu_index + MENU_ROWS_PER_COL < ui_menu_count)
            {
                ui_menu_index += MENU_ROWS_PER_COL;
                ui_draw_cursor();
                ui_dirty = 1;
            }
        }
        if (a)
        {
            u8 val = ui_menu_index + 1;
            if (ui_menu_cancel & 1)
            {
                if (ui_menu_index + 1 == ui_menu_count) val = 0;
            }
            if (ui_menu_flag <= NUM_VARIABLES) script_variables[ui_menu_flag] = val;
            ui_state = 3;
        }
        else if (bcancel)
        {
            if (ui_menu_flag <= NUM_VARIABLES) script_variables[ui_menu_flag] = 0;
            ui_state = 3;
        }
        return;
    }

    /* ui_state == 3: closing - slide back down first, then blank + release. */
    if (ui_scroll_y > SLIDE_HIDDEN)
    {
        if (ui_speed_tick(ui_slide_out_speed))
        {
            ui_scroll_y -= SLIDE_STEP;
            if (ui_scroll_y < SLIDE_HIDDEN) ui_scroll_y = SLIDE_HIDDEN;
            bgSetScroll(2, 0, (u16)ui_scroll_y);
        }
        return;
    }
    /* Restore what was under the box: overlay fill row-by-row if one is up
     * (its covered region may not be the whole box), else blank. */
    if (ui_overlay)
    {
        u8 r;
        for (r = 0; r < BOX_ROWS; r++)
        {
            u16 e = UI_BLANK;
            u8 c;
            if ((u8)(BOX_ROW0 + r) >= ui_ov_row) e = UI_ENTRY(UI_FILL_TILE);
            for (c = 0; c < 32; c++)
            {
                ui_map[(BOX_ROW0 + r) * 32 + c] = e;
            }
        }
    }
    else
    {
        ui_fill_box(UI_BLANK);
    }
    ui_dirty = 1;
    ui_state = 0;
    bgSetScroll(2, 0, 0);
    if (ui_script_wait)
    {
        ui_script_wait = 0;
        script_action_complete = 1;
    }
}

void UIFlush(void)
{
    if (!ui_dirty)
    {
        return;
    }
    ui_dirty = 0;
    if (ui_flush_full)
    {
        ui_flush_full = 0;
        dmaCopyVram((u8 *)ui_map, UI_MAP_VRAM, 32 * 32 * 2);
    }
    else
    {
        dmaCopyVram((u8 *)&ui_map[BOX_ROW0 * 32], UI_MAP_VRAM + BOX_ROW0 * 32,
                    BOX_ROWS * 32 * 2);
    }
}

u8 UIIsClosed(void)
{
    if (ui_state != 0) return 0;
    if (ui_overlay)
    {
        /* An overlay that has scrolled fully off the bottom of the screen no
         * longer blocks the player - mirrors the GB engine, where a window
         * parked at MENU_CLOSED_Y counts as closed. OVERLAY_MOVE_TO never
         * clears ui_overlay (only OVERLAY_HIDE does), so the common
         * "OVERLAY_SHOW then slide it away" reveal would otherwise kill d-pad
         * movement for the rest of the game. */
        if (ui_ov_row < UI_SCREEN_ROWS) return 0;
        if (ui_ov_target < UI_SCREEN_ROWS) return 0;
    }
    return 1;
}
