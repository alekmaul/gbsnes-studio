;************************************************
; Built-in BRR sound effects for the SOUND_* events.
; Generated waveforms - see appData/src/snes/tools/gen-sfx.js.
;
; Lives under src/ (not next to the .brr in res/) so a plain `make` eject
; finds it - same reason as src/res/soundbank.asm. The .incbin paths are
; resolved from the build tool's working directory (the project root).
;************************************************

.include "hdr.asm"

.section ".sfx_rodata" superfree

sfx_beep:
.incbin "res/sfx_beep.brr"

sfx_crash:
.incbin "res/sfx_crash.brr"

.ends
