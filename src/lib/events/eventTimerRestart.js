const l10n = require("../helpers/l10n").default;

const id = "EVENT_TIMER_RESTART";

const fields = [
  {
    label: l10n("FIELD_TIMER_RESTART")
  },
  {
    key: "timer",
    type: "select",
    label: l10n("FIELD_TIMER"),
    options: [
      [0, "FIELD_TIMER_1"],
      [1, "FIELD_TIMER_2"],
      [2, "FIELD_TIMER_3"],
      [3, "FIELD_TIMER_4"]
    ],
    defaultValue: 0
  }
];

const compile = (input, helpers) => {
  const { timerRestart } = helpers;
  timerRestart(input.timer || 0);
};

module.exports = {
  id,
  fields,
  compile
};
