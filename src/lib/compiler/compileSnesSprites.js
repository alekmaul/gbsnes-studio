/*
 * Sprite compiler: turns sprite sheets (states -> animations -> frames ->
 * placed tiles, as edited on the Sprites page) into SNES data. Ported from GB
 * Studio 3.2.1's compileSprites.ts, for 4bpp colours and 8x8 / 16x16 hardware
 * sprites.
 *
 * Two steps:
 *  - compileSpriteSheet(): everything that depends on one sheet only - its
 *    colours, its unique tiles and its frames and animations.
 *  - packSceneSprites(): for the sheets a scene needs - places their tiles in
 *    OBJ VRAM, shares the 16-colour OBJ palettes between them and encodes the
 *    binary data the engine reads.
 *
 * Scene sprite data, little endian:
 *
 *   u8   slotCount
 *   u16  slotOffset[slotCount]      from the start of the data
 *
 *   slot (offsets below are from the start of the slot):
 *     s8   boundsLeft, boundsRight, boundsTop, boundsBottom
 *     u8   stateCount               one per project state name (see
 *     u16  stateOffset[stateCount]  getSpriteStateOrder)
 *     u16  frameTableOffset
 *     animation set, per distinct state:
 *       { u8 first, u8 last } x 8   positions in the frame table, in engine
 *                                   order: down, right, up, left, then the
 *                                   same four while moving
 *     frame table:
 *       u8   frameCount
 *       u16  frameOffset[frameCount]
 *     frame:
 *       u8   tileCount              front-most tile first (OAM order)
 *       { s8 dx, s8 dy, u8 tile, u8 attr, u8 large } x tileCount
 *
 * dx/dy are added to the actor's position (centre of its feet). attr is the
 * OAM attribute byte (vhoopppN, N = bit 8 of the tile number) and large is 1
 * for a 16x16 sprite.
 */
import {
  animationMapBySpriteType,
  toEngineOrder,
} from "../../components/sprites/helpers";
import { rgbToBGR555, paletteBytes, tileFromIndices } from "./snesgfx";

const getPixels = require("util").promisify(require("get-pixels"));

export const MAX_SPRITE_COLORS = 16; // including the transparent one
export const OBJ_VRAM_TILES = 512;
export const OBJ_PALETTE_COUNT = 8;
const TILES_PER_ROW = 16;
const NUM_ANIMATIONS = 8;
const MAX_FRAMES = 255;

// OBJ priority in Mode 1: 2 is in front of the background, 1 behind it
export const OBJ_PRIORITY_FRONT = 2;
export const OBJ_PRIORITY_BEHIND = 1;

/* ---- images ------------------------------------------------------------ */

// Pixel reader with the transparency rule shared with the editor
// (lib/sprite/transparency.ts): the top left colour, or a see-through pixel
const readImage = async (filename) => {
  const pixels = await getPixels(filename);
  const [width, height, channels] = pixels.shape;
  const rgb = (x, y) => [
    pixels.get(x, y, 0),
    pixels.get(x, y, 1),
    pixels.get(x, y, 2),
  ];
  const key = rgb(0, 0).join(",");
  // null when transparent or outside the image
  const colorAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return null;
    }
    if (channels > 3 && pixels.get(x, y, 3) < 128) {
      return null;
    }
    const color = rgb(x, y);
    return color.join(",") === key ? null : color;
  };
  return { width, height, colorAt, transparentColor: rgb(0, 0) };
};

const distance = (a, b) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// Index of the closest colour, skipping the transparent entry 0
const nearestColor = (colors, color) => {
  let best = 1;
  for (let i = 2; i < colors.length; i++) {
    if (distance(colors[i], color) < distance(colors[best], color)) {
      best = i;
    }
  }
  return best;
};

/* ---- tiles ------------------------------------------------------------- */

const flipH = (rows) => rows.map((row) => row.slice().reverse());
const flipV = (rows) => rows.slice().reverse();
const tileKey = (rows) => rows.map((row) => row.join(",")).join("|");

