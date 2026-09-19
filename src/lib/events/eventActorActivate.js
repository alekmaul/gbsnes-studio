const id = "EVENT_ACTOR_ACTIVATE";

const fields = [
  {
    key: "actorId",
    type: "actor",
    defaultValue: "$self$"
  }
];

const compile = (input, helpers) => {
  const { actorSetActive, actorActivate } = helpers;
  actorSetActive(input.actorId);
  actorActivate();
};

module.exports = {
  id,
  fields,
  compile
};
