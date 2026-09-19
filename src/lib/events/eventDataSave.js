const l10n = require("../helpers/l10n").default;

const id = "EVENT_SAVE_DATA";

const fields = [
  {
    label: l10n("FIELD_SAVE_DATA")
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
  },
  {
    key: "true",
    label: l10n("FIELD_ON_SAVE"),
    type: "events"
  }
];

const compile = (input, helpers) => {
  const { dataSave } = helpers;
  dataSave(input.saveSlot, input.true);
};

module.exports = {
  id,
  fields,
  compile
};