// Keeps one copy of each tile, whatever its orientation
const createTileSet = () => {
  const tiles = [];
  const lookup = new Map();
  const add = (rows) => {
    const orientations = [
      { flipX: false, flipY: false, rows },
      { flipX: true, flipY: false, rows: flipH(rows) },
      { flipX: false, flipY: true, rows: flipV(rows) },
      { flipX: true, flipY: true, rows: flipH(flipV(rows)) },
    ];
    for (let i = 0; i < orientations.length; i++) {
      const found = lookup.get(tileKey(orientations[i].rows));
      if (found !== undefined) {
        return {
          tile: found,
          flipX: orientations[i].flipX,
          flipY: orientations[i].flipY,
        };
      }
    }
    lookup.set(tileKey(rows), tiles.length);
    tiles.push({ size: rows.length, rows });
    return { tile: tiles.length - 1, flipX: false, flipY: false };
  };
  return { tiles, add };
};

/* ---- dialogue portraits ------------------------------------------------- */

// The portraits of one scene: the top left 16x16 of each image, drawn over the
// dialogue box background (boxFill, 8x8 colours) because the engine opens a
// hole in the box to show them - BG3 would hide any sprite behind it. They
// share one OBJ palette.
export const compileSnesAvatars = async (filenames, boxFill) => {
  const warnings = [];
  const colors = [[0, 0, 0]];
  const indexByColor = new Map();
  let overflow = false;
  const colorIndex = (color) => {
    const key = rgbToBGR555(color[0], color[1], color[2]);
    let index = indexByColor.get(key);
    if (index === undefined) {
      if (colors.length < MAX_SPRITE_COLORS) {
        index = colors.length;
        colors.push(color);
      } else {
        index = nearestColor(colors, color);
        overflow = true;
      }
      indexByColor.set(key, index);
    }
    return index;
  };

  // The box colours come first, they must not be approximated
  boxFill.forEach((row) => row.forEach(colorIndex));

  const avatars = [];
  for (let i = 0; i < filenames.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const image = await readImage(filenames[i]);
    const quad = (ox, oy) =>
      tileFromIndices(
        Array.from({ length: 8 }, (_, y) =>
          Array.from({ length: 8 }, (__, x) =>
            colorIndex(image.colorAt(ox + x, oy + y) || boxFill[y][x])
          )
        )
      );
    avatars.push([quad(0, 0), quad(8, 0), quad(0, 8), quad(8, 8)]);
  }
  if (overflow) {
    warnings.push(
      `The dialogue portraits of a scene use more than ${
        MAX_SPRITE_COLORS - 1
      } colours between them - the extra ones are approximated.`
    );
  }

  return {
    avatars,
    paletteBytes: paletteBytes(colors.map((c) => rgbToBGR555(...c))),
    warnings,
  };
};

/* ---- one sprite sheet --------------------------------------------------- */

const firstIndexOfMatch = (list, pattern) => {
  for (let i = 0; i + pattern.length <= list.length; i++) {
    if (pattern.every((value, j) => list[i + j] === value)) {
      return i;
    }
  }
  return -1;
};

