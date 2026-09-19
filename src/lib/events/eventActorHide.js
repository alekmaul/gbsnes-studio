const id = "EVENT_ACTOR_HIDE";
const groups = ["EVENT_GROUP_ACTOR"];

const fields = [
  {
    key: "actorId",
    type: "actor",
    defaultValue: "$self$"
  }
];

const compile = (input, helpers) => {
  const { actorSetActive, actorHide } = helpers;
  actorSetActive(input.actorId);
  actorHide();
};

module.exports = {
  id,
  groups,
  fields,
  compile
};
