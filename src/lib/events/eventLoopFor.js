const l10n = require("../helpers/l10n").default;

const id = "EVENT_LOOP_FOR";
const groups = ["EVENT_GROUP_CONTROL_FLOW"];

const fields = [
  {
    key: "variable",
    label: l10n("FIELD_FOR"),
    type: "variable",
    defaultValue: "LAST_VARIABLE",
  },
  {
    key: "from",
    label: l10n("FIELD_FROM"),
    type: "union",
    types: ["number", "variable"],
    defaultType: "number",
    min: 0,
    max: 255,
    defaultValue: {
      number: 0,
      variable: "LAST_VARIABLE",
    },
    width: "50%",
  },
  {
    key: "comparison",
    label: l10n("FIELD_COMPARISON"),
    type: "operator",
    defaultValue: "<=",
    width: "50%",
  },
  {
    key: "to",
    label: l10n("FIELD_TO"),
    type: "union",
    types: ["number", "variable"],
    defaultType: "number",
    min: 0,
    max: 255,
    defaultValue: {
      number: 10,
      variable: "LAST_VARIABLE",
    },
    width: "50%",
  },
  {
    key: "operation",
    label: l10n("FIELD_OPERATION"),
    type: "select",
    options: [
      ["add", l10n("FIELD_ADD_VALUE")],
      ["sub", l10n("FIELD_SUB_VALUE")],
      ["mul", l10n("FIELD_MUL_VARIABLE")],
      ["div", l10n("FIELD_DIV_VARIABLE")],
      ["mod", l10n("FIELD_MOD_VARIABLE")],
    ],
    defaultValue: "add",
    width: "50%",
  },
  {
    key: "value",
    label: l10n("FIELD_VALUE"),
    type: "union",
    types: ["number", "variable"],
    defaultType: "number",
    min: 0,
    max: 255,
    defaultValue: {
      number: 1,
      variable: "LAST_VARIABLE",
    },
    width: "50%",
  },
  {
    key: "true",
    type: "events",
  },
];

const compile = (input, helpers) => {
  const {
    labelDefine,
    labelGoto,
    compileEvents,
    ifVariableValue,
    ifVariableCompare,
    variableSetToUnionValue,
    variableFromUnion,
    variablesAdd,
    variablesSub,
    variablesMul,
    variablesDiv,
    variablesMod,
    temporaryEntityVariable,
    event,
  } = helpers;

  const loopId = `loop_for_${event.id}`;

  variableSetToUnionValue(input.variable, input.from);

  labelDefine(loopId);

  const runBody = () => {
    compileEvents(input.true);

    const operand = variableFromUnion(input.value, temporaryEntityVariable(0));
    switch (input.operation) {
      case "sub":
        variablesSub(input.variable, operand);
        break;
      case "mul":
        variablesMul(input.variable, operand);
        break;
      case "div":
        variablesDiv(input.variable, operand);
        break;
      case "mod":
        variablesMod(input.variable, operand);
        break;
      case "add":
      default:
        variablesAdd(input.variable, operand);
        break;
    }

    labelGoto(loopId);
  };

  if (input.to.type === "number") {
    ifVariableValue(input.variable, input.comparison, input.to.value, runBody, []);
  } else {
    ifVariableCompare(input.variable, input.comparison, input.to.value, runBody, []);
  }
};

module.exports = {
  id,
  groups,
  fields,
  compile,
};