export const compileSpriteSheet = async (sheet, filename) => {
  const warnings = [];
  const label = sheet.name || sheet.filename;
  const image = await readImage(filename);

  // Colours, in the order the tiles use them
  const colors = [image.transparentColor];
  const colorIndex = new Map();
  let droppedColors = 0;
  const indexOf = (color) => {
    if (!color) {
      return 0;
    }
    const key = color.join(",");
    let index = colorIndex.get(key);
    if (index === undefined) {
      if (colors.length < MAX_SPRITE_COLORS) {
        index = colors.length;
        colors.push(color);
      } else {
        droppedColors++;
        index = nearestColor(colors, color);
      }
      colorIndex.set(key, index);
    }
    return index;
  };

  const tileSet = createTileSet();
  const sliceCache = new Map();
  const slice = ({ sliceX, sliceY, size }) => {
    const key = `${sliceX},${sliceY},${size}`;
    if (!sliceCache.has(key)) {
      const rows = [];
      for (let y = 0; y < size; y++) {
        const row = [];
        for (let x = 0; x < size; x++) {
          row.push(indexOf(image.colorAt(sliceX + x, sliceY + y)));
        }
        rows.push(row);
      }
      const blank = rows.every((row) => row.every((v) => v === 0));
      sliceCache.set(key, blank ? null : tileSet.add(rows));
    }
    return sliceCache.get(key);
  };

  let outOfRange = 0;

  // A frame as OAM entries, optionally mirrored to face the other way
  const compileFrame = (frame, mirror) =>
    frame.tiles
      .map((tile) => {
        const found = slice(tile);
        if (!found) {
          return null;
        }
        const dx = mirror ? 8 - tile.x - tile.size : tile.x - 8;
        const dy = -(tile.y + tile.size);
        if (dx < -128 || dx > 127 || dy < -128 || dy > 127) {
          outOfRange++;
          return null;
        }
        // flips: the tile's own, the stored copy's, and the mirroring
        const flipX = !!tile.flipX !== found.flipX;
        return {
          tile: found.tile,
          dx,
          dy,
          flipX: mirror ? !flipX : flipX,
          flipY: !!tile.flipY !== found.flipY,
          priority: !!tile.priority,
        };
      })
      .filter(Boolean)
      // the editor draws the first tile at the back, OAM wants it last
      .reverse();

  const frames = [];
  const frameLookup = new Map();
  const frameIndex = (entries) => {
    const key = JSON.stringify(entries);
    if (!frameLookup.has(key)) {
      frameLookup.set(key, frames.length);
      frames.push(entries);
    }
    return frameLookup.get(key);
  };

  const frameOrder = [];
  const states = sheet.states.map((state) => {
    const animations = toEngineOrder(
      animationMapBySpriteType(
        state.animations,
        state.animationType,
        state.flipLeft,
        (animation, mirror) => {
          const source =
            animation && animation.frames.length
              ? animation.frames
              : [{ tiles: [] }];
          return source.map((frame) =>
            frameIndex(compileFrame(frame, mirror))
          );
        }
      )
    ).map((indexes) => {
      let first = firstIndexOfMatch(frameOrder, indexes);
      if (first === -1) {
        first = frameOrder.length;
        frameOrder.push(...indexes);
      }
      return { first, last: first + indexes.length - 1 };
    });
    return { name: state.name || "", animations };
  });

  if (droppedColors > 0) {
    warnings.push(
      `Sprite '${label}' uses more than ${MAX_SPRITE_COLORS - 1} colours ` +
        `plus the transparent one - ${droppedColors} colour(s) replaced by ` +
        `the closest one.`
    );
  }
  if (outOfRange > 0) {
    warnings.push(
      `Sprite '${label}' has tiles more than 128 pixels away from its ` +
        `actor - they are left out.`
    );
  }
  if (frameOrder.length > MAX_FRAMES) {
    warnings.push(
      `Sprite '${label}' has more than ${MAX_FRAMES} animation frames - ` +
        `the extra ones can't be played.`
    );
  }

  const boundsX = sheet.boundsX || 0;
  const boundsY = sheet.boundsY || 0;
  const boundsWidth =
    sheet.boundsWidth === undefined ? 16 : sheet.boundsWidth;
  const boundsHeight =
    sheet.boundsHeight === undefined ? 16 : sheet.boundsHeight;

  return {
    id: sheet.id,
    name: label,
    colors,
    tiles: tileSet.tiles,
    frames,
    frameOrder: frameOrder.slice(0, MAX_FRAMES),
    states,
    // Relative to the actor, as GB Studio 3.2.1 measures them: x from the
    // left of the 16px box under the actor, y upwards from its feet
    bounds: {
      left: boundsX - 8,
      right: boundsX - 8 + boundsWidth - 1,
      top: -(boundsY + boundsHeight),
      bottom: -boundsY - 1,
    },
    warnings,
  };
};

// Every state name of the project: the default one first, then the most used.
// Scripts refer to a state by its position in this list.
export const getSpriteStateOrder = (sheets) => {
  const counts = new Map();
  sheets.forEach((sheet) =>
    sheet.states.forEach((state) => {
      if (state.name) {
        counts.set(state.name, (counts.get(state.name) || 0) + 1);
      }
    })
  );
  const names = Array.from(counts.keys());
  names.sort((a, b) => counts.get(b) - counts.get(a));
  return [""].concat(names);
};

/* ---- one scene ----------------------------------------------------------- */

