
const id = "EVENT_ACTOR_SET_DIRECTION";
const groups = ["EVENT_GROUP_ACTOR"];

const fields = [
  {
    key: "actorId",
    type: "actor",
    defaultValue: "$self$"
  },
  {
    key: "direction",
    type: "union",
    types: ["direction", "variable", "property"],
    defaultType: "direction",    
    defaultValue: {
      direction: "up",
      variable: "LAST_VARIABLE",
      property: "$self$:direction"
    },    
  },
];

const compile = (input, helpers) => {
  const {
    actorSetActive,
    ifVariableValue,
    variableFromUnion,
    temporaryEntityVariable
  } = helpers;

  actorSetActive(input.actorId);

  if(input.direction.type === "direction") {
    changeDirection(input.direction.value, input, helpers)
  } else if(typeof input.direction === "string") {
    changeDirection(input.direction, input, helpers)    
  } else {
    const dirVar = variableFromUnion(input.direction, temporaryEntityVariable(0));
    ifVariableValue(
      dirVar,
      "==",
      1,
      () => {
        changeDirection("down", input, helpers);
      },
      () => {
        ifVariableValue(
          dirVar,
          "==",
          2,
          () => {
            changeDirection("left", input, helpers);
          },
          () => {
            ifVariableValue(
              dirVar,
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
  }
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
