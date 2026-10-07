---
title: Timers & Input
parent: Event Reference
grand_parent: Scripting Events
nav_order: 6
---

# Timers & Input

Timer scripts and button input, across all 12 SNES buttons (d-pad, A, B, Select, Start, and
X / Y / L / R).

**Set Timer Script** - starts one of 4 independent per-scene timer contexts, running a script
when it elapses.

**Restart Timer** - resets a running timer's countdown.

**Disable Timer** - stops a timer before it elapses.

**If Button Pressed** - branches on whether a button is currently held.

**Await Input** - pauses the script until one of the given buttons is pressed.

**Attach Script to Button** - runs a script whenever a given button is pressed, independent of
the main script flow; can be removed again later in the same scene.
