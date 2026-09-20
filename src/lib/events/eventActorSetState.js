const l10n = require("../helpers/l10n").default;

const id = "EVENT_ACTOR_SET_STATE";
const groups = ["EVENT_GROUP_ACTOR"];

const fields = [
  {
    key: "actorId",
    type: "actor",
    defaultValue: "$self$",
  },
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
];

// Thin layer over the existing EVENT_ACTOR_SET_SPRITE mechanism (same
// actorSetSprite/playerSetSprite helpers, same ACTOR_SET_SPRITE/
// PLAYER_SET_SPRITE opcodes - no new bytecode). "stateId" resolves through
// the *selected* sheet's own states[] (SpriteSheet.states, Phase 2) to the
// real target spriteSheetId; an empty/unmatched stateId falls back to
// spriteSheetId itself (the sheet's implicit "Default" state). Resolving
// against the field's own spriteSheetId rather than trying to look up
// "whatever sheet this actor is currently wearing" is deliberate: that
// would need project settings (defaultPlayerSprites, per-scene
// playerSpriteSheetId) that compileEntityEvents' helpers don't carry, and
// could differ from the sheet actually authoring these states if an
// earlier event already swapped it at runtime.
const compile = (input, helpers) => {
  const { actorSetActive, actorSetSprite, playerSetSprite, getActorById, sprites } = helpers;
  const sheet = (sprites || []).find((s) => s.id === input.spriteSheetId);
  const state = sheet && sheet.states && sheet.states.find((s) => s.id === input.stateId);
  const targetSpriteSheetId = state ? state.spriteSheetId : input.spriteSheetId;
  if (!getActorById(input.actorId)) {
    playerSetSprite(targetSpriteSheetId);
  } else {
    actorSetActive(input.actorId);
    actorSetSprite(targetSpriteSheetId);
  }
};

module.exports = {
  id,
  groups,
  fields,
  compile,
};
