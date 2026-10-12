/*
 * packSceneSprites.js - SPRITE_EDITOR_PROGRESS.md M8.2. A generalized OBJ-tile
 * packer for a scene's actor/avatar sprite poses, built to replace
 * compileSnesData.js's current buildSceneSprites()/placeTiles()/placeFrames()
 * fixed-region scheme (one hardcoded 8-slot/32-tile region per pose-type -
 * down-A/up-A/side-A/down-B/up-B/side-B - always fully reserved regardless of
 * how many actors/frames a given scene actually uses).
 *
 * Hardware constraint this packer has to respect (see snesFixedAssets.js's
 * own header comment): a 16x16 "large" OBJ is one hardware tile index N
 * addressing a fixed 2x2 block (N, N+1, N+16, N+17) in the 16-tile-wide OBJ
 * name table. Two such blocks can only be placed independently if they don't
 * share a tile - within one "row pair" (2 consecutive rows = 32 tiles), up to
 * 8 blocks fit (one per even column 0,2,...,14), each block's bottom half
 * landing in the row below; once a row pair's 8 slots are used, the next
 * block MUST start a fresh row pair, or its top half would land on tiles the
 * previous row pair's blocks already used for their bottom half. This is why
 * the old fixed regions were always exactly 32 tiles (one row pair) each -
 * not an arbitrary round number.
 *
 * This packer generalizes that into a flat, on-demand allocator instead of N
 * fixed per-pose-type regions: alloc(quad) takes one pose's 4 tiles (TL, TR,
 * BL, BR order, each a 32-byte 4bpp tile) and returns the VRAM tile-base
 * address N to use for that pose's OAM tile attribute - hardware then reads
 * N, N+1, N+16, N+17 automatically. Identical quads (byte-for-byte, e.g. two
 * actors sharing a near-blank "idle" pose) dedupe to a single placement.
 *
 * Budget is the caller's total tile count (512 = the 2 full OBJ "name
 * tables"/pages this engine's fixed VRAM layout already reserves for
 * sprites - see CLAUDE.md's "Fixed VRAM layout" entry, OBJ_GFX_VRAM) minus a
 * reserved prefix the caller keeps for its own fixed assets (today: the
 * placeholder player quad + the project-wide emote region, 2 row pairs / 64
 * tiles - see compileSnesData.js's own call site for the real number). A
 * pose that doesn't fit the remaining budget is dropped (alloc returns null)
 * and a single warning is recorded, not one per overflowing pose - matching
 * every other budget warning already in this codebase (e.g. the >8-sprite-
 * sheets-per-scene warning in compileSnesData.js itself).
 *
 * M8.2 scope note: this module is real and tested, and compileSnesData.js
 * calls it to compute a real, accurate per-scene budget warning under the
 * new 512-tile ceiling - genuinely useful today, independent of anything
 * else. It does NOT yet replace buildSceneSprites()'s own placement (the
 * bytes that actually reach assets.c are still produced by the old fixed-
 * region code, unchanged) - swapping the real emission over to this packer's
 * placements requires scene.c to read tile-base addresses at runtime instead
 * of the compile-time ACTOR_UP_TILE0-style constants it has today, which is
 * M8.3's job (paired engine + compiler change, so the ROM never passes
 * through a half-migrated, non-bootable state).
 */

const TILES_PER_PAIR = 32; // 2 rows x 16 tiles = one row-pair, 8 quad slots
const SLOTS_PER_PAIR = 8;

const quadKey = (quad) => quad.map((tile) => tile.join(",")).join("|");

/*
 * createScenePacker({ totalTiles, reservedTiles }) - totalTiles is the whole
 * OBJ tile budget (512); reservedTiles is how many tiles at the start of the
 * sheet the caller manages itself (not touched by alloc()) - must be a
 * multiple of TILES_PER_PAIR, since a partially-used row pair can't safely
 * be shared between the caller's own fixed placements and this packer's
 * dynamic ones.
 */
const createScenePacker = ({ totalTiles = 512, reservedTiles = 0 } = {}) => {
  if (reservedTiles % TILES_PER_PAIR !== 0) {
    throw new Error(
      `createScenePacker: reservedTiles (${reservedTiles}) must be a multiple of ${TILES_PER_PAIR}`
    );
  }
  const sheet = new Array(totalTiles * 32).fill(0);
  const placedAt = new Map(); // quad content key -> tileBase
  const warnings = [];
  const capacityPairs = Math.floor(totalTiles / TILES_PER_PAIR);
  let nextPair = reservedTiles / TILES_PER_PAIR;
  let slotInPair = 0;
  let overflowWarned = false;
  let usedPairs = nextPair;

  const alloc = (quad, label) => {
    const key = quadKey(quad);
    const existing = placedAt.get(key);
    if (existing !== undefined) {
      return existing;
    }

    if (slotInPair >= SLOTS_PER_PAIR) {
      nextPair += 1;
      slotInPair = 0;
    }
    if (nextPair >= capacityPairs) {
      if (!overflowWarned) {
        overflowWarned = true;
        warnings.push(
          `Scene sprite data needs more OBJ tiles than the ${totalTiles - reservedTiles} ` +
            `available for actor/avatar poses - extra poses${label ? ` (starting at '${label}')` : ""} ` +
            `are dropped (render blank). Use fewer distinct sprite sheets, fewer animation ` +
            `frames, or fewer avatars in this scene.`
        );
      }
      return null;
    }

    const base = nextPair * TILES_PER_PAIR + slotInPair * 2;
    slotInPair += 1;
    usedPairs = Math.max(usedPairs, nextPair + 1);
    quad.forEach((tile, i) => {
      const dst = [base, base + 1, base + 16, base + 17][i];
      for (let b = 0; b < 32; b++) sheet[dst * 32 + b] = tile[b];
    });
    placedAt.set(key, base);
    return base;
  };

  return {
    alloc,
    sheet,
    warnings,
    get tileCount() {
      return usedPairs * TILES_PER_PAIR;
    }
  };
};

module.exports = { createScenePacker, TILES_PER_PAIR, SLOTS_PER_PAIR };
