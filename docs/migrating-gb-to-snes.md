---
title: Migrating a GB project to SNES
nav_order: 9
---

# Migrating a Game Boy project to SNES

GBSNES Studio is now focused on the SNES target. This covers both cases: an existing
GBSNES Studio project that still targets Game Boy, and a project brought in from
[GB Studio](https://www.gbstudio.dev/) itself.

## Coming from GB Studio

If your `.gbsproj` was made with GB Studio (not GBSNES Studio), open it like any other
project - the app runs its usual project migration on load, the same way GB Studio itself
upgrades an older project when you open it in a newer version.

{: .important }
> GBSNES Studio is based on **GB Studio 1.2.2**. A `.gbsproj` created or last opened with a
> much newer GB Studio version (3.x/4.x) may use project features or a file format that
> didn't exist yet in 1.2.2, and might not open cleanly, or at all. Projects from GB Studio
> 1.2.2 (or close to it) are the safest bet.

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

<img src="/gbsnes-studio/assets/images/screenshots/target-platform-setting.png" alt="Target Platform setting" width="600" />
