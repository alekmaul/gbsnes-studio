---
title: Migrating a GB project to SNES
nav_order: 10
---

# Migrating a Game Boy project to SNES

GBSNES Studio is now focused on the SNES target. If you have an older project that still
targets Game Boy, here's how to point it at SNES instead.

## Changing the target

Open the project's `.gbsproj` file (a JSON file) and add, or change, this inside the
`settings` object:

```json
"settings": {
  "target": "snes"
}
```

If this field is missing entirely, it's treated as `"gb"` (the historical default).

The SNES-specific settings (`snesRegion`, `snesSramSize`, `snesRomBanks`) are optional -
sensible defaults are applied if they're absent, and they'll show up under Settings once the
project is reopened with the SNES target.

## What doesn't convert automatically

Changing this one field lets you *attempt* an SNES build, but it doesn't guarantee an
identical visual or functional result without further work:

{: .warning }
> **Background size** - Game Boy renders at 160x144px, while SNES expects at least
> 256x224px. An undersized background still compiles (you'll just get a warning in the
> editor), but it will display smaller than the SNES screen.

{: .warning }
> **Scripting event compatibility** - some Game Boy events have no SNES equivalent, or are
> inert on SNES. See the full, up-to-date list in the engine repository:
> `appData/src/snes/EVENTS.md`.

<!-- TODO: flesh out with screenshots / concrete examples -->
