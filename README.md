# SNES Studio

**SNES Studio** is a free and easy to use retro adventure game creator for the
Super Nintendo, for Mac, Linux and Windows — built on [GB Studio](https://www.gbstudio.dev/)'s
editor with a [PVSnesLib](https://github.com/alekmaul/pvsneslib) game engine.

Based on GB Studio, Copyright (c) 2020 Chris Maltby ([@maltby](https://www.twitter.com/maltby)),
released under the [MIT license](https://opensource.org/licenses/MIT).

----

![SNES Studio](gbstudio.gif)

SNES Studio consists of an [Electron](https://electronjs.org/) game-builder
application and a C game engine built with
[PVSnesLib](https://github.com/alekmaul/pvsneslib), music and sound via snesmod.

## Running from source

You need [Git](https://git-scm.com/) and Node.js 16 on your `PATH`. Then:

```bash
$ yarn
$ npm start
```

Package a distributable with `yarn make:win`, `yarn make:mac` or `yarn make:linux`.

## Documentation

- `appData/src/snes/README.md` — the SNES engine (architecture, milestones)
- `appData/src/snes/EVENTS.md` — per-event scripting support + known gaps
- `appData/src/snes/PERF.md` — SNES performance profile
- `CLAUDE.md` — repository guide (build pipeline, conventions)
- `CHANGELOG.md` — release notes
