const l10n = require("../helpers/l10n").default;

const id = "EVENT_IF_CURRENT_SCENE_IS";

const fields = [
  {
    key: "sceneId",
    label: l10n("SCENE"),
    type: "scene",
    defaultValue: "LAST_SCENE",
  },
  {
    key: "true",
    label: l10n("FIELD_TRUE"),
    type: "events",
  },
  {
    key: "__collapseElse",
    label: l10n("FIELD_ELSE"),
    type: "collapsable",
    defaultValue: false,
    conditions: [
      {
        key: "__disableElse",
        ne: true,
      },
    ],
  },
  {
    key: "false",
    conditions: [
      {
        key: "__collapseElse",
        ne: true,
      },
      {
        key: "__disableElse",
        ne: true,
      },
    ],
    type: "events",
  },
];

const compile = (input, helpers) => {
  const { ifCurrentSceneIs } = helpers;
  const truePath = input.true;
  const falsePath = input.__disableElse ? [] : input.false;
  ifCurrentSceneIs(input.sceneId, truePath, falsePath);
};

module.exports = {
  id,
  fields,
  compile,
};
