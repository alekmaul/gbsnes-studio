const l10n = require("../helpers/l10n").default;

const id = "EVENT_ACTOR_SET_ANIM_STATE";
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
    type: "animState",
    label: l10n("FIELD_ANIM_STATE"),
    defaultValue: "",
  },
];

// Named animation states (v4 follow-up) - GB Studio 3.2.1-style named
// pose-sets *within* one sheet (animStates[], entitiesTypes.ts), not to be
// confused with EVENT_ACTOR_SET_STATE's older, unrelated whole-sheet
// "Sprite Swap" states[]. "stateId" resolves through the *selected*
// sheet's own animStates[] to a plain index (0 = that sheet's own
// default/implicit state, 1+ = animStates[N-1]) - ACTOR_SET_ANIM_STATE
// (script_cmds.c) just applies it to the actor's own already-loaded
// sheet/slot at runtime, no new sheet lookup needed there (unlike
// ACTOR_SET_SPRITE's project-wide sprite index).
const compile = (input, helpers) => {
  const { actorSetActive, actorSetAnimState, playerSetAnimState, getActorById, sprites } = helpers;
  const sheet = (sprites || []).find((s) => s.id === input.spriteSheetId);
  const animStates = (sheet && sheet.animStates) || [];
  const stateIndex = input.stateId
    ? 1 + animStates.findIndex((s) => s.id === input.stateId)
    : 0;
  if (!getActorById(input.actorId)) {
    playerSetAnimState(Math.max(0, stateIndex));
  } else {
    actorSetActive(input.actorId);
    actorSetAnimState(Math.max(0, stateIndex));
  }
};

module.exports = {
  id,
  groups,
  fields,
  compile,
};
