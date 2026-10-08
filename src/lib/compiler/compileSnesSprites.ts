import {
  SpriteSheet,
  SpriteAnimationState,
  SpriteSubState,
  SpriteFrame,
  MetaspriteTile,
} from "../../store/features/entities/entitiesTypes";

// Compiles the Path B metasprite hierarchy (SpriteSheet.animationStates ->
// AnimationState -> SubState -> Frame -> MetaspriteTile, see
// entitiesTypes.ts) into real PVSnesLib `t_metasprite` data, as 65816
// source text in this project's own established "graphic/structural assets
// are 65816 source, not C" style (compileSnesData.js's `asmAsset`/`asmDb`
// pattern - one `.section "rodata_<name>" superfree` per sheet, `.db`
// 32 bytes/line).
//
// Not wired into the build yet (buildProjectSnes/compileSnesData.js never
// calls this) - this is the compiler half of Path B, the data-layer half of
// which already landed in entitiesTypes.ts/entitiesState.ts. Actually
// invoking oamMetaDraw16 against this data at runtime (a new script event +
// scene_cmds.c opcode) is separate future work, same as that earlier
// landing's own "not attempted this pass" scope.
//
// Every byte-level decision below is checked against PVSnesLib's REAL
// source, not guessed or taken from the (incomplete/aspirational) header
// doc comments alone:
//   - buildTools/win32-x64/pvsneslib/pvsneslib/include/snes/sprite.h
//     (the `t_metasprite` struct, `OAM_ATTR` macro, size/flip/palette/
//     priority #defines - the vendored, trimmed copy this project actually
//     links against)
//   - the full PVSnesLib checkout's `pvsneslib/source/sprites.asm`
//     (`oamMetaDraw16`'s real implementation) - confirms `props` flows
//     straight into the real OAM attribute byte unmodified (so the
//     OAM_ATTR bit layout really is what gets drawn, not just documented
//     intent), and that `dtile` is a sequential "frame id" looked up
//     through `lkup16idT`/`lkup16idT0` against the draw call's own size
//     parameter - not a raw VRAM tile address.

// ---- real PVSnesLib t_metasprite format (sprite.h) -----------------------
//
//   typedef struct {
//       u16 dx, dy;   // delta X/Y relative to the metasprite origin (0,0)
//       u16 dtile;    // frame id - index into this metasprite's own tile set
//       u8 props;     // OAM attribute byte (palette/priority/flip)
//       u8 unused;    // pad, so the struct is 16-bit aligned
//   } t_metasprite;   // 8 bytes
//
//   #define metasprite_end -128   // dx sentinel marking "no more tiles"
//
// A frame compiles to N of these records (one per placed tile) followed by
// one terminator record (dx=0xFF80, the rest zero - exactly what C's
// `{metasprite_end}` struct-literal shorthand zero-fills the rest to).
export const METASPRITE_RECORD_BYTES = 8;
export const METASPRITE_END = -128;
export const METASPRITE_END_U16 = METASPRITE_END & 0xffff; // 0xFF80

// ---- the SNES OAM size bit is NOT per-tile data ---------------------------
//
// Item 3 of the brief asks to "configure the size bit statically for our
// 16x16 choice" - but there genuinely is no per-tile size byte to set in
// this data. Real hardware OAM has exactly one size bit per OBJECT (in the
// separate 32-byte "extra" OAM table, 2 bits/object: X-MSB + size), chosen
// between whatever pair OBSEL's bits 7-5 configure (e.g. OBJ_SIZE8_L16 =
// 8x8 small / 16x16 large). `oamMetaDraw16`'s own `sprsize` CALL parameter
// (not any field in `t_metasprite`) decides, uniformly for every tile in
// that one draw call, which half of that pair to use - confirmed directly
// in sprites.asm (`oamMetaDraw16`'s size branch ORs an adjustment into
// every tile's attribute as it's written, driven by the call's own
// stack-passed size arg, never by anything read from the metasprite table
// itself). Since this project is exclusively 16x16 sprites, the real
// static configuration is: OBSEL must be programmed with a pair whose
// "large" half is 16x16 (OBJ_SIZE8_L16, matching the fixed per-scene OBJ
// sheet this engine already uses - see scene.c's existing oamInitGfxSet
// call), and every future `oamMetaDraw16` call site in the engine must
// always pass `OBJ_LARGE` as `sprsize`. These two named constants exist so
// that future engine-side wiring references the real PVSnesLib identifiers
// instead of a magic 0/1 - they are not bytes emitted into any table.
export const SPRITE_OBSEL_SIZE_SETTING = "OBJ_SIZE8_L16";
export const SPRITE_OAM_DRAW_SIZE = "OBJ_LARGE";

