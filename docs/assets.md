---
title: Assets
nav_order: 5
has_children: true
---

# Assets

Every project includes an `assets` folder, with subfolders for the different asset types
(`backgrounds`, `sprites`, `music`, `ui`, ...).

GBSNES Studio doesn't currently contain any ability to edit graphics or music directly -
instead you create assets in an external application, save them into the right `assets`
subfolder, and they'll appear ready to use in the Project Editor.

## Recommended tools

- **Sprites & UI elements** - [Aseprite](https://www.aseprite.org/) or Photoshop.
- **Backgrounds** - [Tiled Map Editor](https://www.mapeditor.org/) works well for staying
  aligned to the 8px tile grid.
- **Music** - [OpenMPT](https://openmpt.org/) or [MilkyTracker](https://milkytracker.org/),
  exporting a 4-channel `M.K.` ProTracker `.mod` file.

## Community Assets

The [GB Studio Community Assets](https://github.com/gb-studio-dev/gb-studio-community-assets)
repository has a lot of free, ready-to-use sprites and backgrounds. Since SNES artwork uses
a real extracted palette rather than GB Studio's fixed 4-shade requirement, these assets
generally still work as a starting point, but will need resizing (see
[Backgrounds](backgrounds.html) and [Sprites](sprites.html)) to fit the larger SNES screen.
