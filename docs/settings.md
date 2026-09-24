---
title: Settings
nav_order: 8
---

# Settings

Access the project's settings by clicking _Settings_ in the left navigation. Unlike GB
Studio (and the `main`/GBSNES Studio branch of this project), SNES Studio has no "Target
Platform" selector at all - every project targets the Super Nintendo.

## SNES Options

- **Region** - NTSC or PAL, sets the cartridge header's country code.
- **Save Data (SRAM)** - the battery-backed save memory available to `Save Data` /
  `Load Data` script events: None, or 8KB (Battery, default).
- **ROM Size** - the cartridge's total ROM size: 256KB/8 banks (default), 512KB/16 banks,
  1MB/32 banks, or 2MB/64 banks. Raise this if a build fails at link time with an
  "INSERT_SECTIONS: No room for section... in ROM bank" error - a project with many
  backgrounds, sprites or music tracks can overflow the 256KB default.

This card also lists a few fixed per-scene resource limits worth knowing up front:

- Up to 8 distinct sprite sheets per scene (the player plus up to 7 actor sheets) - a scene
  needing more falls the extras back to a shared slot.
- Up to 4 projectiles (`Launch Projectile` / `Weapon Attack`) in flight at once per scene.
- Up to 4 actors with a running `On Update` script at once per scene.

<!-- TODO: add screenshot here - docs/assets/images/screenshots/snes-options.png
<img src="/gbsnes-studio/assets/images/screenshots/snes-options.png" alt="SNES Options" width="600" />
-->

## Default Player Sprites

Each scene has a _Scene Type_ (Top Down, Platformer, Adventure, Shoot 'Em Up, or Point and
Click) - see [Scenes](scenes.html). This section lets you pick a default sprite sheet for
the player per scene type, so a new scene of that type starts with a sensible player sprite
already assigned instead of none.

<!-- TODO: add screenshot here - docs/assets/images/screenshots/default-player-sprites.png
<img src="/gbsnes-studio/assets/images/screenshots/default-player-sprites.png" alt="Default Player Sprites" width="600" />
-->

## Controls

Override the default controls used when playing your game from a web build and the Play
window. Click an input box, then press the key you want to assign it. In addition to the
D-Pad, A, B, Start and Select, SNES also has X, Y, L (left shoulder) and R (right shoulder)
buttons, each with their own binding.

<!-- TODO: add screenshot here - docs/assets/images/screenshots/controls.png
<img src="/gbsnes-studio/assets/images/screenshots/controls.png" alt="Controls" width="600" />
-->

## Custom HTML Header

Add content to the HTML `<head>` element used by web builds - useful for custom CSS or
JavaScript.
