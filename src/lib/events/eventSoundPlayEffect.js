const l10n = require("../helpers/l10n").default;

const id = "EVENT_SOUND_PLAY_EFFECT";
const groups = ["EVENT_GROUP_MUSIC"];

const fields = [
  {
    key: "type",
    type: "soundEffect",
    defaultValue: "beep"
  },
  {
    key: "pitch",
    type: "number",
    label: l10n("FIELD_PITCH"),
    conditions: [
      {
        key: "type",
        eq: "beep"
      }
    ],
    min: 1,
    max: 8,
    step: 1,
    defaultValue: 4
  },
  {
    key: "frequency",
    type: "number",
    label: l10n("FIELD_FREQUENCY"),
    conditions: [
      {
        key: "type",
        eq: "tone"
      }
    ],
    min: 0,
    max: 20000,
    step: 1,
    defaultValue: 200
  },
  {
    key: "duration",
    type: "number",
    label: l10n("FIELD_DURATION"),
    min: 0,
    max: 4.25,
    step: 0.01,
    defaultValue: 0.5
  },
  // v4 follow-up: "custom" - a real per-project sound effect asset
  // (assets/sounds/*.wav), as opposed to the 3 built-in synthesized
  // waveforms above. soundEffectId reuses the exact pitch field shape
  // "beep" already has (0-7 GB pitch table, the only scale the engine's
  // BRR playback understands) rather than adding a new one.
  {
    key: "soundEffectId",
    type: "soundEffectAsset",
    conditions: [
      {
        key: "type",
        eq: "custom"
      }
    ],
    defaultValue: "LAST_SOUND_EFFECT"
  },
  {
    key: "customPitch",
    type: "number",
    label: l10n("FIELD_PITCH"),
    conditions: [
      {
        key: "type",
        eq: "custom"
      }
    ],
    min: 1,
    max: 8,
    step: 1,
    defaultValue: 4
  },
  {
    key: "wait",
    type: "checkbox",
    label: l10n("FIELD_WAIT_UNTIL_FINISHED"),
    defaultValue: true
  }
];

const compile = (input, helpers) => {
  const {
    soundPlayBeep,
    soundStartTone,
    soundPlayCrash,
    soundPlayCustomEffect,
    wait
  } = helpers;

  let seconds = typeof input.duration === "number" ? input.duration : 0.5;

  if (input.type === "beep" || !input.type) {
    const pitch = typeof input.pitch === "number" ? input.pitch : 4;
    soundPlayBeep(9 - pitch);
  } else if (input.type === "tone") {
    const freq = typeof input.frequency === "number" ? input.frequency : 200;
    let period = (2048 - 131072 / freq + 0.5) | 0;
    if (period >= 2048) {
      period = 2047;
    }
    if (period < 0) {
      period = 0;
    }
    const toneFrames = Math.min(255, Math.ceil(seconds * 60));
    soundStartTone(period, toneFrames);
  } else if (input.type === "crash") {
    soundPlayCrash();
  } else if (input.type === "custom") {
    const pitch = typeof input.customPitch === "number" ? input.customPitch : 4;
    soundPlayCustomEffect(input.soundEffectId, 9 - pitch);
  }

  // Convert seconds into frames (60fps)
  if(input.wait) {
    while (seconds > 0) {
      const time = Math.min(seconds, 1);
      wait(Math.ceil(60 * time));
      seconds -= time;
    }
  }

};

module.exports = {
  id,
  groups,
  fields,
  compile
};
