/*---------------------------------------------------------------------------------
    M8: music + sound effects via PVSnesLib's snesmod driver.

    The SPC700 sound-engine driver ships prebuilt inside pvsneslib's libc.obj
    (already linked by buildSnesRom.js for every SNES build - nothing extra to
    vendor) and is controlled entirely from the C side through spc* calls
    (pvsneslib/include/snes/sound.h).

    Phase 2 (project music): src/lib/compiler/compileSnesMusic.js converts each
    project `.mod` -> `.it` (mod2it.js) and runs `smconv -s` to build the
    soundbank from res/effectssfx.it (module 0, the sound effects) + the songs
    (modules 1..NUM_MUSIC_TRACKS). It writes res/soundbank.{bnk,h} and
    src/res/soundbank.asm (`.asm` under src/ so plain `make` finds it - see the
    M11 note in README.md). A project with no music keeps the committed
    proof-of-concept soundbank (effects + one demo song at module 1).

    Sound effects are still the 5 IT-instrument effects bundled in
    effectssfx.it; the GB SOUND_* opcodes map onto them approximately (see the
    SOUND_* handlers below and README.md).
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "res/soundbank.h"
#include "res/soundbank_banks.h"
#include "assets.h"
#include "music.h"

#define NUM_EFFECTS 5

/* Soundbank layout: module 0 = the effect bank (effectssfx.it), modules
 * 1..NUM_MUSIC_TRACKS = the project's songs, in project order. So a
 * MUSIC_PLAY of compiler track index N loads soundbank module (1 + N).
 * When a project has no music, NUM_MUSIC_TRACKS may still be >0 for the
 * committed proof-of-concept soundbank (its demo track sits at module 1). */
#define MUSIC_MOD_BASE 1
#ifndef NUM_MUSIC_TRACKS
#define NUM_MUSIC_TRACKS 0
#endif

/* Loading a music module drops any loaded effect instruments (and vice
 * versa) - snesmod only keeps one "session" (one music slot + its effects)
 * resident at a time, capped around 58 KB combined (see the PVSnesLib demo's
 * own comment). This flag avoids reloading the 5 effects on every single
 * SOUND_* call when nothing else has touched the driver since. */
static u8 sfx_loaded = 0;

static void load_sfx_session(void)
{
    u8 j;
    if (sfx_loaded)
    {
        return;
    }
    spcStop();
    spcLoad(MOD_EFFECTSSFX);
    for (j = 0; j < NUM_EFFECTS; j++)
    {
        spcLoadEffect(j);
    }
    sfx_loaded = 1;
}

void MusicInit(void)
{
    spcBoot();
    MUSIC_SET_BANKS();
    sfx_loaded = 0;
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
    sfx_loaded = 0;
}

void MusicStop(void)
{
    spcStop();
    sfx_loaded = 0;
}

void SoundPlayEffect(u8 sfxIndex, u16 pitch)
{
    load_sfx_session();
    spcEffect(pitch, sfxIndex, 15 * 16 + 8); /* full volume, centre pan */
}
