---
title: Sprites
parent: Assets
nav_order: 2
---

# Sprites

Add sprites to your game by including PNG files in your project's `assets/sprites` folder.

## Requirements

Sprites are made of **16px x 16px** frames laid out horizontally in the file.

Unlike GB Studio's fixed 4-color requirement, SNES sprites use a real palette extracted
directly from your PNG - up to **16 colors** per sheet. The color of the **top-left pixel**
of the sheet is always treated as transparent (index 0), regardless of what color it
actually is - keep that pixel as whatever color you're using for "empty" in your sprite.
Colors beyond the 16-color limit are snapped to the nearest already-kept color, with a
warning.

## Static sprites

A single, non-animated frame. Size: 16px x 16px.

<img src="/gbsnes-studio/assets/images/screenshots/sprite-static.png" alt="Static sprite" width="48" />

## Animated sprites

Multiple frames that cycle automatically, for things like a torch or a flag - not tied to a
direction. Supported frame counts: 2, 4, 5 or 6, at 16px height (so 32px to 96px wide).

<img src="/gbsnes-studio/assets/images/screenshots/sprite-animated.png" alt="Animated sprite" width="192" />

## Actor

A directional sprite: 3 frames at 48px x 16px, showing the character facing down, up and to
the side. Facing left is generated automatically by flipping the "side" frame.

<img src="/gbsnes-studio/assets/images/screenshots/sprite-actor.png" alt="Actor" width="288" />

## Animated Actor

A directional, walking sprite: 6 frames at 96px x 16px - two poses per direction (down,
up, side), which alternate while the actor is moving and settle to the first pose when idle.

<img src="/gbsnes-studio/assets/images/screenshots/sprite-actor-animated.png" alt="Animated Actor" width="288" />

## Free-form (Metasprite) mode

Compose a bigger sprite out of several individually-placed 16x16 tiles instead of one fixed
block - a 16x32 character, a wide boss, an asymmetric prop. Unlike the other sprite types
above, a Free-form sheet's frame *content* is something you build on a canvas rather than a
fixed layout in the source PNG.

### Turning it on

In the Sprites page's right-hand panel, check **Free-form (Metasprite)**. This is a separate
toggle from **Animation Type** above it, not a 4th option of that same dropdown - Animation
Type still decides how many frames your sheet has and what they mean (a plain frame, one of 3
directions, or one of 6 walk-cycle poses); Free-form only changes what you can put *inside*
each of those frames.

Once it's on:

- **Canvas Size** becomes editable (16-128px, in 16px steps) instead of staying fixed at
  16x16 - free-form mode exists specifically to build something bigger than that one block.
- The center column switches to the tile editor: a toolbar, the composing canvas, a tile
  palette sliced from your sheet's own PNG, and a frame strip along the bottom.

### Placing and editing tiles

1. Click a 16x16 cell in the **Tiles** palette (bottom panel) to pick it.
2. Click anywhere on the canvas above to stamp a copy of that tile there, snapped to the
   nearest 16px grid position.
3. Click an already-placed tile to select it (shift-click to add to the selection; drag a
   box on empty canvas to select everything inside it).
4. With a tile selected: drag to move it, arrow keys to nudge by 1px (hold Shift for a
   whole 16px step), Delete/Backspace to remove it, or use the toolbar's flip/front/back
   buttons. The right panel also shows the selected tile's own X/Y, flip, and a "Display
   Behind Background" checkbox - checking it draws that one tile above foreground-priority
   background tiles instead of the usual layer order, the same priority bit a painted
   priority tile on a scene's background already uses.

Use the **Zoom** controls in the Tiles panel's header (and the app toolbar's own zoom, which
scales the composing canvas) to work at a comfortable size - a 16x16 tile is small.

The dashed amber box on the canvas is your sheet's existing **Collision Bounding Box**
(from the panel above) shown as a reference - it's not consumed by collision yet (this
engine's actor collision is tile-based, not per-sprite-bounds), purely a visual aid.

### How it renders in-game

Every placed tile becomes a real hardware sprite entry, positioned relative to the actor the
same way a normal 16x16 sprite is (horizontally centered, feet at the bottom of the actor's
tile) - so a single tile on a 16x16 canvas looks identical to a non-Free-form sprite, and
extra tiles extend outward from there. Identical tiles (same source region, same flip) reuse
the same VRAM data automatically, the same sharing a normal multi-pose sheet already gets.

If **Animation Type** is **Four Directions** or **Four Directions + Movement**, the "side"
frame's whole placed-tile set automatically mirrors (position and pixels) when the actor
faces the opposite direction - you only ever author one side, same as a normal Actor sheet.

### Adding or removing a whole frame

This only works for sheets set to **Animation Type: Fixed** - the frame strip at the
bottom gets **+**/**−** buttons. Fixed sheets have no directional meaning (they're a plain
auto-cycling animation, like a torch or an explosion), so growing or shrinking the frame
count is safe and well-defined.

For **Four Directions** (3 frames) and **Four Directions + Movement** (6 frames), the frame
count stays locked - those frames each mean something specific to the engine (down/up/side,
or two walk poses per direction), so there's no well-defined way to "add a 5th direction."
If you need a direction-based sheet with free-form tile content, compose the existing 3 or 6
frames instead of trying to add more.

Switching Free-form on for a Fixed sheet that already has several frames (from its PNG's own
width) keeps all of them - you're only ever adding to or removing from that starting point,
never losing frames you haven't touched yet.

### What's not built yet

- No way to resize or reorder frames other than add/remove at the end.
- No in-editor warning if a scene's actors collectively need more hardware sprite slots than
  the SNES has (128) - a very large scene leaning heavily on big composed sprites could hit
  that ceiling; nothing currently warns about it ahead of time.
