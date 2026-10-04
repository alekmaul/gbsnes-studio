---
title: Music
parent: Assets
nav_order: 3
---

# Music

Add music to your game by including module files in your project's `assets/music` folder,
then trigger them with the `Music: Play` scripting event. Unlike Game Boy's 4-channel PSG,
the SNES plays real digital audio (BRR-compressed PCM samples) through PVSnesLib's `snesmod`
driver - so a track's actual sound comes from whatever samples it carries, the same as a
module on a PC tracker.

Two file types are supported:

## `.mod` files

A 4-channel `M.K.` ProTracker module - the simplest option, and what
[OpenMPT](https://openmpt.org/) or [MilkyTracker](https://milkytracker.org/) export by
default. Every `.mod` is automatically converted to Impulse Tracker format at build time (one
pass-through instrument per sample, uncompressed 8-bit samples, IT packed patterns), since
that's the only format `snesmod` actually accepts.

This conversion is lossy in a couple of minor ways: Amiga-style (non-linear) pitch slides
become IT's linear slides, and a few obscure ProTracker effects have no IT equivalent and are
dropped. For most music this isn't audible - if you need precise control over effects, export
`.it` directly instead (see below).

## `.it` files

An Impulse Tracker module, used as-is (byte-for-byte, no conversion) - this is the format
`snesmod` wants natively, so exporting directly to `.it` avoids the `.mod` conversion's minor
lossiness entirely. Any tracker that can export standard `.it` works
([OpenMPT](https://openmpt.org/), [Schism Tracker](https://schismtracker.org/), Impulse
Tracker itself, ...).

{: .important }
> `.it` support is real but **unforgiving** - `snesmod` only implements a subset of the IT
> format, and some common tracker defaults will fail your build or produce a silent track.
> Read the limitations below before exporting.

### IT limitations

These come directly from PVSnesLib's own
[snesmod composition rules](https://github.com/alekmaul/pvsneslib/blob/master/pvsneslib/pvsneslib_snesmod.txt) -
the real constraints the `smconv` tool enforces when building your ROM.

**Required, or the build stops with a clear error:**

- **The module must use instruments** ("new"/instrument mode - most trackers enable this by
  default, but very old or minimal exports can be in "old"/sample-direct mode). Exporting
  without instruments compiles, links, and plays back **completely silent**, with no warning
  from the tracker itself - GB2SNES Studio catches this before it ever reaches `snesmod` and
  fails the build with a message telling you to re-export with instruments enabled (in
  OpenMPT: *Song > Convert to Instruments*).
- **Samples must not use IT's own sample compression.** Most modern trackers compress samples
  by default on export. A compressed sample doesn't just fail to play - it crashes `smconv`
  outright (and takes your whole soundbank build down with it, not just that one track).
  GB2SNES Studio also catches this before the build, with a message telling you to re-export
  without sample compression.

**Hard format limits** (not checked ahead of time - a violation may produce a cryptic build
error or an audibly wrong track, so it's worth knowing these up front):

- **8 channels maximum.**
- **64 samples maximum**, and they must fit in **58 KB of SPC memory after BRR compression**
  (8-bit samples compress to 9/16 their original size, 16-bit to 9/32).
- **No stereo samples.**
- **Sample loop points should be a multiple of 16** - a loop length that isn't may get
  resampled/unrolled on conversion, using up more of that 58 KB budget than you'd expect.
- Only the **center entry** of each instrument's sample map is used - complex, per-note
  sample mapping isn't supported, and the actual note value played is ignored for mapping
  purposes.
- **Undefined instruments actively malfunction** rather than silencing the channel - don't
  reference an instrument slot your module doesn't define.
- Pitch envelopes, panning envelopes, random volume/panning variation, tremor, tremolo and
  panbrello are **not supported**. Volume envelopes are supported, but the sustain point must
  be a single node and envelope nodes must be no more than 256 ticks apart.
- Most `S` effect commands (S1x-S5x, S7x, S9x, SAy, SBx, Zxx) and the fine-volume effects
  (Ex/Fx/Gx/Hx in the volume column) are **not supported**.
- Filters and New Note Actions aren't supported, except **Note Cut**.

{: .note }
> **Channel 8 is reserved.** It's overwritten whenever a sound effect (`Sound: Play Beep` /
> `Start Tone` / `Play Crash`) plays, so don't put anything important there.

### Previewing `.it` in the editor

The editor's own music preview ("Play" button) decodes `.it` files itself, independently of
`snesmod` - so it plays back even before you've built a ROM, and it's more forgiving than
`snesmod` (a track missing instruments, for example, still previews - it just won't build).
One caveat: the preview's pitch calculation is tuned for GB2SNES Studio's own authored
content, so a `.it` composed entirely outside this app and its conventions may occasionally
preview at a slightly different pitch than it actually plays in-game. If something sounds off
in the preview but you're not sure, trust a real Build ROM + emulator test over the preview.
