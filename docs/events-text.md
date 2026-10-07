---
title: Text
parent: Event Reference
grand_parent: Scripting Events
nav_order: 1
---

# Text

Dialogue, choices, menus and the overlay panel - all drawn on the BG3 dialogue-box layer.

**Display Text** - shows one or more pages of dialogue in the box, with a typewriter reveal
effect and word-wrap. Supports inserting variable values and inline typewriter-speed codes -
see [Dialogue Variables](dialogue-variables.html) for the full list.

**Display Text with Avatar** - the same as Display Text, with a 16x16 portrait shown alongside
the text.

**Display Choice** - a yes/no prompt; the result is stored in a variable.

**Display Menu** - a scrollable list of options (1 or 2 columns), navigated with Up/Down and
confirmed with A/B; the chosen option is stored in a variable.

**Text: Set Animation Speed** - sets the dialogue box's slide-in/slide-out speed and the default
typewriter speed used by every Display Text event that follows, until changed again.

**Overlay Show** - shows a solid panel that can cover part or all of the screen, independent of
the dialogue box.

**Overlay Move To** - slides the overlay panel to a new row.

**Overlay Hide** - hides the overlay panel.
