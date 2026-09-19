const id = "EVENT_ACTOR_DEACTIVATE";

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
  fields,
  compile
};