// Gives each sheet an OBJ palette, sharing one once there are none left
const assignPalettes = (sheets, registers, warnings, sceneName) => {
  const palettes = new Map(); // register -> colours
  return sheets.map((sheet) => {
    let register = registers.find((r) => !palettes.has(r));
    if (register === undefined) {
      // The palette needing the fewest colours replaced, then added
      const cost = (r) => {
        const used = palettes.get(r);
        const missing = sheet.colors
          .slice(1)
          .filter((c) => !used.some((u, i) => i && distance(u, c) === 0));
        const room = MAX_SPRITE_COLORS - used.length;
        return Math.max(0, missing.length - room) * 100 + missing.length;
      };
      register = registers.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    }
    if (!palettes.has(register)) {
      palettes.set(register, [sheet.colors[0]]);
    }
    const used = palettes.get(register);
    let replaced = 0;
    const remap = sheet.colors.map((color, i) => {
      if (i === 0) {
        return 0;
      }
      let index = used.findIndex((u, j) => j && distance(u, color) === 0);
      if (index === -1) {
        if (used.length < MAX_SPRITE_COLORS) {
          index = used.length;
          used.push(color);
        } else {
          replaced++;
          index = nearestColor(used, color);
        }
      }
      return index;
    });
    if (replaced > 0) {
      warnings.push(
        `Scene '${sceneName}': too many sprite colours - ${replaced} ` +
          `colour(s) of '${sheet.name}' replaced by the closest one of the ` +
          `palette it shares. Use fewer sprite sheets or colours in this scene.`
      );
    }
    return { register, remap, palettes };
  });
};

// Free space in the OBJ tile area, a grid 16 tiles wide. A 16x16 sprite uses
// tiles n, n+1, n+16 and n+17: placed on even rows and columns only, which
// also keeps it inside one 256 tile page.
const createVram = (totalTiles, reserved) => {
  const used = new Array(totalTiles).fill(false);
  reserved.forEach(([start, end]) => used.fill(true, start, end));
  const available = used.filter((u) => !u).length;
  const data = new Array(totalTiles * 32).fill(0);
  const placed = new Map();

  const cells = (base, size) =>
    size === 8 ? [base] : [base, base + 1, base + 16, base + 17];

  const place = (rows) => {
    const size = rows.length;
    const key = `${size}:${tileKey(rows)}`;
    if (placed.has(key)) {
      return placed.get(key);
    }
    for (let base = 0; base < totalTiles; base++) {
      const aligned =
        size === 8 ||
        (base % 2 === 0 && Math.floor(base / TILES_PER_ROW) % 2 === 0);
      if (aligned && cells(base, size).every((c) => used[c] === false)) {
        cells(base, size).forEach((cell, i) => {
          const x = size === 8 ? 0 : (i % 2) * 8;
          const y = size === 8 ? 0 : Math.floor(i / 2) * 8;
          const bytes = tileFromIndices(
            rows.slice(y, y + 8).map((row) => row.slice(x, x + 8))
          );
          used[cell] = true;
          for (let b = 0; b < 32; b++) data[cell * 32 + b] = bytes[b];
        });
        placed.set(key, base);
        return base;
      }
    }
    return null;
  };

  // Length of the area holding what was placed (a 16x16 tile ends on the
  // second tile of its lower row)
  const usedTiles = () =>
    Array.from(placed.keys()).reduce((max, key) => {
      const size = key.startsWith("8:") ? 1 : 18;
      return Math.max(max, placed.get(key) + size);
    }, 0);

  return { data, place, usedTiles, available };
};

const u16 = (value) => [value & 0xff, (value >> 8) & 0xff];

const encodeSlot = (sheet, entriesByFrame, stateOrder) => {
  // Every project state: this sheet's state of that name, else its default one
  const localStates = stateOrder.map((name) =>
    Math.max(
      0,
      sheet.states.findIndex((s) => s.name === name)
    )
  );
  const headerSize = 4 + 1 + stateOrder.length * 2 + 2;
  const setSize = NUM_ANIMATIONS * 2;
  const frameTableOffset = headerSize + sheet.states.length * setSize;
  const framesOffset = frameTableOffset + 1 + sheet.frameOrder.length * 2;

  const frameBytes = [];
  const offsets = entriesByFrame.map((entries) => {
    const offset = framesOffset + frameBytes.length;
    frameBytes.push(
      entries.length,
      ...[].concat(
        ...entries.map((e) => [
          e.dx & 0xff,
          e.dy & 0xff,
          e.tile & 0xff,
          e.attr,
          e.large,
        ])
      )
    );
    return offset;
  });

  const { bounds } = sheet;
  return [].concat(
    [bounds.left, bounds.right, bounds.top, bounds.bottom].map(
      (v) => Math.max(-128, Math.min(127, v)) & 0xff
    ),
    stateOrder.length,
    ...localStates.map((s) => u16(headerSize + s * setSize)),
    u16(frameTableOffset),
    ...sheet.states.map((state) =>
      [].concat(...state.animations.map((a) => [a.first, a.last]))
    ),
    sheet.frameOrder.length,
    ...sheet.frameOrder.map((frame) => u16(offsets[frame])),
    frameBytes
  );
};

