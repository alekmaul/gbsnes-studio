;---------------------------------------------------------------------------------
; One DMA for a column of a background tilemap, used by the streaming of a wide
; parallax background (scene.c). A call to dmaCopyVram() per row is far too slow:
; a column of 28 rows didn't fit in the vertical blank, and VRAM ignores what is
; written once the picture has started.
;---------------------------------------------------------------------------------
.include "hdr.asm"

.SECTION ".vram_column_text" SUPERFREE

;---------------------------------------------------------------------------------
; void DmaColumnVram(const u16 *data, u16 vram, u16 bytes);
;         stack:                5-8      9-10      11-12
;
; Copies `bytes` bytes of tilemap words to the VRAM word address `vram`, moving
; 32 words (one row of a 32x32 screen) after each word. Uses DMA channel 0, like
; dmaCopyVram(). To be called during the vertical blank.
;---------------------------------------------------------------------------------
DmaColumnVram:
    php
    rep #$30

    lda 9,s
    sta.l $2116                 ; VRAM address
    lda 11,s
    sta.l $4305                 ; length
    lda 5,s
    sta.l $4302                 ; source address

    sep #$20
    lda 7,s
    sta.l $4304                 ; source bank
    lda #$01
    sta.l $4300                 ; alternate two registers...
    lda #$18
    sta.l $4301                 ; ... $2118 and $2119
    lda #$81
    sta.l $2115                 ; move 32 words after the high byte
    lda #$01
    sta.l $420b                 ; start channel 0
    lda #$80
    sta.l $2115                 ; back to one word at a time

    plp
    rtl

.ENDS
