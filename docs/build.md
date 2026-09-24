---
title: Building Your Game
nav_order: 7
---

# Building Your Game

## Play

Clicking the Play button (&#9654;) in the top right of the app window will build your game
and, once complete, open a new window where you can play it using the bundled emulator.

## Build & Run

The _Build & Run_ page (left navigation) gives you full control over building your game:

- **Run** builds your game and opens it in the Play window, the same as the Play button.
- **Export ROM** builds your game and creates a ROM file in your project's build folder, at
  `$PROJECT_ROOT/build/rom/game.sfc`. You can play this ROM file in any compatible SNES
  emulator, such as [Mesen2](https://www.mesen.ca/), [Snes9x](https://www.snes9x.com/), or
  [bsnes](https://github.com/bsnes-emu/bsnes).
- **Export Web** builds your game and creates an HTML5 web build in the folder
  `$PROJECT_ROOT/build/web`. You can upload this folder to any web server and open the
  `index.html` file to play your game in a browser. On mobile or tablet browsers the game
  also includes on-screen touch controls.
- **Clear** clears the build log.

<img src="/gbsnes-studio/assets/images/screenshots/build-and-run.png" alt="Build & Run page" width="900" />

If you zip the `build/web` folder you can upload it to [itch.io](https://itch.io) as an HTML
game. The recommended viewport size to use is `512px` x `480px`.

## Troubleshooting

On macOS, if you're having trouble building or running your game you may need to install
Apple's Command Line Tools by opening `Applications/Terminal.app` and entering:

```
xcode-select --install
```

{: .warning }
> On Windows, a build can occasionally fail with an `EPERM: operation not permitted` error on
> a file under your Temp folder. This is a known class of Windows file-locking issue (GB
> Studio itself has hit it for years) - if it keeps happening, try adding a Windows
> Defender/antivirus exclusion for your Temp folder or this app's install folder, then build
> again.
