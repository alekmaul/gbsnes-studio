---
title: Scripting Events
nav_order: 6
---

# Scripting Events

GBSNES Studio's visual scripting is attached to scenes, actors and triggers:

- **Scene scripts** - On Init (runs once when the scene loads), On Player Hit.
- **Actor scripts** - On Init, On Interact (player presses the action button facing the
  actor), On Hit, On Update (runs every frame).
- **Trigger scripts** - On Trigger (player walks into the trigger's area).

## Event categories

- Text - dialogue, choices, menus
- Scene - switching scenes, camera, screen fades, overlay
- Variables & math
- Control flow - if/switch/loop, custom events, groups
- Actors - position, movement, appearance, animation, direction
- Timers & input - timer scripts, button-press events, including SNES's X/Y/L/R
- Music & sound
- Save data
- Engine fields

## SNES support

Every scripting event compiles and dispatches the same way on both targets - opcode numbers
are shared and locked by a test (`test/data/compiler/snesScriptCmds.test.js`). What varies is
what the SNES **engine** actually does with each event at runtime: most behave identically to
Game Boy, a handful work with a noted limitation, and a few are still inert placeholders.

The full, up-to-date, per-event breakdown lives in the engine repository and is kept in sync
whenever an opcode's behavior changes - rather than duplicate it here (and risk it drifting
out of date), see:

**[`appData/src/snes/EVENTS.md`](https://github.com/alekmaul/gbsnes-studio/blob/main/appData/src/snes/EVENTS.md)**
