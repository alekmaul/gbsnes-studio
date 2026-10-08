import {
  encodeOamProps,
  encodeFrameDurationTicks,
  buildFrameRecordBytes,
  compileSpriteSheetMetasprites,
  compileSnesSprites,
  asmLabel,
  METASPRITE_END_U16,
} from "../../../src/lib/compiler/compileSnesSprites";
import { SpriteSheet, SpriteFrame } from "../../../src/store/features/entities/entitiesTypes";

describe("compileSnesSprites", () => {
  describe("encodeOamProps", () => {
    it("should encode no flip / normal priority / palette 0 as priority-2, nothing else set", () => {
      expect(
        encodeOamProps({ flipX: false, flipY: false, priority: false, paletteIndex: 0 })
      ).toBe(0x20);
    });

    it("should encode priority:true as OAM priority 3, never priority 0", () => {
      expect(
        encodeOamProps({ flipX: false, flipY: false, priority: true, paletteIndex: 0 })
      ).toBe(0x30);
    });

    it("should pack flipX/palette into the real OAM_ATTR bit positions", () => {
      // flipX -> bit6 (0x40), priority false -> 2<<4 (0x20), palette 5 -> 5<<1 (0x0a)
      expect(
        encodeOamProps({ flipX: true, flipY: false, priority: false, paletteIndex: 5 })
      ).toBe(0x6a);
    });

    it("should pack flipY/high-priority/max-palette together", () => {
      // flipY -> bit7 (0x80), priority true -> 3<<4 (0x30), palette 7 -> 7<<1 (0x0e)
      expect(
        encodeOamProps({ flipX: false, flipY: true, priority: true, paletteIndex: 7 })
      ).toBe(0xbe);
    });

    it("should clamp an out-of-range palette index rather than corrupt adjacent bits", () => {
      expect(
        encodeOamProps({ flipX: false, flipY: false, priority: false, paletteIndex: 99 })
      ).toBe(encodeOamProps({ flipX: false, flipY: false, priority: false, paletteIndex: 7 }));
    });
  });

  describe("encodeFrameDurationTicks", () => {
    it("should convert a round millisecond duration to 60Hz ticks", () => {
      expect(encodeFrameDurationTicks(1000)).toBe(60);
      expect(encodeFrameDurationTicks(150)).toBe(9);
    });

    it("should clamp to a minimum of 1 tick (never a zero-length frame)", () => {
      expect(encodeFrameDurationTicks(1)).toBe(1);
    });

    it("should clamp to a maximum of 255 ticks (one byte)", () => {
      expect(encodeFrameDurationTicks(10000)).toBe(255);
    });
  });

  describe("asmLabel", () => {
    it("should replace characters that are not valid in a WLA-DX label", () => {
      expect(asmLabel("idle-down (left)")).toBe("idle_down__left_");
    });

    it("should prefix a leading digit so the label stays a valid symbol", () => {
      expect(asmLabel("3frames")).toBe("_3frames");
    });
  });

  describe("buildFrameRecordBytes", () => {
    it("should emit one 8-byte t_metasprite record per tile plus an 8-byte terminator", () => {
      const frame: SpriteFrame = {
        id: "f0",
        durationMs: 150,
        tiles: [
          {
            id: "t0",
            x: 5,
            y: -3,
            tileIndex: 10,
            flipX: true,
            flipY: false,
            priority: false,
            paletteIndex: 2,
          },
        ],
      };

      const bytes = buildFrameRecordBytes(frame);

      expect(bytes).toEqual([
        5, 0, // dx = 5
        253, 255, // dy = -3 as u16 (0xFFFD)
        10, 0, // dtile = 10 (the flat tile-bank index, unchanged)
        0x64, 0, // props: flipX(0x40) | priority-false(0x20) | palette2(0x04); unused
        METASPRITE_END_U16 & 0xff, (METASPRITE_END_U16 >> 8) & 0xff, 0, 0, 0, 0, 0, 0,
      ]);
    });

    it("should emit only the terminator record for a frame with no tiles", () => {
      const frame: SpriteFrame = { id: "f0", durationMs: 150, tiles: [] };
      expect(buildFrameRecordBytes(frame)).toEqual([
        METASPRITE_END_U16 & 0xff,
        (METASPRITE_END_U16 >> 8) & 0xff,
        0, 0, 0, 0, 0, 0,
      ]);
    });
  });

  describe("compileSpriteSheetMetasprites", () => {
    const sheet: SpriteSheet = {
      id: "sheet-1",
      name: "Hero",
      filename: "hero.png",
      type: "actor",
      numFrames: 3,
      inode: "inode-1",
      _v: 1,
      animationStates: [
        {
          id: "state-1",
          name: "Default",
          animationType: "fixed",
          subStates: [
            {
              id: "substate-1",
              key: "idle",
              loop: true,
              frames: [
                {
                  id: "frame-1",
                  durationMs: 150,
                  tiles: [
                    {
                      id: "tile-1",
                      x: 0,
                      y: 0,
                      tileIndex: 0,
                      flipX: false,
                      flipY: false,
                      priority: false,
                      paletteIndex: 0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    it("should emit a self-contained superfree section named after the sheet symbol", () => {
      const result = compileSpriteSheetMetasprites(sheet, "hero");
      expect(result.filename).toBe("hero_meta_data.as");
      expect(result.source).toContain('.section "rodata_hero_meta" superfree');
      expect(result.source).toContain(".ends");
    });

    it("should emit one OAM table label per frame and a frames list pointing at it", () => {
      const result = compileSpriteSheetMetasprites(sheet, "hero");
      expect(result.source).toContain("hero_state_1_idle_f0_oam:");
      expect(result.source).toContain(".dw hero_state_1_idle_f0_oam");
      // frame duration: 150ms -> 9 ticks
      expect(result.source).toMatch(/\.dw hero_state_1_idle_f0_oam\n\.db 9/);
    });

    it("should terminate the frames list and the substate directory with a zero pointer", () => {
      const result = compileSpriteSheetMetasprites(sheet, "hero");
      expect(result.source).toContain("hero_state_1_idle_frames:");
      expect(result.source).toMatch(/hero_state_1_idle_frames:\n(.|\n)*?\.dw 0\n\.db 0/);
      expect(result.source.trim().endsWith(".ends")).toBe(true);
    });

    it("should record the substate's loop flag in the sheet-level directory", () => {
      const result = compileSpriteSheetMetasprites(sheet, "hero");
      expect(result.substateDirectoryLabel).toBe("hero_substates");
      expect(result.source).toMatch(/hero_substates:\n\.dw hero_state_1_idle_frames\n\.db 1/);
    });

    it("should record loop:false as a 0 byte, not the 1 a true substate gets", () => {
      const nonLooping: SpriteSheet = {
        ...sheet,
        animationStates: [
          {
            ...sheet.animationStates![0],
            subStates: [{ ...sheet.animationStates![0].subStates[0], loop: false }],
          },
        ],
      };
      const result = compileSpriteSheetMetasprites(nonLooping, "hero");
      expect(result.source).toMatch(/hero_substates:\n\.dw hero_state_1_idle_frames\n\.db 0/);
    });
  });

  describe("compileSnesSprites", () => {
    it("should skip a sheet with no animationStates at all", () => {
      const untouched: SpriteSheet = {
        id: "sheet-2",
        name: "Untouched",
        filename: "untouched.png",
        type: "static",
        numFrames: 1,
        inode: "inode-2",
        _v: 1,
      };
      expect(compileSnesSprites([{ sheet: untouched, symbol: "untouched" }])).toEqual([]);
    });
  });
});
