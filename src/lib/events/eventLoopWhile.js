const l10n = require("../helpers/l10n").default;

const id = "EVENT_LOOP_WHILE";
const groups = ["EVENT_GROUP_CONTROL_FLOW"];

const fields = [
  {
    key: "expression",
    label: l10n("FIELD_EXPRESSION"),
    type: "matharea",
    rows: 5,
    placeholder: "e.g. $health$ > 0...",
    defaultValue: "",
  },
  {
    key: "true",
    type: "events",
  },
];

const compile = (input, helpers) => {
  const { whileExpression } = helpers;
  whileExpression(input.expression || "0", input.true);
};

module.exports = {
  id,
  groups,
  fields,
  compile,
};
