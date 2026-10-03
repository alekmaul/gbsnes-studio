import React, { FC } from "react";
import l10n from "../../lib/helpers/l10n";
import { Select } from "../ui/form/Select";

interface MovementSpeedSelectProps {
  name: string;
  value?: number;
  onChange?: (newValue: number) => void;
}

interface MovementSpeedOption {
  value: number;
  label: string;
}

const options: MovementSpeedOption[] = [
  { value: 0, label: `${l10n("FIELD_SPEED")} ½ (${l10n("FIELD_SLOWER")})` },
  { value: 1, label: `${l10n("FIELD_SPEED")} 1` },
  { value: 2, label: `${l10n("FIELD_SPEED")} 2` },
  { value: 3, label: `${l10n("FIELD_SPEED")} 3` },
  { value: 4, label: `${l10n("FIELD_SPEED")} 4 ${l10n("FIELD_FASTER")}` },
];

// Real pixels-per-frame each speed index compiles to (moveSpeedDec's own
// MOVEMENT_SPEED_LOOKUP, src/lib/compiler/helpers.js: [0, 1, 2, 4, 8]) -
// shown in the dropdown like GB Studio 3.2.x's own Speed picker does for its
// (different) values, since this fork's own "Speed 3"/"Speed 4" labels don't
// match their real px/frame at all (4 and 8, not 3 and 4 - the labels are
// just tier names). Index 0 is a special case: the engine's move_speed==0
// doesn't mean "stationary", it means "advance 1px every other frame"
// (scene.c's SceneUpdateActors, `if ((time & 1) == 0) { x += dir_x; ... }`),
// i.e. an averaged 0.5 px/frame - shown as 0.5 here to match what the actor
// actually does, not the raw 0 byte moveSpeedDec emits for it.
const PIXELS_PER_FRAME = [0.5, 1, 2, 4, 8];

export const MovementSpeedSelect: FC<MovementSpeedSelectProps> = ({
  name,
  value = 1,
  onChange,
}) => {
  const currentValue = options.find((o) => o.value === value);
  return (
    <Select
      name={name}
      value={currentValue}
      options={options}
      formatOptionLabel={(
        option: MovementSpeedOption,
        { context }: { context: "menu" | "value" }
      ) =>
        context === "menu"
          ? `${option.label} (${PIXELS_PER_FRAME[option.value]} ${l10n(
              "FIELD_PIXELS_PER_FRAME_SHORT"
            )})`
          : option.label
      }
      onChange={(newValue: MovementSpeedOption) => {
        onChange?.(newValue.value);
      }}
    />
  );
};