// ---- OAM attribute ("props") byte -----------------------------------------
//
// Bit layout confirmed against sprite.h's `OAM_ATTR` macro -
//   ((vflip<<7) | (hflip<<6) | (priority<<4) | (paletteoffset<<1) | upperTileBit)
// - and cross-checked in sprites.asm: `oamMetaDraw16` copies the record's
// `props` byte straight into the real OAM attribute byte with no masking,
// so this layout really is what reaches hardware, not just documented
// intent:
//   bit 7    flipY (vertical mirror)
//   bit 6    flipX (horizontal mirror)
//   bits 5-4 priority, 0-3 (OBJ-vs-BG draw order; never author-reachable as
//            a raw int here - see priorityToOamBits below)
//   bits 3-1 paletteIndex, 0-7 (the real OBJ CGRAM palette register - the
//            exact "3 bits, 0 to 7" the brief asks for)
//   bit 0    unused here. This is the main OAM table's real tile-number
//            upper bit on actual hardware, but `oamMetaDraw16` derives that
//            bit itself (from the record's own 16-bit `dtile` run through
//            lkup16idT/lkup16idT0, per sprsize) rather than reading it from
//            `props` - so this compiler always leaves it 0.
//
// `MetaspriteTile.priority` is a plain boolean (entitiesTypes.ts), not a
// raw 0-3 int - this project's other OBJ-priority code (scene.c's actor
// renderer) already established that OAM priority 0 is a real pitfall (it
// draws BEHIND ordinary BG tiles, effectively invisible against most
// backgrounds - see Claude's own `snes-hdma-and-obj-priority-bugs.md`
// memory), so neither boolean state ever compiles to 0: false -> 2
// (matches the existing actor renderer's own normal priority), true -> 3
// (drawn above everything, for a tile that should visually pop in front).
const priorityToOamBits = (priority: boolean): number => (priority ? 3 : 2);

export interface OamPropsInput {
  flipX: boolean;
  flipY: boolean;
  priority: boolean;
  paletteIndex: number; // 0-7
}

export const encodeOamProps = ({
  flipX,
  flipY,
  priority,
  paletteIndex,
}: OamPropsInput): number => {
  const pal = Math.max(0, Math.min(7, paletteIndex | 0));
  const prio = priorityToOamBits(priority);
  return (
    (flipY ? 0x80 : 0) | (flipX ? 0x40 : 0) | ((prio & 0x3) << 4) | (pal << 1)
  );
};

// ---- frame timing ----------------------------------------------------------
//
// SpriteFrame.durationMs (entitiesTypes.ts) is an editor-friendly
// millisecond value; the engine only ever counts whole 60Hz NTSC ticks
// (this project's own established convention - e.g. script_cmds.c's
// `LAUNCH_PROJECTILE_TTL = 180` frames = 3 real seconds). No PAL (50Hz)
// adjustment is applied here - this table has no runtime reader yet (see
// the file header), so there is nothing live to get subtly wrong on a PAL
// console today; revisit if/when a real opcode consumes this.
export const TICKS_PER_SECOND = 60;

