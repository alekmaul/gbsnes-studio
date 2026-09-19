const id = "EVENT_ACTOR_START_UPDATE";
const groups = ["EVENT_GROUP_ACTOR"];

const fields = [
  {
    key: "actorId",
    type: "actor",
    defaultValue: "$self$"
  }
];

const compile = (input, helpers) => {
  const { actorSetActive, actorStartUpdate } = helpers;
  actorSetActive(input.actorId);
  actorStartUpdate();
};

module.exports = {
  id,
  groups,
  fields,
  compile
};
