---
title: Scripting Events
nav_order: 6
has_children: true
---

# Scripting Events

GB2SNES Studio's visual scripting lets you control what happens in your game without writing
code, by adding a sequence of events to a script. Scripts are attached to scenes, actors and
triggers, and edited in the Script Editor panel in the sidebar of the World editor.

## Adding events

Click the **Add Event** button at the point in the script where you want to add one, then
search or browse by category for the event you want. Events are grouped the same way as on the
[Event Reference](event-reference.html) pages.

## Favorite events

Hover over an event in the Add Event list and click its star icon to mark it a favorite.
Favorited events appear under their own **Favorites** category at the top of the list, so the
events you use most are always one click away.

## Copy and paste events

Each event, and each whole script, has its own menu with **Copy**, **Paste Before**, **Paste
After** and **Delete** - use it to duplicate an event (or a whole script) and move the copy
elsewhere in the same script, a different script, or even a different project.

## Types of scripts

- **Scene scripts** - On Init (runs once when the scene loads), On Player Hit.
- **Actor scripts** - On Init, On Interact (player presses the action button facing the
  actor), On Hit, On Update (runs every frame).
- **Trigger scripts** - On Trigger (player walks into the trigger's area).

## Learn more

- [Event Reference](event-reference.html) - every event with Full SNES support, one page per
  category, described individually.
- [Dialogue Variables](dialogue-variables.html) - inserting a variable's value, or an inline
  typewriter-speed code, into dialogue text.

For events with only Partial support, or that are still inert placeholders, see
[`appData/src/snes/EVENTS.md`](https://github.com/alekmaul/gbsnes-studio/blob/v4/appData/src/snes/EVENTS.md) -
the authoritative, per-event support matrix, kept in sync whenever an opcode's behavior changes.

## Scene types

Each scene has a _Scene Type_ (Top Down, Platformer, Adventure, Shoot 'Em Up, or Point and
Click) which changes which events and default behaviors are available - see
[Scenes](scenes.html). Adventure is still a work in progress.