/*
 * sheets: compiled sheets, in slot order. options:
 *   stateOrder     getSpriteStateOrder() of the project
 *   reserved       [first, end[ tile ranges of OBJ VRAM used by something else
 *   palettes       OBJ palette registers the sheets may use
 *   sceneName      for warnings
 * Returns { tiles, tileCount, paletteBytes (all 8 OBJ palettes), data,
 *   slotPalettes, warnings }.
 */
export const packSceneSprites = (
  sheets,
  {
    stateOrder = [""],
    reserved = [],
    palettes = [0, 1, 2, 3, 4, 5, 6, 7],
    sceneName = "",
  } = {}
) => {
  const warnings = [];
  const vram = createVram(OBJ_VRAM_TILES, reserved);
  const assigned = assignPalettes(sheets, palettes, warnings, sceneName);

  const remapped = sheets.map((sheet, i) =>
    sheet.tiles.map((tile) => ({
      ...tile,
      rows: tile.rows.map((row) => row.map((v) => assigned[i].remap[v])),
    }))
  );

  // 16x16 tiles first: single tiles then fill whatever space they leave
  const bases = remapped.map(() => []);
  let overflow = false;
  [16, 8].forEach((size) => {
    remapped.forEach((tiles, slot) => {
      tiles.forEach((tile, index) => {
        if (tile.size === size) {
          const base = vram.place(tile.rows);
          overflow = overflow || base === null;
          bases[slot][index] = base;
        }
      });
    });
  });
  if (overflow) {
    warnings.push(
      `Scene '${sceneName}' needs more than the ` +
        `${vram.available} sprite tiles available - some ` +
        `parts of its sprites are missing. Use fewer sprite sheets or frames.`
    );
  }

  const slots = sheets.map((sheet, slot) => {
    const entries = sheet.frames.map((frame) =>
      frame
        .filter((e) => bases[slot][e.tile] !== null)
        .map((e) => {
          const tile = bases[slot][e.tile];
          const priority = e.priority
            ? OBJ_PRIORITY_BEHIND
            : OBJ_PRIORITY_FRONT;
          return {
            dx: e.dx,
            dy: e.dy,
            tile,
            attr:
              (e.flipY ? 0x80 : 0) |
              (e.flipX ? 0x40 : 0) |
              (priority << 4) |
              (assigned[slot].register << 1) |
              (tile >> 8),
            large: sheet.tiles[e.tile].size === 16 ? 1 : 0,
          };
        })
    );
    return encodeSlot(sheet, entries, stateOrder);
  });

  let offset = 1 + slots.length * 2;
  const slotOffsets = slots.map((slot) => {
    const start = offset;
    offset += slot.length;
    return start;
  });
  const data = [].concat(
    slots.length,
    ...slotOffsets.map(u16),
    ...slots
  );
  if (offset > 0x7fff) {
    warnings.push(
      `Scene '${sceneName}' has too much sprite animation data (${offset} ` +
        `bytes, at most 32767).`
    );
  }

  const cgram = [];
  for (let register = 0; register < OBJ_PALETTE_COUNT; register++) {
    const used = assigned.length && assigned[0].palettes.get(register);
    const words = (used || []).map(([r, g, b]) => rgbToBGR555(r, g, b));
    while (words.length < MAX_SPRITE_COLORS) words.push(0);
    words[0] = 0;
    cgram.push(...paletteBytes(words));
  }

  return {
    tiles: vram.data,
    tileCount: vram.usedTiles(),
    paletteBytes: cgram,
    data,
    slotPalettes: assigned.map((a) => a.register),
    warnings,
  };
};
