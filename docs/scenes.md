---
title: Scenes
parent: Project Editor
nav_order: 1
has_children: true
---

# Scenes

A scene represents a single screen of your game, containing actors and triggers. Games are
typically made of many scenes, connected together with the Change Scene event.

## Adding a scene

Click the Add tool in Editor Tools, select Scene, then click in the Game World to place it.
Use the sidebar on the right to name the scene and pick a background from your
`assets/backgrounds` folder.

## Scene properties

- **Name**
- **Scene Type** - Top Down 2D, Platformer, Adventure (work in progress), Shoot Em' Up, or
  Point and Click. Changes which events and default behaviors are available for actors in
  the scene. You can also pick a default player sprite per scene type in
  [Settings](settings.html#default-player-sprites).
- **Background** - the background image this scene uses.
- **Notes** - editor-only text, not shown in the game.

## Navigation

The Navigation panel lists every Actor and Trigger in the current scene - click one to select
it.

## Scripting

Select the scene, then use the Add Event button in the sidebar to build its script. See
[Scripting Events](scripting-events.html).

## Adding collision to a scene

Select the Collisions tool, then click or drag across the scene to draw collision tiles that
block actor and player movement.

<img src="/gbsnes-studio/assets/images/screenshots/scene-collisions.gif" alt="Scene Collision" width="600" />

**Platformer scenes only** - the Collisions tool also has **Collision Top/Bottom/Left/Right**
swatches (a tile that's only solid from one side) and a **Ladder** swatch. "Collision Top"
alone makes a one-way platform: solid to land on, but the player can still jump up through it
from below. A Ladder tile lets the player climb with Up/Down while standing in its column.
Every other scene type still only ever uses the plain Solid swatch.

## Scene limits

The status bar under each scene shows `A: n/19`, `S: n/8` and `T: n/30` - actors, sprite
sheets and triggers. See [Limits](scene-limits.html) for the full numbers, including the
VRAM budget behind them.
