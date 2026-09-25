---
title: Scenes
parent: Project Editor
nav_order: 1
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

{: .note }
> GB Studio's Colorizing tool doesn't apply here - see [Project Editor](project-editor.html)
> for why.

<img src="/gbsnes-studio/assets/images/screenshots/scene-collisions.gif" alt="Scene Collision" width="600" />

## Scene limits

The status bar under each scene shows `A: n/20`, `S: n/8` and `T: n/30`:

- **Actors** - up to **20** per scene.
- **Sprite sheets** (`S`) - up to **8** distinct actor sprite sheets loaded at once per
  scene (the player counts as one). This replaces Game Boy's per-frame VRAM budget, since
  the SNES engine pre-loads whole sprite sheets per scene instead. See
  [Scripting Events](scripting-events.html) / `appData/src/snes/EVENTS.md` for what happens
  if a scene needs more than 8.
- **Triggers** - up to **30** per scene.
- A scene's size is set by its background image - see [Backgrounds](backgrounds.html) for
  the real size limits (up to 512px x 512px with no special handling, wider still for a
  horizontally-scrolling scene via VRAM streaming).
