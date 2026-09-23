---
title: Backgrounds
parent: Assets
nav_order: 1
---

# Backgrounds

Each of your scenes requires a background image that defines how that scene should look. Add
backgrounds to your game by including PNG files in your project's `assets/backgrounds`
folder.

## Colors

Unlike GB Studio's fixed 4-shade requirement, SNES backgrounds use a real palette extracted
directly from your PNG - up to **16 colors** per background. Export as an indexed PNG with
16 colors or fewer for a predictable result; if your image has more than 16 distinct colors,
the extras are snapped to the nearest already-kept color and a warning is shown.

## Size

- Both dimensions must be a multiple of 8px.
- Minimum size: **256px x 224px** (the SNES screen size).
- Maximum size: **256px x 256px**.

An undersized background still compiles (you'll get a warning in the editor), it just won't
fill the screen.

## Tiles

A background can contain no more than **256** unique 8px x 8px tiles at once, due to VRAM
limits (versus 192 on Game Boy). Reusing tiles across an image helps stay under this limit on
more detailed backgrounds.

<!-- TODO: add screenshot here - docs/assets/images/screenshots/background-example.png
<img src="/gbsnes-studio/assets/images/screenshots/background-example.png" alt="Background example" width="512" />
-->
