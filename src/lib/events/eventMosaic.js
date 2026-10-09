const l10n = require("../helpers/l10n").default;

const id = "EVENT_MOSAIC";
const groups = ["EVENT_GROUP_SCREEN"];

// Target Layers: only BG1 (background) and BG3 (dialogue/UI overlay) are
// ever meaningful on this engine - BG2 is unused (game.c disables it) and
// BG4 doesn't exist in Mode 1. Sprites/OBJ have no hardware mosaic at all on
// the SNES (REG_MOSAIC only ever divides BG layers), so there is no third
// checkbox to offer - see mosaic.h's own comment for the full reasoning.
const fields = [
  {
    key: "size",
    type: "number",
    label: l10n("FIELD_SIZE"),
    min: 0,
    max: 15,
    step: 1,
    defaultValue: 0
  },
  {
    key: "bg1",
    type: "checkbox",
    label: l10n("FIELD_MOSAIC_TARGET_BG1"),
    defaultValue: true
  },
  {
    key: "bg3",
    type: "checkbox",
    label: l10n("FIELD_MOSAIC_TARGET_BG3"),
    defaultValue: true
  },
  {
    key: "speed",
    type: "number",
    label: l10n("FIELD_SPEED"),
    min: 0,
    max: 5,
    step: 1,
    defaultValue: 1
  },
  {
    key: "wait",
    type: "checkbox",
    label: l10n("FIELD_WAIT_UNTIL_FINISHED"),
    defaultValue: true
  }
];

const compile = (input, helpers) => {
  const { mosaicSet } = helpers;
  const size = typeof input.size === "number" ? input.size : 0;
  const speed = typeof input.speed === "number" ? input.speed : 1;
  const bg1 = input.bg1;
  const bg3 = input.bg3;
  const wait = input.wait;
  let bgMask = 0;
  if (bg1) {
    bgMask |= 1; // MOSAIC_BG1
  }
  if (bg3) {
    bgMask |= 4; // MOSAIC_BG3
  }
  mosaicSet(size, bgMask, speed, wait);
};

module.exports = {
  id,
  groups,
  fields,
  compile
};
