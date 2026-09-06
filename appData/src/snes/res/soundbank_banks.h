// extern decls for the soundbank chunks laid into ROM, plus the spcSetBank()
// sequence that registers them with snesmod.
//
// This committed copy matches the committed proof-of-concept soundbank.bnk
// (effects + one demo song, < 32 KB -> a single bank). When a project has its
// own music, compileSnesMusic.js overwrites this file: a soundbank larger than
// one 32 KB LoROM bank is split by smconv into SOUNDBANK__0 / SOUNDBANK__1 /...
// on consecutive banks, and MUSIC_SET_BANKS() then spcSetBank()s each chunk in
// reverse order (chunk 0 first - see PVSnesLib's musicGreaterThan32k example).

#ifndef __SOUNDBANK_BANKS__
#define __SOUNDBANK_BANKS__

extern char SOUNDBANK__;
#define MUSIC_SET_BANKS() spcSetBank(&SOUNDBANK__)

#endif // __SOUNDBANK_BANKS__
