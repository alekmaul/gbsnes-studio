const l10n = require("../helpers/l10n").default;

const id = "EVENT_PLAYER_SET_ANIM_STATE";
const groups = ["EVENT_GROUP_ACTOR"];

const fields = [
  {
    key: "spriteSheetId",
    type: "sprite",
    label: l10n("FIELD_SPRITE_SHEET"),
    defaultValue: "LAST_SPRITE",
  },
  {
    key: "stateId",
    type: "animState",
    label: l10n("FIELD_ANIM_STATE"),
    defaultValue: "",
  },
];

// See eventActorSetAnimState.js for why stateId resolves against this
// event's own spriteSheetId field, and how it differs from
// EVENT_PLAYER_SET_STATE's older, unrelated "Sprite Swap" states[].
const compile = (input, helpers) => {
  const { playerSetAnimState, sprites } = helpers;
  const sheet = (sprites || []).find((s) => s.id === input.spriteSheetId);
  const animStates = (sheet && sheet.animStates) || [];
  const stateIndex = input.stateId
    ? 1 + animStates.findIndex((s) => s.id === input.stateId)
    : 0;
  playerSetAnimState(Math.max(0, stateIndex));
};

module.exports = {
  id,
  groups,
  fields,
  compile,
};
