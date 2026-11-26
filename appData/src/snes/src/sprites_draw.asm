;---------------------------------------------------------------------------------
; The inner loop of SpriteDrawFrame (sprites.c): writes the sprites of one
; animation frame into PVSnesLib's OAM shadow buffer.
;
; In assembly because under 816-tcc the same loop in C was too slow for a scene
; with 14 actors on screen (see PERF.md).
;---------------------------------------------------------------------------------
.include "hdr.asm"

.SECTION ".sprites_draw_text" SUPERFREE

;---------------------------------------------------------------------------------
; u16 SpriteDrawList(const u8 *sprites, u16 count, s16 x, s16 y, u16 oam);
;         stack:           10-13       14-15   16-17  18-19    20-21
;
; sprites  count entries of 5 bytes: s8 dx, s8 dy, u8 tile, u8 attr, u8 large
;          (large = 1: 16x16, 0: 8x8), see compileSnesSprites.js
; x, y     screen position of the frame's actor
; oam      byte offset of the first free OAM entry (sprite number * 4)
;
; Sprites entirely off screen are left out, so the entries written follow each
; other. Returns the offset of the next free entry.
;---------------------------------------------------------------------------------
; tcc__r0/r0h  pointer to the list        tcc__r3   screen x
; tcc__r1      sprites left               tcc__r4   screen y
; tcc__r1h     OAM offset (saved)         tcc__r5   tile | attr << 8
; tcc__r2      temporary, then high table bits       tcc__r2h  high table mask
;---------------------------------------------------------------------------------
SpriteDrawList:
    php
    phb
    phx
    phy

    sep #$20
    lda #$7e
    pha
    plb                         ; oamMemory is in bank $7e
    rep #$30

    lda 10,s
    sta.b tcc__r0
    lda 12,s
    sta.b tcc__r0h              ; the bank is the low byte
    lda 20,s
    tax                         ; x = OAM offset
    ldy.w #0                    ; y = offset in the list
    lda 14,s
    sta.b tcc__r1
    bne _sdlNext
    jmp _sdlEnd

_sdlNext:
    cpx.w #512                  ; no OAM entry left
    bcc +
    jmp _sdlEnd
+
    lda.b [tcc__r0],y           ; dx | dy << 8
    sta.b tcc__r2
    and.w #$00ff
    cmp.w #$0080
    bcc +
    ora.w #$ff00                ; sign extend dx
+   clc
    adc 16,s
    sta.b tcc__r3

    lda.b tcc__r2
    xba
    and.w #$00ff
    cmp.w #$0080
    bcc +
    ora.w #$ff00                ; sign extend dy
+   clc
    adc 18,s
    sta.b tcc__r4

    iny
    iny
    lda.b [tcc__r0],y
    sta.b tcc__r5
    iny
    iny
    lda.b [tcc__r0],y           ; large (the high byte belongs to what follows)
    iny                         ; y = next sprite
    and.w #$00ff
    bne _sdlLarge

    ; 8x8: visible when -7 <= x < 256 and -7 <= y < 224, each tested with one
    ; unsigned comparison once shifted by 7
    lda.b tcc__r3
    clc
    adc.w #7
    cmp.w #256+7
    bcs _sdlSkip
    lda.b tcc__r4
    clc
    adc.w #7
    cmp.w #224+7
    bcs _sdlSkip
    lda.w #0                    ; high table value: small
    bra _sdlWrite

_sdlSkip:
    jmp _sdlCount

_sdlLarge:
    lda.b tcc__r3
    clc
    adc.w #15
    cmp.w #256+15
    bcs _sdlSkip
    lda.b tcc__r4
    clc
    adc.w #15
    cmp.w #224+15
    bcs _sdlSkip
    lda.w #2                    ; high table value: large

_sdlWrite:
    bit.b tcc__r3               ; a visible x is negative or below 256:
    bpl +
    ora.w #1                    ; bit 8 of x is its sign
+   sta.b tcc__r2

    lda.b tcc__r4
    xba
    and.w #$ff00                ; y in the high byte
    sta.b tcc__r2h
    lda.b tcc__r3
    and.w #$00ff
    ora.b tcc__r2h
    sta.w oamMemory,x           ; x, y
    lda.b tcc__r5
    sta.w oamMemory+2,x         ; tile, attr

    ; high table: 2 bits per sprite in byte 512 + offset / 16
    stx.b tcc__r1h
    txa
    and.w #$000c                ; (sprite & 3) * 4
    ora.b tcc__r2               ; + value
    tax
    sep #$20
    lda.l _sdlBits,x
    sta.b tcc__r2
    lda.l _sdlClear,x
    sta.b tcc__r2h
    rep #$20
    lda.b tcc__r1h
    lsr a
    lsr a
    lsr a
    lsr a
    tax
    sep #$20
    lda.w oamMemory+512,x
    and.b tcc__r2h
    ora.b tcc__r2
    sta.w oamMemory+512,x
    rep #$20
    lda.b tcc__r1h
    clc
    adc.w #4
    tax

_sdlCount:
    dec.b tcc__r1
    beq _sdlEnd
    jmp _sdlNext

_sdlEnd:
    stx.b tcc__r0               ; return value

    ply
    plx
    plb
    plp
    rtl

; Indexed by (sprite & 3) * 4 + value, value = x bit 8 | large << 1
_sdlBits:
    .db $00, $01, $02, $03
    .db $00, $04, $08, $0c
    .db $00, $10, $20, $30
    .db $00, $40, $80, $c0
_sdlClear:
    .db $fc, $fc, $fc, $fc
    .db $f3, $f3, $f3, $f3
    .db $cf, $cf, $cf, $cf
    .db $3f, $3f, $3f, $3f

.ENDS
