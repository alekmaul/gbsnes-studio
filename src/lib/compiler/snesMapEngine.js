/*
 * snesMapEngine.js - M1 of the Map Engine milestone (see the published
 * roadmap artifact): reshapes a background already converted by
 * snesgfx.js's imageToBGData() into the three buffers PVSnesLib's
 * mapLoad(layer1map, layertiles, tilesprop) wants.
 *
 * The M0 feasibility pass assumed a "metatile" meant a 2x2 group of real
 * tiles - reading pvsneslib/source/maps.asm directly (mapLoad, mapRefreshAll,
 * mapGetMetaTile*) shows that's wrong: PVSnesLib's Map Engine indexes tiles
 * 1:1, one map cell per real 8x8 tile. A "metatile" here is a *dedup slot* -
 * the map's tilemap stores a 10-bit index into a shared tile-definition
 * table (tile + palette + priority), with per-cell H/V flip carried in the
 * map word itself (bits 14/15) rather than the definition. That is
 * structurally almost identical to what imageToBGData() already produces
 * (a deduplicated tile list + a tilemap referencing tile index and flip),
 * so this pass is a reshape, not a new packing algorithm.
 *
 * Exact runtime addressing this mirrors (mapRefreshAll's per-cell decode):
 *   pha                  ; save the raw map word
 *   and #$03FF           ; low 10 bits = index into the def table
 *   asl a / tax
 *   lda metatiles.topleft,x   ; def table entry = real tile+pal+prio word
 *   sta maptmpvalue
 *   pla
 *   and #$C000           ; bits 14/15 of the raw map word = H/V flip
 *   ora maptmpvalue       ; final VRAM tilemap word
 *
 * mapLoad() DMAs a FIXED-size def/prop table every time (MAP_MAXMTILES*4
 * words / MAP_MAXMTILES*2 words respectively) regardless of how many
 * entries are actually used, so both tables below are always emitted at
 * their full size, zero-padded past the real tile count.
 *
 * Collision is intentionally out of scope here: `tilesprop` is emitted as
 * all T_EMPTY. Tying collision to the tile *graphic* (Map Engine's model)
 * vs. this project's existing per-scene, graphic-independent collision
 * bitmap is a milestone of its own (M3 in the roadmap) - not resolved by
 * this pass.
 */

const MAP_MTSIZE = 8; // maps.asm MAP_MTSIZE - one raw 8x8 tile, not 16x16
const MAP_MAXMTILES = 512; // maps.asm MAP_MAXMTILES
const METATILE_DEF_WORDS = MAP_MAXMTILES * 4; // metatiles.topleft table size (mapLoad DMA size)
const METATILE_DEF_INDEX_MASK = 0x3ff; // 10-bit index field in a map word - the real ceiling, not METATILE_DEF_WORDS
const METATILE_PROP_WORDS = MAP_MAXMTILES * 2; // metatilesprop table size
const MAP_CELL_FLIP_MASK = 0xc000; // bits 14/15
const MAP_CELL_ATTR_MASK = 0x3c00; // bits 10-13 (palette + priority), dropped from the map word - the def table carries these instead

const wordsToBytesLE = words => {
  const out = [];
  for (const w of words) out.push(w & 0xff, (w >> 8) & 0xff);
  return out;
};

/*
 * bgData: imageToBGData() output ({ tiles, tilemap, tileW, tileH }).
 * options.paletteSlot / options.priority: must match what was passed to
 * imageToBGData() for this same background - they're baked into the
 * definition table entries here instead of the tilemap.
 *
 * Returns { layer1map, metatiles, tilesprop, mapWidthPx, mapHeightPx }, all
 * three already byte arrays ready to emit as .as data.
 */
const buildMapEngineBackground = (bgData, options = {}) => {
  const { paletteSlot = 0, priority = false } = options;
  const { tiles, tilemap, tileW, tileH } = bgData;

  if (tiles.length > METATILE_DEF_INDEX_MASK + 1) {
    throw new Error(
      `Background needs ${tiles.length} unique tiles, over the ` +
        `${METATILE_DEF_INDEX_MASK + 1} PVSnesLib Map Engine can address ` +
        `(10-bit index field in each map cell)`
    );
  }

  const mapWidthPx = tileW * MAP_MTSIZE;
  const mapHeightPx = tileH * MAP_MTSIZE;
  // mapLoad() reads width/height/reserved (3 words) then the tilemap body.
  const header = [mapWidthPx & 0xffff, mapHeightPx & 0xffff, 0];
  // Bits 10-13 are ignored by mapRefreshAll's decode either way; cleared
  // here so the emitted data says what it means instead of relying on that.
  const body = tilemap.map(w => w & (METATILE_DEF_INDEX_MASK | MAP_CELL_FLIP_MASK));
  const layer1map = wordsToBytesLE(header.concat(body));

  const palBits = (paletteSlot & 7) << 10;
  const prioBit = priority ? 1 << 13 : 0;
  const defWords = new Array(METATILE_DEF_WORDS).fill(0);
  for (let i = 0; i < tiles.length; i++) {
    defWords[i] = (i & METATILE_DEF_INDEX_MASK) | palBits | prioBit;
  }
  const metatiles = wordsToBytesLE(defWords);

  const propWords = new Array(METATILE_PROP_WORDS).fill(0); // all T_EMPTY - see file header
  const tilesprop = wordsToBytesLE(propWords);

  return { layer1map, metatiles, tilesprop, mapWidthPx, mapHeightPx };
};

/*
 * Inverse of buildMapEngineBackground()'s render path - a JS mirror of
 * mapRefreshAll's per-cell decode (there is no way to run the real 65816
 * asm under Jest, so this is the round-trip check). Returns a tilemap array
 * in the exact same word format imageToBGData() produces, so it can be
 * compared directly against the original bgData.tilemap.
 */
const decodeMapEngineBackground = ({ layer1map, metatiles }) => {
  const mapWidthPx = layer1map[0] | (layer1map[1] << 8);
  const mapHeightPx = layer1map[2] | (layer1map[3] << 8);
  const tileW = mapWidthPx / MAP_MTSIZE;
  const tileH = mapHeightPx / MAP_MTSIZE;
  const bodyOffset = 6;

  const tilemap = [];
  for (let i = 0; i < tileW * tileH; i++) {
    const lo = layer1map[bodyOffset + i * 2];
    const hi = layer1map[bodyOffset + i * 2 + 1];
    const mapWord = lo | (hi << 8);
    const index = mapWord & METATILE_DEF_INDEX_MASK;
    const flip = mapWord & MAP_CELL_FLIP_MASK;

    const defLo = metatiles[index * 2];
    const defHi = metatiles[index * 2 + 1];
    const defWord = defLo | (defHi << 8);

    tilemap.push((defWord & (METATILE_DEF_INDEX_MASK | MAP_CELL_ATTR_MASK)) | flip);
  }
  return { tilemap, tileW, tileH };
};

module.exports = {
  MAP_MTSIZE,
  MAP_MAXMTILES,
  METATILE_DEF_WORDS,
  METATILE_DEF_INDEX_MASK,
  METATILE_PROP_WORDS,
  buildMapEngineBackground,
  decodeMapEngineBackground
};
