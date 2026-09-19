const id = "EVENT_ACTOR_DEACTIVATE";
const groups = ["EVENT_GROUP_ACTOR"];

const fields = [
  {
    key: "actorId",
    type: "actor",
    defaultValue: "$self$"
  }
];

const compile = (input, helpers) => {
  const { actorSetActive, actorDeactivate } = helpers;
  actorSetActive(input.actorId);
  actorDeactivate();
};

module.exports = {
  id,
  groups,
  fields,
  compile
};
