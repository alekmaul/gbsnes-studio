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

<img src="/docs/assets/images/screenshots/sprite-static.png" alt="Static sprite" width="48" />

## Animated sprites

Multiple frames that cycle automatically, for things like a torch or a flag - not tied to a
direction. Supported frame counts: 2, 4, 5 or 6, at 16px height (so 32px to 96px wide).

<img src="/docs/assets/images/screenshots/sprite-animated.png" alt="Animated sprite" width="192" />

## Actor

A directional sprite: 3 frames at 48px x 16px, showing the character facing down, up and to
the side. Facing left is generated automatically by flipping the "side" frame.

<img src="/docs/assets/images/screenshots/sprite-actor.png" alt="Actor" width="288" />

## Animated Actor

A directional, walking sprite: 6 frames at 96px x 16px - two poses per direction (down,
up, side), which alternate while the actor is moving and settle to the first pose when idle.

<img src="/docs/assets/images/screenshots/sprite-actor-animated.png" alt="Animated Actor" width="288" />