export const encodeFrameDurationTicks = (durationMs: number): number => {
  const ticks = Math.round((durationMs / 1000) * TICKS_PER_SECOND);
  return Math.max(1, Math.min(255, ticks));
};

// ---- asm text helpers -------------------------------------------------------

// Matches compileSnesData.js's own (local, unexported) `asmDb` byte-dump
// convention exactly - 32 bytes/line, each masked to a real byte - so a
// human reading both files side by side sees the same shape.
export const asmDb = (bytes: number[]): string => {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 32) {
    lines.push(`.db ${bytes.slice(i, i + 32).map((b) => b & 0xff).join(",")}`);
  }
  return lines.join("\n");
};

// A `.dw` line of label references (WLA-DX resolves a bare symbol in a
// `.dw` to its own 16-bit address) or literal numbers - used only for the
// two pointer-table levels below (frame lists, substate directory); every
// per-tile OAM field is a plain already-known number, so those go through
// `u16b`/`asmDb` like the rest of this project's byte-level output, not
// through this helper.
const asmDw = (operands: Array<number | string>): string =>
  `.dw ${operands
    .map((v) => (typeof v === "number" ? (v & 0xffff).toString() : v))
    .join(",")}`;

const u16b = (n: number): [number, number] => [n & 0xff, (n >> 8) & 0xff];

// WLA-DX label characters: letters, digits, underscore; must not start
// with a digit. Project ids/keys (uuids, "idle_down", ...) need this before
// they can appear as asm symbols.
export const asmLabel = (raw: string): string => {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
};

// ---- per-frame OAM table ----------------------------------------------------

// `tile.x`/`tile.y` are already frame-origin-relative (entitiesTypes.ts's
// own comment on MetaspriteTile - and SpriteEditorCanvas.tsx stores/draws
// them that way, against `spriteSheet.origin` as the screen-space anchor),
// which is exactly what `dx`/`dy` mean in the real struct ("relative to the
// metasprite origin (0,0)") - so no further offsetting happens here.
// `tile.tileIndex` is likewise already the flat strip index
// SpriteEditorCanvas.tsx's tile bank uses, which is exactly PVSnesLib's own
// "frame id" convention for `dtile` (confirmed in sprites.asm - looked up
// through lkup16idT/lkup16idT0, never used as a raw address) - the two
// conventions turned out to already match with no translation needed.
export const buildFrameRecordBytes = (frame: SpriteFrame): number[] => {
  const bytes: number[] = [];
  frame.tiles.forEach((tile: MetaspriteTile) => {
    const [dxLo, dxHi] = u16b(tile.x);
    const [dyLo, dyHi] = u16b(tile.y);
    const [tileLo, tileHi] = u16b(tile.tileIndex);
    const props = encodeOamProps(tile);
    bytes.push(dxLo, dxHi, dyLo, dyHi, tileLo, tileHi, props, 0);
  });
  // Terminator record - dx = metasprite_end, everything else 0.
  const [endLo, endHi] = u16b(METASPRITE_END_U16);
  bytes.push(endLo, endHi, 0, 0, 0, 0, 0, 0);
  return bytes;
};

export interface CompiledSpriteSheetAsm {
  /** Suggested output filename, matching this project's `<name>_data.as` convention. */
  filename: string;
  /** Full 65816 source for this sheet's metasprite tables. */
  source: string;
  /** Label of the per-sheet substate directory - the one entry point a
   *  future runtime/opcode would actually need to know. */
  substateDirectoryLabel: string;
}

