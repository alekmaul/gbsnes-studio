import trimlines from "../helpers/trimlines";
import l10n from "../helpers/l10n";
import { getTarget } from "../compiler/targets";

export const id = "EVENT_TEXT";

// How many characters the dialogue box's editor pre-wrap fits on one line -
// per target (the SNES box is much wider than the GB's), with/without the
// avatar portrait eating into it. `target` is threaded in at runtime by
// ScriptEditor.js / ScriptEventBlock.js (Redux `settings.target`) - a static
// field definition has no project context, but updateFn/postUpdate are plain
// functions invoked fresh each edit, so they can take it as an extra arg.
const maxPerLineFor = (target, hasAvatar) => {
  const t = getTarget(target);
  return hasAvatar ? t.maxTextLineCharsWithAvatar : t.maxTextLineChars;
};

export const fields = [
  {
    key: "text",
    type: "textarea",
    placeholder: l10n("FIELD_TEXT_PLACEHOLDER"),
    updateFn: (string, field, args, target) => {
      const maxPerLine = maxPerLineFor(target, args.avatarId);
      return trimlines(string, maxPerLine);
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
    postUpdate: (args, target) => {
      const maxPerLine = maxPerLineFor(target, args.avatarId);
      return {
        ...args,
        text: Array.isArray(args.text)
          ? args.text.map(string => trimlines(string, maxPerLine))
          : trimlines(args.text, maxPerLine)
      };
    }
  }
];

export const compile = (input, helpers) => {
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
