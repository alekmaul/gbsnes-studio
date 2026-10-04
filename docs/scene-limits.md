---
title: Limits
parent: Scenes
grand_parent: Project Editor
nav_order: 1
---

# Scene Limits

Every limit below comes from a real SNES hardware budget - mostly VRAM, which is shared
between a scene's background, its UI (dialogue/menu box) and its actor sprites. The numbers
are defined in one place in the compiler (`src/lib/compiler/targets/snes.js`), so the editor's
warnings and the engine's own real ceiling can't drift apart.

## Scene size

- Both dimensions must be a multiple of 8px.
- Minimum size: **256px x 224px** (the SNES screen size).
- **Width**: up to **2040px (255 tiles)**. Up to 512px (64 tiles) needs no special handling;
  beyond that the engine streams tile columns into VRAM automatically as the camera scrolls,
  up to the real hard ceiling of 255 tiles (the compiled background-width byte can't hold
  more).
- **Height**: up to **512px (64 tiles)** - this is a hard limit. There's no vertical
  equivalent of the horizontal streaming above yet, so a taller background won't compile.

See [Backgrounds](backgrounds.html) for how a background image itself is prepared.

## VRAM budget

A scene's background, UI box and actor sprites each live in their own fixed region of video
memory:

| Region | Budget |
| --- | --- |
| Background tileset (unique 8x8 tiles) | **256 tiles** |
| Background tilemap | up to 64x64 tiles (streamed beyond that on the width axis) |
| Actor sprite sheets loaded at once | **8** (shown as `S: n/8` in the status bar) |
| UI box (font, frame, cursor) | fixed, doesn't share budget with the background |

{: .note }
> The 256-tile background budget is usually the first thing a large or detail-heavy scene
> hits - well before the 64x64 tilemap or 255-tile-wide streaming ceiling. Reusing tiles
> across the image is the only way to stay under it; see [Backgrounds](backgrounds.html#tiles).

## Per-scene entities

The status bar under each scene shows `A: n/19`, `S: n/8` and `T: n/30`:

- **Actors** - up to **19** per scene. The engine reserves one extra slot for the player, so
  although the underlying array holds 20 actors, only 19 are available for the ones you place.
- **Sprite sheets** (`S`) - up to **8** distinct actor sprite sheets loaded into VRAM at once
  per scene (the player's own sheet counts as one). This replaces Game Boy's per-frame VRAM
  budget, since the SNES engine pre-loads whole sprite sheets per scene instead of streaming
  individual frames. A scene needing more than 8 still compiles - any sheet past the 8th falls
  back to the player's own slot - see `appData/src/snes/EVENTS.md` for the details.
- **Triggers** - up to **30** per scene.

{: .note }
> A scene no bigger than one screen (256x224px) gets a lower *recommended* actor count (10)
> in the editor - this is authoring guidance only, not a hard limit. The real ceiling is
> always 19, regardless of scene size.

## Scripts

A single compiled script (all the events on one actor, trigger or scene, including anything
reached by Call Script) must fit in **32 KB**. This is generous in practice - it's the same
budget as an entire SNES memory bank - but a very large script built from many nested
conditionals and loops can still hit it; split it across multiple Custom Events if so.
