const l10n = require("../helpers/l10n").default;

const id = "EVENT_CLEAR_DATA";

const fields = [
  {
    label: l10n("FIELD_CLEAR_DATA")
  },
  {
    key: "saveSlot",
    label: l10n("FIELD_SAVE_SLOT"),
    type: "select",
    options: [
      [0, "FIELD_SAVE_SLOT_1"],
      [1, "FIELD_SAVE_SLOT_2"],
      [2, "FIELD_SAVE_SLOT_3"]
    ],
    defaultValue: 0
  }
];

const compile = (input, helpers) => {
  const { dataClear } = helpers;
  dataClear(input.saveSlot);
};

module.exports = {
  id,
  fields,
  compile
};
