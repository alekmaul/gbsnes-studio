import React, { FC } from "react";
import l10n from "../../lib/helpers/l10n";
import { SpriteAnimationType } from "../../store/features/entities/entitiesTypes";
import { Select } from "../ui/form/Select";

// Only the 3 real values this engine renders (see SPRITE_EDITOR_PROGRESS.md) -
// a deliberate subset of GB Studio's own 6 animationType values. "fixed" ->
// SPRITE_STATIC, "multi" -> SPRITE_ACTOR, "multi_movement" ->
// SPRITE_ACTOR_ANIMATED (snesgfx.js's imageToSpriteData animationTypeOverride).
// M9's free-form metasprite mode is a SEPARATE flag (SpriteSheet.metaspriteMode)
// layered on top of whichever of these 3 shapes is chosen here, not a 4th
// value of this select - see entitiesTypes.ts's own comment.

interface AnimationTypeSelectProps {
  name: string;
  value?: SpriteAnimationType;
  onChange?: (newValue?: SpriteAnimationType) => void;
}

interface AnimationTypeOption {
  value: SpriteAnimationType | "";
  label: string;
}

// "" means no override - today's pure auto-detect behaviour, unchanged.
const options: AnimationTypeOption[] = [
  { value: "", label: l10n("FIELD_ANIMATION_TYPE_AUTO") },
  { value: "fixed", label: l10n("FIELD_ANIMATION_TYPE_FIXED") },
  { value: "multi", label: l10n("FIELD_ANIMATION_TYPE_MULTI") },
  { value: "multi_movement", label: l10n("FIELD_ANIMATION_TYPE_MULTI_MOVEMENT") },
];

export const AnimationTypeSelect: FC<AnimationTypeSelectProps> = ({
  name,
  value,
  onChange,
}) => {
  const currentValue = options.find((o) => o.value === value) || options[0];
  return (
    <Select
      name={name}
      value={currentValue}
      options={options}
      onChange={(newValue: AnimationTypeOption) => {
        onChange?.(newValue.value || undefined);
      }}
    />
  );
};
