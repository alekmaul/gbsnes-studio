const l10n = require("../helpers/l10n").default;

const id = "EVENT_PLAYER_SET_STATE";
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
    type: "spriteState",
    label: l10n("FIELD_STATE"),
    defaultValue: "",
  },
  {
    key: "persist",
    label: l10n("FIELD_PERSIST_BETWEEN_SCENES"),
    type: "checkbox",
    defaultValue: false,
  },
];

// See eventActorSetState.js for why stateId resolves against this event's
// own spriteSheetId field rather than the player's live current sheet.
const compile = (input, helpers) => {
  const { playerSetSprite, sprites } = helpers;
  const sheet = (sprites || []).find((s) => s.id === input.spriteSheetId);
  const state = sheet && sheet.states && sheet.states.find((s) => s.id === input.stateId);
  const targetSpriteSheetId = state ? state.spriteSheetId : input.spriteSheetId;
  playerSetSprite(targetSpriteSheetId, input.persist);
};

module.exports = {
  id,
  groups,
  fields,
  compile,
};
