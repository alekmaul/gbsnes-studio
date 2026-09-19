const l10n = require("../helpers/l10n").default;

const id = "EVENT_SET_TIMER_SCRIPT";

const fields = [
  {
    label: l10n("FIELD_SET_TIMER")
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
  },
  {
    key: "duration",
    type: "number",
    label: l10n("FIELD_TIMER_DURATION"),
    min: 0.25,
    max: 60,
    step: 0.25,
    defaultValue: 10.0
  },
  {
    key: "__scriptTabs",
    type: "tabs",
    defaultValue: "end",
    values: {
      end: l10n("FIELD_ON_TIMER_END"),
    }
  },
  {
    key: "script",
    type: "events",
    conditions: [
      {
        key: "__scriptTabs",
        in: [undefined, "end"]
      }
    ]
  }
];

const compile = (input, helpers) => {
  const { timerScriptSet } = helpers;
  let duration = (typeof input.duration === "number") ? input.duration : 10.0;
  timerScriptSet(duration, input.script, input.timer || 0);
};

module.exports = {
  id,
  fields,
  compile
};
