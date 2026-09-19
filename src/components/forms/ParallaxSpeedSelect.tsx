import React, { FC, useEffect, useState } from "react";
import l10n from "../../lib/helpers/l10n";
import { Select } from "../ui/form/Select";

interface ParallaxSpeedSelectProps {
  name: string;
  value?: number;
  disabled?: boolean;
  onChange?: (newValue: number) => void;
}

interface ParallaxSpeedOption {
  value: number;
  label: string;
}

// value is the real signed shift byte compileSnesData.js/parallax.c use
// directly (scroll_x >> value when positive, scroll_x << -value when
// negative, unlike GB Studio 3.x's own picker (which only ever offers 0 or a
// positive shift) SNES's HDMA parallax already supports - and this session's
// M6 already shipped/tested - a faster-than-camera foreground band too, so
// that's kept here as well rather than silently dropped to match B's list.
// No "Fixed Position" option: B's picker offers one (a shift sentinel its GB
// engine special-cases to "never scroll"), but this engine's parallax.c has
// no equivalent runtime support for it yet - omitted rather than offering a
// choice that would silently do the wrong thing.
const options: ParallaxSpeedOption[] = [
  { value: -2, label: `${l10n("FIELD_SPEED")} 4x` },
  { value: -1, label: `${l10n("FIELD_SPEED")} 2x` },
  { value: 0, label: `${l10n("FIELD_SPEED")} 1` },
  { value: 1, label: `${l10n("FIELD_SPEED")} ½` },
  { value: 2, label: `${l10n("FIELD_SPEED")} ¼` },
  { value: 3, label: `${l10n("FIELD_SPEED")} ⅛` },
  { value: 4, label: `${l10n("FIELD_SPEED")} ¹⁄₁₆` },
  { value: 5, label: `${l10n("FIELD_SPEED")} ¹⁄₃₂` },
  { value: 6, label: `${l10n("FIELD_SPEED")} ¹⁄₆₄` },
];

export const ParallaxSpeedSelect: FC<ParallaxSpeedSelectProps> = ({
  name,
  value = 1,
  disabled,
  onChange,
}) => {
  const [currentValue, setCurrentValue] =
    useState<ParallaxSpeedOption | undefined>();

  useEffect(() => {
    const current = options.find((o) => o.value === value);
    setCurrentValue(current);
  }, [value]);

  return (
    <Select
      name={name}
      value={currentValue}
      options={options}
      isDisabled={disabled}
      onChange={(newValue: ParallaxSpeedOption) => {
        onChange?.(newValue.value);
      }}
    />
  );
};
