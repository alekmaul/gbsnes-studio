
const id = "EVENT_ACTOR_SET_DIRECTION_TO_VALUE";
const groups = ["EVENT_GROUP_ACTOR"];

const fields = [
  {
    key: "actorId",
    type: "actor",
    defaultValue: "$self$",
  },
  {
    key: "variable",
    type: "variable",
    defaultValue: "LAST_VARIABLE",
  },
];

const compile = (input, helpers) => {
  const { actorSetActive, ifVariableValue } = helpers;

  actorSetActive(input.actorId);

  ifVariableValue(
    input.variable,
    "==",
    1,
    () => {
      changeDirection("down", input, helpers);
    },
    () => {
      ifVariableValue(
        input.variable,
        "==",
        2,
        () => {
          changeDirection("left", input, helpers);
        },
        () => {
          ifVariableValue(
            input.variable,
            "==",
            4,
            () => {
              changeDirection("right", input, helpers);
            },
            () => {
              changeDirection("up", input, helpers);
            }
          );
        }
      );
    }
  );
};

function changeDirection(direction, input, helpers) {
  const { actorSetDirection } = helpers;

  actorSetDirection(direction);
}

module.exports = {
  id,
  groups,
  fields,
  compile
};
