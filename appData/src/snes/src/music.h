#ifndef MUSIC_H
#define MUSIC_H

/*
 * M8 phase 1: MUSIC_PLAY / MUSIC_STOP / SOUND_* wired to PVSnesLib's snesmod
 * driver (spcBoot/spcLoad/spcPlay/spcEffect, appData/src/snes/res/soundbank.*).
 * See appData/src/snes/README.md's M8 section for what's real vs. approximated
 * here - this is a proof-of-concept soundbank (one music track + 5 effect
 * instruments, from a PVSnesLib example), not yet driven by project assets.
 */
#include "gbs_types.h"

void MusicInit(void); /* boots the SPC700 driver - call once from main() */
void MusicPlay(u8 track);
void MusicStop(void);

/* pitch: 1/2/4/8 = spcEffect's 4/8/16/32 kHz playback rate steps */
void SoundPlayEffect(u8 sfxIndex, u16 pitch);

#endif