// Compiles one SpriteSheet's whole `animationStates` tree into one 65816
// source file. `symbol` is a caller-supplied, already-asm-safe sheet name
// (e.g. "hero", "npc001") - deliberately not derived from `sheet.id`/
// `sheet.filename` here, since this module has no opinion on project-wide
// naming; a future integration into compileSnesData.js would pass whatever
// scheme that file already uses for other per-sheet assets (bg<i>, etc).
export const compileSpriteSheetMetasprites = (
  sheet: SpriteSheet,
  symbol: string
): CompiledSpriteSheetAsm => {
  const sheetSym = asmLabel(symbol);
  const states: SpriteAnimationState[] = sheet.animationStates || [];

  const lines: string[] = [];
  // label -> {ptrLabel, loop} entries for the final substate directory,
  // flattened across every state in definition order (states are purely an
  // editor/UI grouping concept here - see entitiesTypes.ts's own comment on
  // SpriteAnimationState - there is no engine reason to keep that grouping
  // in the compiled table; a substate's index in this flattened list is its
  // real, stable runtime identity).
  const substateEntries: Array<{ framesLabel: string; loop: boolean }> = [];

  states.forEach((state: SpriteAnimationState, stateIdx: number) => {
    const stateSym = asmLabel(state.id) || `state${stateIdx}`;

    state.subStates.forEach((subState: SpriteSubState, subIdx: number) => {
      const subSym = asmLabel(subState.key) || `sub${subIdx}`;
      const baseLabel = `${sheetSym}_${stateSym}_${subSym}`;

      // One OAM table per frame.
      const frameLabels: string[] = [];
      subState.frames.forEach((frame: SpriteFrame, frameIdx: number) => {
        const frameLabel = `${baseLabel}_f${frameIdx}_oam`;
        frameLabels.push(frameLabel);
        lines.push(`${frameLabel}:`);
        lines.push(asmDb(buildFrameRecordBytes(frame)));
      });

      // Per-substate frame list: {ptr:dw, durationTicks:db} per frame,
      // self-terminated by a 0 pointer (3 zero bytes) - no separate frame-
      // count field needed, matching this project's existing "walk until a
      // sentinel" idiom (t_metasprite's own terminator record, one level
      // up, is the same pattern).
      const framesLabel = `${baseLabel}_frames`;
      lines.push(`${framesLabel}:`);
      subState.frames.forEach((frame: SpriteFrame, frameIdx: number) => {
        lines.push(asmDw([frameLabels[frameIdx]]));
        lines.push(`.db ${encodeFrameDurationTicks(frame.durationMs)}`);
      });
      lines.push(asmDw([0]));
      lines.push(`.db 0`);

      substateEntries.push({ framesLabel, loop: subState.loop });
    });
  });

  // Sheet-level substate directory - one {ptr:dw, loop:db} row per
  // flattened substate (definition order = runtime index), terminated the
  // same way.
  const substateDirectoryLabel = `${sheetSym}_substates`;
  lines.push(`${substateDirectoryLabel}:`);
  substateEntries.forEach(({ framesLabel, loop }) => {
    lines.push(asmDw([framesLabel]));
    lines.push(`.db ${loop ? 1 : 0}`);
  });
  lines.push(asmDw([0]));

  const asmHeader = ";* Generated by src/lib/compiler/compileSnesSprites.ts. Do not edit.";
  const body = lines.join("\n");
  const source = `${asmHeader}\n.section "rodata_${sheetSym}_meta" superfree\n${body}\n.ends\n`;

  return {
    filename: `${sheetSym}_meta_data.as`,
    source,
    substateDirectoryLabel,
  };
};

// Thin multi-sheet wrapper - a project compiles every sprite sheet that
// actually has Path B animation data (an untouched sheet has no
// `animationStates` at all, see entitiesTypes.ts, and is simply skipped).
export const compileSnesSprites = (
  sheets: Array<{ sheet: SpriteSheet; symbol: string }>
): CompiledSpriteSheetAsm[] =>
  sheets
    .filter(({ sheet }) => sheet.animationStates && sheet.animationStates.length > 0)
    .map(({ sheet, symbol }) => compileSpriteSheetMetasprites(sheet, symbol));
