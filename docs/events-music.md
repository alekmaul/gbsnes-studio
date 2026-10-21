---
title: Music & Sound
parent: Event Reference
grand_parent: Scripting Events
nav_order: 7
---

# Music & Sound

**Music: Play** - plays one of the project's own `.mod` songs, converted to the engine's
soundbank format at build time.

**Music: Stop** - stops the currently playing music.

**Sound: Play Effect** - plays a short sound effect over the music. Built-in types are "Beep"
(a square-wave blip at a chosen pitch), "Tone" (a configurable-frequency tone) and "Crash" (a
noise burst); "Custom" plays one of the project's own sound effect assets (`assets/sounds/*.wav`)
at a chosen pitch instead.
