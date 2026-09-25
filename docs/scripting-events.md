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

Events below are listed where SNES support is **Full** - they behave exactly like the Game
Boy target. A handful of other events work too, but only with a noted limitation, and a few
are still inert placeholders; see
[`appData/src/snes/EVENTS.md`](https://github.com/alekmaul/gbsnes-studio/blob/main/appData/src/snes/EVENTS.md)
for those and their exact caveats - it's the authoritative, up-to-date per-event breakdown,
kept in sync whenever an opcode's behavior changes.

### Text

- **Display Text** (single or multi-page) - typewriter effect, `$NN$` variable substitution,
  word-wrap.
- **Display Text with Avatar** - adds a portrait alongside the text.
- **Display Choice** - a yes/no prompt.
- **Display Menu** - a scrollable list of options, 1 or 2 columns.
- **Text: Set Animation Speed** - controls the dialogue box's slide-in/out and typewriter
  speed.
- **Overlay Show**, **Overlay Move To**, **Overlay Hide** - a solid panel that can cover part
  or all of the screen, independent of the dialogue box.

### Scene

- **Switch Scene** - with a fade-out/fade-in handshake.
- **Scene Push State**, **Pop State**, **Pop All State**, **Reset State Stack** - remember
  and restore where the player was (e.g. a pause-menu scene that returns exactly where you
  left off).
- **Camera Move To**, **Camera Lock**, **Camera Shake**.
- **Fade In**, **Fade Out**.

### Variables & math

- **Set Variable**, **Increment**, **Decrement**, **Set to Random**, **Copy Variable**.
- **Math** - add/subtract/multiply/divide/modulo, by value or by variable.
- **If Variable** (value / compare / true / false), **If Variable Flags Compare**.
- **Add Flags**, **Clear Flags**, **Set Flags**.
- **Reset All Variables**.

### Control flow

- **If / If Not**, **Switch**, **Loop**, **Label** + **Goto**.
- **Wait**.
- **Stop Script**.
- **Call Custom Event**, **Group**, **Comment**.

### Actors

- **Set Active Actor**.
- **Set Position**, **Move To** (and their to-variable / relative variants).
- **Get Position**, **Move to Vectors**, **Load Vectors**.
- **Push Actor** - in the actor's current facing direction.
- **Set Movement Speed**.
- **If Actor at Position**, **If Actor Facing Direction**.
- **Set Direction**, **Set Direction to Variable**, **Get Direction**.
- **Show Actor**, **Hide Actor**, **Show All Sprites**, **Hide All Sprites**.
- **Actor animation** - a 6-frame sheet walk-cycles while moving; a 2/4/5/6-frame "animated"
  sheet auto-cycles its frames when ticked.
- **Actor: Set Animation Speed** - paces the walk cycle / auto-cycle above.
- **Actor Emote** - a speech-bubble icon over the actor's head.
- **Set Collisions Enabled / Disabled**.

### Timers & input

- **Set Timer Script**, **Restart Timer**, **Disable Timer**.
- **If Button Pressed**, **Await Input** - all 12 SNES buttons, including X / Y / L / R.
- **Attach Script to Button** (and remove) - same 12 buttons.

### Music & sound

- **Music: Play** - the project's own `.mod` songs, converted at build time.
- **Music: Stop**.

### Save data

- **Save Data**, **Load Data**, **Clear Data**, **If Data Saved** - cartridge SRAM.
