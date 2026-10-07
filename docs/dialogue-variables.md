---
title: Dialogue Variables
parent: Scripting Events
nav_order: 1
---

# Dialogue Variables

Dialogue text fields - **Display Text**, **Display Text with Avatar**, **Display Choice** and
**Display Menu** - accept a few special codes typed directly into the text, alongside the
plain text itself. These are resolved in two stages: the compiler rewrites each code to its
final, project-independent form when the game is built, and the engine decodes that form at
runtime while the typewriter effect reveals the text.

## Inserting a variable's value

Typing one of the codes below into a dialogue field inserts that variable's current value as
decimal digits (e.g. a variable holding `42` prints as the two characters `4` `2`) the moment
the typewriter effect reaches that point in the text.

| Code     | Inserts                                                                 |
| -------- | ------------------------------------------------------------------------ |
| `$0$`    | A project (global) variable, by its number.                              |
| `$L0$`   | A **Local** variable (`L0`-`L5`) - scoped per actor/trigger/scene; the entity running the current script gets its own separate set of 6. |
| `$T0$`   | A **Temp** variable (`T0`-`T9`) - shared scratch variables, not scoped to any one entity or script; typically used to pass a value into or out of a Custom Event. |
| `$V0$`   | A Custom Event's own variable parameter (`V0`-`V9`) - only meaningful inside that Custom Event's own script, where it stands in for whichever variable the caller bound to that parameter. |

A variable's value is a single byte (0-255), so the inserted text is always 1 to 3 digits, no
leading zeros and no fixed width.

## Inserting a variable as a character

| Code     | Inserts                                                                 |
| -------- | ------------------------------------------------------------------------ |
| `#0#`    | A project (global) variable's value, as one raw character rather than decimal digits - e.g. a variable holding `65` prints the single letter `A`. |
| `#L0#`   | The Local-variable equivalent.                                           |
| `#T0#`   | The Temp-variable equivalent.                                           |
| `#V0#`   | The Custom Event parameter equivalent.                                   |

Useful for picking a single character (a letter, digit, symbol or custom glyph) at runtime
rather than displaying a number - for example cycling a variable through a small set of icon
characters and showing whichever one it currently holds.

The variable's value is used directly as the character code, with no range check - the font
covers ASCII `0x20` (space) through `0xFF` (224 glyphs), so keep the variable's value inside
that range. A value below `0x20` doesn't print as blank or get skipped; it lands on one of the
box-frame or cursor tiles instead (they're stored right after the printable glyphs), which
looks like visual corruption rather than a missing character - this is a case to actively avoid
when choosing what a variable can hold, not something the engine protects against for you.

## Text commands

| Code              | Effect                                                                   |
| ----------------- | --------------------------------------------------------------------------- |
| `!S0!` ... `!S5!` | Changes the typewriter speed from this point in the text onward, without needing a separate **Text: Set Animation Speed** event. `0`-`2` reveal a character every frame (the fastest, and indistinguishable from each other); `3`, `4` and `5` progressively slow down to every 2nd, 4th and 8th frame. |

A speed code takes effect instantly and reveals no character of its own - it doesn't cost a
visible tick, it just changes the pace of every character that follows it (until another `!Sx!`
code, or the box closes). For example, `Slow down...!S5!now reading very slowly` types the
first part at the default speed and the rest at the slowest one.

This is the one inline text command this engine currently implements. Unlike setting speed
permanently via the **Text: Set Animation Speed** event (see [Scripting Events](scripting-events.html#text)),
an inline `!Sx!` code only affects the speed while that one Display Text event is revealing -
the box's open/close slide speed and any later Display Text event are unaffected.

## See also

- **Text: Set Animation Speed** sets the box's slide-in/slide-out speed and a default typewriter
  speed for every Display Text event that follows, until changed again - use this for a
  project-wide pace, and `!Sx!` for a one-off change mid-sentence.
- [Scripting Events](scripting-events.html) for the full event list.
