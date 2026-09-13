const trimlines = require("../helpers/trimlines").default;
const l10n = require("../helpers/l10n").default;
const { getTarget } = require("../compiler/targets");

const id = "EVENT_TEXT";

// Editor pre-wrap width for this target/avatar combo - mirrors the real
// engine's own runtime word-wrap (GB's UI window / SNES's ui.c TXT_COLS),
// see targets/{gb,snes}.js. `target` is threaded down from Redux
// (settings.target) via ScriptEventFormInput/ScriptEditorEvent (M9) -
// undefined falls back to "gb" (getTarget's own default), so this is a
// no-op for every existing GB project/test.
const wrapLimits = (target, hasAvatar) => {
  const t = getTarget(target);
  return {
    maxPerLine: hasAvatar ? t.maxTextLineCharsWithAvatar : t.maxTextLineChars,
    maxTotal: hasAvatar ? t.maxTextTotalCharsWithAvatar : t.maxTextTotalChars
  };
};

const fields = [
  {
    key: "text",
    type: "textarea",
    placeholder: l10n("FIELD_TEXT_PLACEHOLDER"),
    updateFn: (string, field, args, target) => {
      const { maxPerLine, maxTotal } = wrapLimits(target, !!args.avatarId);
      return trimlines(string, maxPerLine, 4, maxTotal);
    },
    multiple: true,
    defaultValue: ""
  },
  {
    key: "avatarId",
    type: "sprite",
    toggleLabel: l10n("FIELD_ADD_TEXT_AVATAR"),
    label: l10n("FIELD_TEXT_AVATAR"),
    defaultValue: "",
    optional: true,
    filter: sprite => sprite.numFrames === 1,
    postUpdate: (args, prevArgs, target) => {
      const { maxPerLine, maxTotal } = wrapLimits(target, !!args.avatarId);
      return {
        ...args,
        text: Array.isArray(args.text)
          ? args.text.map(string => trimlines(string, maxPerLine, 4, maxTotal))
          : trimlines(args.text, maxPerLine, 4, maxTotal)
      };
    }
  }
];

const compile = (input, helpers) => {
  const {
    textDialogue,
    textSetOpenInstant,
    textSetCloseInstant,
    textRestoreOpenSpeed,
    textRestoreCloseSpeed
  } = helpers;
  if (Array.isArray(input.text)) {
    // Handle multiple blocks of text
    for (let j = 0; j < input.text.length; j++) {
      const rowText = input.text[j];

      // Before first box, make close instant
      if (j === 0) {
        textSetCloseInstant();
      }
      // Before last box, restore close speed
      if (j === input.text.length - 1) {
        textRestoreCloseSpeed();
      }

      textDialogue(rowText || " ", input.avatarId);

      // After first box, make open instant
      if (j === 0) {
        textSetOpenInstant();
      }
      // After last box, restore open speed
      if (j === input.text.length - 1) {
        textRestoreOpenSpeed();
      }
    }
  } else {
    textDialogue(input.text || " ", input.avatarId);
  }
};

module.exports = {
  id,
  fields,
  compile
};
