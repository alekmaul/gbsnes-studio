const l10n = require("../helpers/l10n").default;

const id = "EVENT_CLEAR_FLAGS";
const groups = ["EVENT_GROUP_VARIABLES"];

const fields = [
  {
    key: "variable",
    type: "variable",
    defaultValue: "LAST_VARIABLE"
  },
  {
    key: "flag1",
    label: l10n("FIELD_FLAG_1"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag2",
    label: l10n("FIELD_FLAG_2"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag3",
    label: l10n("FIELD_FLAG_3"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag4",
    label: l10n("FIELD_FLAG_4"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag5",
    label: l10n("FIELD_FLAG_5"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag6",
    label: l10n("FIELD_FLAG_6"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag7",
    label: l10n("FIELD_FLAG_7"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag8",
    label: l10n("FIELD_FLAG_8"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag9",
    label: l10n("FIELD_FLAG_9"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag10",
    label: l10n("FIELD_FLAG_10"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag11",
    label: l10n("FIELD_FLAG_11"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag12",
    label: l10n("FIELD_FLAG_12"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag13",
    label: l10n("FIELD_FLAG_13"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag14",
    label: l10n("FIELD_FLAG_14"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag15",
    label: l10n("FIELD_FLAG_15"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
  {
    key: "flag16",
    label: l10n("FIELD_FLAG_16"),
    type: "checkbox",
    width: "50%",
    defaultValue: false
  },
];

const compile = (input, helpers) => {
  const { variableClearFlags } = helpers;
  let flag = 0;
  for (let i = 1; i <= 16; i++) {
    if (input[`flag${i}`]) flag += 2 ** (i - 1);
  }
  variableClearFlags(input.variable, flag);
};

module.exports = {
  id,
  groups,
  fields,
  compile
};
