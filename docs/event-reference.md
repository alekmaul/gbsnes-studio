---
title: Event Reference
parent: Scripting Events
has_children: true
nav_order: 2
---

# Event Reference

A per-event breakdown of every scripting event with **Full** SNES support, one page per
category, one event per entry.

For events with only **Partial** support, or that are still inert placeholders, see
[`appData/src/snes/EVENTS.md`](https://github.com/alekmaul/gbsnes-studio/blob/v4/appData/src/snes/EVENTS.md) -
the authoritative, per-event support matrix, kept in sync whenever an opcode's behavior changes.

## Categories

- [Text](events-text.html) - dialogue, choices, menus, overlays.
- [Scene](events-scene.html) - scene transitions, state stack, camera, fades, mosaic.
- [Variables & Math](events-variables.html) - variables, flags, math, expressions.
- [Control Flow](events-control-flow.html) - conditionals, loops, custom events.
- [Actors](events-actors.html) - position, movement, appearance, animation.
- [Timers & Input](events-timers-input.html) - timer scripts, button checks, input scripts.
- [Music & Sound](events-music.html) - music playback.
- [Save Data](events-save-data.html) - cartridge SRAM save slots.
- [Projectiles](events-projectiles.html) - launched sprites, melee attacks, bounce.
- [Engine Fields](events-engine-fields.html) - runtime reads/writes of per-genre constants.
