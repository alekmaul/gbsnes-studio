---
title: Scene
parent: Event Reference
grand_parent: Scripting Events
nav_order: 2
---

# Scene

Scene transitions, the state stack, camera control and screen fades.

**Switch Scene** - moves the player to a different scene, with a fade-out/fade-in handshake
around the switch.

**Scene Push State** - saves a snapshot (scene, player tile position, facing) onto a stack
before switching scenes - e.g. before opening a pause-menu scene.

**Scene Pop State** - returns to the most recently pushed snapshot, restoring exactly where the
player was.

**Scene Pop All State** - clears the entire snapshot stack, returning to the very first one.

**Scene Reset State Stack** - empties the stack without switching scenes.

**Camera Move To** - moves the camera to a new position, clamped to the SNES screen size
(32x28 tiles).

**Camera Lock** - returns the camera to following the player.

**Camera Shake** - shakes the camera for a period of time.

**Fade In** - fades the screen in from black.

**Fade Out** - fades the screen out to black.
