---
title: The Player
parent: Project Editor
nav_order: 2
---

# The Player

## Start Position

The player's starting location is marked by an icon in the Game World. Click the background
between scenes to select it, then use the sidebar to set the starting scene, position,
direction and sprite sheet. You can also drag the icon directly, including onto a different
scene.

<img src="/gbsnes-studio/assets/images/screenshots/player-start-position.gif" alt="Player Start position" width="600" />

## Scripting

Most actor scripting events also apply to the player. _Actor: Set Player Sprite Sheet_
changes the player's graphics mid-game, and the change persists across scene transitions -
switch it back manually if it should only be temporary.

{: .warning }
> On SNES, _Actor: Set Player Sprite Sheet_ only works for a sheet that's already loaded
> somewhere else in the project (used by another actor, or already the player's own sheet).
> Unlike Game Boy, the SNES engine pre-loads a fixed set of sprite sheets per scene at build
> time rather than streaming new graphics into VRAM at runtime - switching to a sheet that's
> never used anywhere is a silent no-op.

When switching scenes, the player always becomes visible at the new scene's start position,
regardless of any earlier _Actor: Hide_. To keep the player hidden going into a scene (for a
title screen or cutscene), add an _Actor: Hide_ event to that scene's init script.
