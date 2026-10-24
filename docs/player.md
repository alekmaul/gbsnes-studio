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

{: .note }
> A scene pre-loads up to 8 sprite sheets when it starts. Switching to one of those is
> instant. Switching to any other sheet loads its graphics while the game runs, into a
> slot reserved for that actor - up to 2 such actors per scene. A 3rd one, or a Free-form
> (Metasprite) sheet, can't be switched this way: the event then has no effect, and the build
> shows a warning.

When switching scenes, the player always becomes visible at the new scene's start position,
regardless of any earlier _Actor: Hide_. To keep the player hidden going into a scene (for a
title screen or cutscene), add an _Actor: Hide_ event to that scene's init script.
