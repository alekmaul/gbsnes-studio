/*---------------------------------------------------------------------------------
    M8: music + sound effects via PVSnesLib's snesmod driver.

    The SPC700 sound-engine driver ships prebuilt inside pvsneslib's libc.obj
    (already linked by buildSnesRom.js for every SNES build - nothing extra to
    vendor) and is controlled entirely from the C side through spc* calls
    (pvsneslib/include/snes/sound.h).

    Music (M8 phase 2): src/lib/compiler/compileSnesMusic.js converts each
    project `.mod` -> `.it` (mod2it.js) and runs `smconv -s` to build the
    soundbank from res/effectssfx.it (module 0) + the songs (modules
    1..NUM_MUSIC_TRACKS). MUSIC_PLAY of compiler track N -> spcLoad(1 + N).

    Sound effects (SOUND_PLAY_BEEP / _TONE / _CRASH) play short BRR samples
    through snesmod's dedicated BRR sound region (spcAllocateSoundRegion +
    spcPlaySound), which layers them ON TOP of the music instead of stopping
    it. The samples are two tiny generated waveforms baked into ROM
    (res/sfx_*.brr, see appData/src/snes/tools/gen-sfx.js). GB Studio 1.2.2 has
    no per-project sound-effect assets, so these are engine built-ins.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "res/soundbank.h"
#include "res/soundbank_banks.h"
#include "res/sfx.h"
#include "assets.h"
#include "music.h"

/* Soundbank layout: module 0 = res/effectssfx.it (kept so smconv always has a
 * module and the bank layout is stable - not loaded at runtime anymore),
 * modules 1..NUM_MUSIC_TRACKS = the project's songs in project order. */
#define MUSIC_MOD_BASE 1
#ifndef NUM_MUSIC_TRACKS
#define NUM_MUSIC_TRACKS 0
#endif

/* ARAM reserved for the BRR sound-effect stream (size * 256 bytes). Must hold
 * the largest built-in effect; both are well under 1 KB. Allocated once at
 * boot - spcAllocateSoundRegion stops module playback, so it has to run before
 * any spcLoad/spcPlay. */
#define SFX_REGION_BLOCKS 8

extern char sfx_beep;  /* res/sfx.asm */
extern char sfx_crash;

/* one reusable sound-table entry; SoundPlayEffect re-points it per call */
static brrsamples sfx_entry;

/* v4 follow-up: real per-project sound effects (Sound: Play Effect's
 * "custom" type) - compileSnesSfx.js encodes each project assets/sounds/
 * *.wav to BRR and generates res/sfx_custom.h (extern char sfx_custom_N +
 * byte lengths + a SFX_CUSTOM_TABLE initializer), only when the project has
 * at least one (NUM_SOUND_EFFECTS, from assets.h, is 0 otherwise - the
 * overwhelmingly common case - so this header never needs to exist on disk
 * then). Indexing is positional: sfxIndex N is always projectData.
 * soundEffects[N], same as the generated table itself - an asset that
 * failed to encode still gets a real slot with len 0 rather than shifting
 * every later index. */
typedef struct
{
    u8 *addr;
    u16 len;
} SfxEntry;

#if NUM_SOUND_EFFECTS > 0
#include "res/sfx_custom.h"
static const SfxEntry sfx_table[NUM_SOUND_EFFECTS] = SFX_CUSTOM_TABLE;
#endif

void MusicInit(void)
{
    spcBoot();
    MUSIC_SET_BANKS();
    spcAllocateSoundRegion(SFX_REGION_BLOCKS);
}

void MusicPlay(u8 track)
{
    if (track >= NUM_MUSIC_TRACKS)
    {
        return; /* no such song in the soundbank */
    }
    spcStop();
    spcLoad(MUSIC_MOD_BASE + track);
    spcPlay(0);
}

void MusicStop(void)
{
    spcStop();
}

/* kind: SFX_BEEP (0) or SFX_CRASH (1). pitch: snesmod BRR pitch 1..6
 * (playback rate ~ pitch * 2000 Hz). Plays over any running music. */
void SoundPlayEffect(u8 kind, u8 pitch)
{
    u8 p = pitch;
    if (p < 1)
    {
        p = 1;
    }
    if (p > 6)
    {
        p = 6;
    }

    if (kind == SFX_CRASH)
    {
        spcSetSoundEntry(15, 8, p, SFX_CRASH_LEN, (u8 *)&sfx_crash, &sfx_entry);
    }
    else
    {
        spcSetSoundEntry(15, 8, p, SFX_BEEP_LEN, (u8 *)&sfx_beep, &sfx_entry);
    }
    spcPlaySound(0);
}

/* SOUND_PLAY_CUSTOM. sfxIndex: a project sound-effect index (see the
 * SfxEntry comment above). pitch: snesmod BRR pitch 1..6, same scale as
 * SoundPlayEffect. Out-of-range sfxIndex or a slot that failed to encode
 * (len 0) silently does nothing - matches SoundPlayEffect's own "never
 * crash on bad input" character, and mirrors MusicPlay's own
 * `track >= NUM_MUSIC_TRACKS` bounds check. */
void SoundPlayCustomEffect(u8 sfxIndex, u8 pitch)
{
#if NUM_SOUND_EFFECTS > 0
    u8 p = pitch;
    if (sfxIndex >= NUM_SOUND_EFFECTS)
    {
        return;
    }
    if (sfx_table[sfxIndex].len == 0)
    {
        return;
    }
    if (p < 1)
    {
        p = 1;
    }
    if (p > 6)
    {
        p = 6;
    }
    spcSetSoundEntry(15, 8, p, sfx_table[sfxIndex].len, sfx_table[sfxIndex].addr, &sfx_entry);
    spcPlaySound(0);
#endif
}
