#ifndef MUSIC_H
#define MUSIC_H

/*
 * M8: MUSIC_PLAY / MUSIC_STOP play the project's `.mod` songs (converted to the
 * snesmod soundbank by src/lib/compiler/compileSnesMusic.js); the SOUND_*
 * events play short built-in BRR effects that layer over the music. See
 * appData/src/snes/README.md's M8 section and music.c.
 */
#include "gbs_types.h"

void MusicInit(void); /* boots the SPC700 driver - call once from main() */
void MusicPlay(u8 track);
void MusicStop(void);

/* which built-in effect SoundPlayEffect plays */
#define SFX_BEEP 0
#define SFX_CRASH 1

/* pitch: snesmod BRR pitch 1..6 (playback rate ~ pitch * 2000 Hz).
 * Plays on top of any running music. */
void SoundPlayEffect(u8 kind, u8 pitch);

#endif
