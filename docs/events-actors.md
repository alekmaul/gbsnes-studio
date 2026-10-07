---
title: Actors
parent: Event Reference
grand_parent: Scripting Events
nav_order: 5
---

# Actors

Position, movement, appearance and animation for the player and NPC actors.

**Set Active Actor** - selects which actor the following actor events operate on.

**Set Position** - moves the active actor to an absolute tile position instantly.

**Move To** - moves the active actor to a tile position over time, with collision; has
to-variable and relative variants.

**Get Position** - stores the active actor's current tile position into variables.

**Move to Vectors** - moves the active actor using a direction/magnitude pair instead of an
absolute destination.

**Load Vectors** - stores a direction/magnitude pair describing how to reach a target position.

**Push Actor** - pushes the active actor one tile in its current facing direction.

**Set Movement Speed** - sets how fast the active actor moves.

**If Actor at Position** - branches on whether an actor is at a given tile position.

**If Actor Facing Direction** - branches on an actor's current facing direction.

**If Actor Relative to Actor** - compares the active actor's position against another actor's.

**Set Direction** - sets the active actor's facing direction.

**Set Direction to Variable** - sets the active actor's facing direction from a variable.

**Get Direction** - stores the active actor's facing direction into a variable.

**Show Actor** - makes the active actor visible.

**Hide Actor** - makes the active actor invisible.

**Show All Sprites** - shows every actor in the scene.

**Hide All Sprites** - hides every actor in the scene.

**Activate Actor** - re-enables AI, movement, collision and interaction for the active actor,
independently of Show/Hide.

**Deactivate Actor** - disables AI, movement, collision and interaction for the active actor,
independently of Show/Hide.

**Actor: Set Animation Speed** - paces the walk-cycle (or the "Animate Frames" auto-cycle) of a
multi-frame sprite sheet.

**Actor: Set Animate** - toggles the "Animate Frames" behavior at runtime.

**Actor: Set Sprite Sheet** - swaps a non-player actor's sprite sheet mid-game, for a sheet
already loaded somewhere in the scene.

**Actor/Player: Set Sprite State** - switches to a named animation state (e.g. a costume
change) defined on the actor's sprite sheet.

**Actor Emote** - shows a speech-bubble icon over the actor's head for a moment.

**Set Collisions Enabled** - re-enables collision for the active actor.

**Set Collisions Disabled** - disables collision for the active actor.
