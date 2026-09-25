---
title: Migrating from GB Studio
nav_order: 9
---

# Migrating from GB Studio

SNES Studio (`v4`) always targets the Super Nintendo - there's no "target" setting to
change (see [Settings](settings.html)). Bringing a project over from
[GB Studio](https://www.gbstudio.dev/) itself is a matter of opening the `.gbsproj` and then
resizing/reworking assets for the bigger SNES screen, not flipping a flag.

{: .note }
> If you have an older project from this project's `main` branch (GBSNES Studio, which
> still keeps a `"target": "gb"` / `"target": "snes"` setting), it opens the same way - the
> `target` field itself is simply ignored, since SNES Studio only ever compiles to SNES.

## Opening the project

Open your `.gbsproj` like any other project - the app runs its own project migration on load,
the same way GB Studio itself upgrades an older project when you open it in a newer version.

{: .important }
> **This is this fork's own migration chain, not GB Studio's.** It upgrades a project through
> this fork's own internal version numbers (`_version`/`_release`, topping out at `2.0.0`
> release 7 - `LATEST_PROJECT_VERSION` in `migrateProject.js`), matched by **exact string
> equality**. A project whose `_version` doesn't match one of those exact strings - which
> includes a real, modern GB Studio project, since GB Studio's own version numbering has moved
> on independently - skips every migration step entirely and loads as-is. In practice this
> means: a project that already started life in this fork (or an old, genuinely
> `_version: "1.0.0"`-era GB Studio project) migrates cleanly; a `.gbsproj` freshly exported
> from a current GB Studio install is more likely to open with its schema unmigrated, and
> should be checked over carefully (scenes, actors, scripts) rather than trusted at face value.
> This project's own scripting/event feature set does track relevant changes from GB Studio
> 3.2.1 (scene types/genres, the Animations panel, and so on - see
> [Scripting Events](scripting-events.html)), so the two schemas are closer than they'd
> otherwise be - but that's a feature-set similarity, not a guarantee this migration chain
> actually runs against a real modern file.

## What doesn't convert automatically

{: .warning }
> **Background size** - Game Boy renders at 160x144px, while SNES expects at least
> 256x224px. An undersized background still compiles (you'll just get a warning in the
> editor), but it will display smaller than the SNES screen. See
> [Backgrounds](backgrounds.html) for the real SNES size limits.

{: .warning }
> **Scripting event compatibility** - some Game Boy events have no SNES equivalent, or are
> inert on SNES. See the full, up-to-date list of [Scripting Events](scripting-events.html).

<img src="/gbsnes-studio/assets/images/screenshots/background-size-comparison.png" alt="Game Boy (160x144) vs SNES (256x224) title screen size comparison" width="600" />
