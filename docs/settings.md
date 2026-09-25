---
title: Settings
nav_order: 8
---

# Settings

Access the project's settings by clicking _Settings_ in the left navigation.

## Target Platform

Selects which engine and build tools are used to build your game. GBSNES Studio is
SNES-only for now - see [Migrating a GB project to SNES](migrating-gb-to-snes.html) if you
have an older project that still targets Game Boy.

## SNES Options

Shown once the target platform is SNES (the default):

- **Region** - NTSC or PAL, sets the cartridge header's country code.
- **SRAM Size** - the battery-backed save memory size available to `Save Data` /
  `Load Data` script events: None, 2 KB, 8 KB (default), or 32 KB.

<img src="/gbsnes-studio/assets/images/screenshots/snes-options.png" alt="SNES Options" width="600" />

## Controls

Override the default controls used when playing your game from a web build and the Play
window. Click an input box, then press the key you want to assign it. In addition to the
D-Pad, A, B, Start and Select, SNES also has X, Y, L (left shoulder) and R (right shoulder)
buttons, each with their own binding.

<img src="/gbsnes-studio/assets/images/screenshots/controls.png" alt="Controls" width="600" />

## Custom HTML Header

Add content to the HTML `<head>` element used by web builds - useful for custom CSS or
JavaScript.

