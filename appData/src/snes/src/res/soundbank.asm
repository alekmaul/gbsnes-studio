;************************************************
; snesmod soundbank data                        *
; total size:      28276 bytes                  *
;************************************************

.include "hdr.asm"

.BANK 5
.SECTION "SOUNDBANK" ; need dedicated bank(s)

SOUNDBANK__:
.incbin "res/soundbank.bnk"
.ENDS
