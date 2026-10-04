---
title: UI Elements
parent: Assets
nav_order: 4
---

# UI Elements

The dialogue box, menus and on-screen text are all drawn from three PNG files in your
project's `assets/ui` folder. Every new project starts with a default set - replace them to
restyle the box, font and cursor to match your game.

{: .note }
> Unlike sprites and backgrounds, these use a shared palette of up to 4 colors across all
> three files (BG3, a background layer separate from your scene). Keep stray anti-aliased or
> resave-artefact pixels out of `frame.png`/`cursor.png` - since they're so small, even one
> odd pixel can claim a palette slot that should've gone to your font's ink color.

## `ascii.png` - the font

A **128px x 112px** grid of 8px x 8px glyphs, 16 columns x 14 rows (224 tiles), covering
character codes 0x20-0xFF in order - the same layout and character range as Game Boy's own
font asset, so an existing GB Studio font image can be reused directly. The first glyph
(0x20, space) is always treated as fully transparent, regardless of what's drawn there.

## `frame.png` - the dialogue/menu box frame

A **24px x 24px**, 3x3 grid of 8px x 8px tiles - a standard 9-slice frame (4 corners, 4
edges, 1 center fill), stretched by the engine to fit however tall a given dialogue or menu
box needs to be.

## `cursor.png` - the menu cursor

A single **8px x 8px** tile - the `>` arrow shown next to the currently-selected choice in a
Menu/Choice event.

## Emotes

Emote bubbles (shown by the `Actor: Emote` event) are a separate, per-project asset type -
one 16px x 16px PNG per emote in `assets/emotes`, up to 8. These don't share the BG3 UI
palette above (they're sprites, drawn on a dedicated OBJ palette instead) - but unlike a
regular sprite sheet, every emote in the project shares that **one** 16-color palette between
them, so keep the full set's combined colors to 16 or fewer for a predictable result.
