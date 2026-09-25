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

<img src="/gbsnes-studio/assets/images/screenshots/scene-collisions.png" alt="Scene Collision" width="600" />

## Scene limits

The status bar under each scene shows `A: n/9`, `S: n/8` and `T: n/9`:

- **Actors** - up to **9** per scene.
- **Sprite sheets** (`S`) - up to **8** distinct actor sprite sheets loaded at once per
  scene (the player counts as one). This replaces Game Boy's per-frame VRAM budget, since
  the SNES engine pre-loads whole sprite sheets per scene instead. See
  [Scripting Events](scripting-events.html) / `appData/src/snes/EVENTS.md` for what happens
  if a scene needs more than 8.
- **Triggers** - up to **9** per scene.
- Scenes are capped at **32x32 tiles**.
