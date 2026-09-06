import l10n from "../helpers/l10n";

export const id = "EVENT_CAMERA_MOVE_TO";

export const fields = [
  {
    key: "x",
    label: l10n("FIELD_X"),
    type: "number",
    min: 0,
    // Not scene/target-aware (this field definition has no access to either) -
    // the compiler clamps the real value to the actual scene bounds for the
    // project's target at compile time (scriptBuilder.js cameraMoveTo), so
    // this is just the hard byte-arg ceiling, not a precise per-scene limit.
    max: 255,
    width: "50%",
    defaultValue: 0
  },
  {
    key: "y",
    label: l10n("FIELD_Y"),
    type: "number",
    min: 0,
    max: 255,
    width: "50%",
    defaultValue: 0
  },
  {
    key: "speed",
    type: "cameraSpeed",
    defaultValue: "0"
  }
];

export const compile = (input, helpers) => {
  const { cameraMoveTo } = helpers;
  cameraMoveTo(input.x, input.y, input.speed);
};
