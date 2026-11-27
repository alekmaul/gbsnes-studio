---
title: Sprites
parent: Assets
nav_order: 2
---

# Sprites

Add sprites to your game by including PNG files in your project's `assets/sprites` folder, then
describe on the **Sprites** page how each image is cut into animations. The sprite system is the
one of GB Studio 3.2.1, with SNES colours and SNES tile sizes.

## Requirements

- A sheet is a PNG of any size. It is a stock of tiles: you place the parts you need onto a
  frame, so they can be laid out as you like.
- The colour of the **top-left pixel** is transparent, as are see-through pixels. Keep that
  pixel in the colour you use for "empty".
- A sheet can use **15 colours** besides the transparent one. Extra colours are replaced by the
  closest one, with a build warning.

## Simple sheets

A new sheet whose image is **16px high** is set up automatically from its width:

| Width | Frames | Animation type |
| --- | --- | --- |
| 16px | 1 | Fixed Direction |
| 48px | 3: down, up, right | Four Directions |
| 96px | 6: two of each of down, up, right | Four Directions + Movement |
| other multiples of 16px | all of them, in a loop | Fixed Direction |

Facing left mirrors the "right" frames.

<img src="/gbsnes-studio/assets/images/screenshots/sprite-actor.png" alt="Actor" width="288" />

Any other image starts with an empty state for you to fill. **Auto Detect Animations** redoes
this setup at any time (it replaces what the sheet had).

## Animation states

A sheet has one **default state** and any number of named states ("Jump", "Hurt", ...). Add them
with **Add Animation State**. The _Actor: Set Animation State_ event shows a state by its name;
a sheet without a state of that name shows its default one.

Each state has an **Animation Type**, which decides the animations you fill in:

| Animation type | Animations |
| --- | --- |
| Fixed Direction | Idle |
| Fixed Direction + Movement | Idle, Moving |
| Four Directions | Right, Left, Up, Down |
| Four Directions + Movement | Idle and Moving for each of the four directions |
| Platformer Player | Idle, Jump and Moving to the right and left, Climbing |
| Cursor | Idle, Hover (the Point and Click cursor over something clickable) |

**Flip 'Right' To Create 'Left' Facing Frames** (on by default where it applies) builds the left
animations by mirroring the right ones, so you only draw one side.

To keep an actor in one pose whatever its direction, give it a **Fixed Direction** sheet or
state.

## Frames and tiles

An animation is a list of frames, shown in the timeline under the canvas: add, clone, delete and
drag frames to reorder them.

A frame is made of **tiles** taken from the sheet:

1. In the **Tiles** panel, choose **8x8** or **16x16** - the two sprite sizes of the SNES used
   here - then drag a selection over the image. Larger selections are cut into tiles of that
   size.
2. Click the canvas to place them, or drag them there from the panel.
3. Select placed tiles to move them (arrow keys: 1px, with Shift: 8px), flip them (`X` / `Z`),
   bring them to the front or back, replace them, copy/paste or delete them.

**Display Behind Background** draws a tile behind the scene's background. **Onion Skin** shows
the previous frame under the one you edit, and **Show Grid** and **Precision Selection** help
placing tiles.

A frame can be larger than 16x16: set the sheet's **Canvas Size**. The bottom centre of the
canvas is the actor's position; tiles must stay within 128px of it.

The **Collision Bounding Box** is used by the player in the Adventure scene type. Elsewhere
collisions are tile based: an actor occupies 2x2 tiles whatever its size.

Animation speed is a setting of each actor (_Animation Speed_ in the actor's panel, or the
_Actor: Set Animation Speed_ event). A moving actor always animates; an idle one only when
**Animate** is ticked.

## Limits

| Per scene | Limit |
| --- | --- |
| Sprite sheets (the player's included) | 32 |
| Tiles of video memory for sprites | 416 tiles of 8x8, shared by all its sheets |
| Of which tiles placed as 8x8 sprites | 256 (a 16x16 tile has no such limit) |
| Hardware sprites on screen | 128 (actor tiles, emote, projectiles, portrait) |
| Colour palettes for sprite sheets | 6 of 16 colours |

Identical tiles, mirrored ones included, are stored once. When a scene uses more sheets than
there are palettes, sheets share them, keeping their colours as long as they fit; beyond that,
colours are replaced by close ones. The build warns when a limit is exceeded.

Every sheet a scene can show - its actors, the player, projectiles and _Set Sprite Sheet_
events - is loaded when the scene starts.

## Dialogue portraits

The portrait of _Display Dialogue_ is a **16x16** sheet. Its transparent pixels take the colour
of the dialogue box, and the portraits of one scene share 15 colours.
