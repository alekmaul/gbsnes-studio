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

Open your `.gbsproj` like any other project - the app runs its usual project migration on
load, the same way GB Studio itself upgrades an older project when you open it in a newer
version.

{: .important }
> This project's own scripting/event feature set tracks relevant changes from GB Studio
> 3.2.1 (scene types/genres, the Animations panel, and so on - see
> [Scripting Events](scripting-events.html)), so a project from a modern GB Studio version
> is a reasonable starting point. It is still a separate fork with its own project format,
> not a drop-in reader for every GB Studio release - some project features or file-format
> details may not carry over cleanly, so treat the result as a starting point to check over
> rather than a guaranteed exact match.

## What doesn't convert automatically

{: .warning }
> **Background size** - Game Boy renders at 160x144px, while SNES expects at least
> 256x224px. An undersized background still compiles (you'll just get a warning in the
> editor), but it will display smaller than the SNES screen. See
> [Backgrounds](backgrounds.html) for the real SNES size limits.

{: .warning }
> **Scripting event compatibility** - some Game Boy events have no SNES equivalent, or are
> inert on SNES. See the full, up-to-date list in the engine repository:
> `appData/src/snes/EVENTS.md`.

<!-- TODO: add a before/after screenshot pair showing a background resized for SNES here -->
