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

**Actor: Set Animation Speed** - how fast the active actor's frames follow each other.

**Actor: Set Animate** - toggles the "Animate" setting: whether the actor's frames also cycle
while it stands still (a moving actor always animates).

**Actor: Set Frame** - shows a frame of the current animation, counted from 0. An animating
actor goes on from there.

**Actor: Set Frame to Variable** - same as **Actor: Set Frame**, reading the frame number from
a variable instead of a literal value.

**Actor: Set Sprite Sheet** - changes the sheet of the active actor. The sheet starts in its
default state.

**Player: Set Sprite Sheet** - the same event, for the player.

**Actor: Set Animation State** - shows one of the sheet's named
[animation states](sprites.html#animation-states), for the player or an actor. A sheet without a
state of that name shows its default one.

{: .note }
> There is no "Set Flip" event: mirroring is part of a sheet's animations.

**Actor Emote** - shows a speech-bubble icon over the actor's head for a moment.

**Set Collisions Enabled** - re-enables collision for the active actor.

**Set Collisions Disabled** - disables collision for the active actor.
