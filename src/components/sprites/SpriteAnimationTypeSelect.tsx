import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import cx from "classnames";
import { RootState } from "../../store/configureStore";
import entitiesActions from "../../store/features/entities/entitiesActions";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import { SpriteAnimationType } from "../../store/features/entities/entitiesTypes";
import { Select } from "../ui/form/Select";
import { FormField, FormSectionTitle } from "../ui/form/FormLayout";
import l10n from "../../lib/helpers/l10n";

interface SpriteAnimationTypeSelectProps {
  spriteSheetId: string;
  animationStateId: string;
  selectedSubStateId?: string;
  onSelectSubState: (subStateId: string) => void;
}

interface AnimationTypeOption {
  value: SpriteAnimationType;
  label: string;
}

const ANIMATION_TYPE_OPTIONS: AnimationTypeOption[] = [
  { value: "fixed", label: l10n("FIELD_SPRITE_ANIM_TYPE_FIXED") },
  { value: "two_directions", label: l10n("FIELD_SPRITE_ANIM_TYPE_TWO_DIRECTIONS") },
  { value: "four_directions", label: l10n("FIELD_SPRITE_ANIM_TYPE_FOUR_DIRECTIONS") },
];

// A sub-state's `key` (idle_down, moving_up, ...) is the stored, canonical
// name (SUB_STATES_BY_ANIMATION_TYPE, entitiesState.ts) - this just turns it
// into the human label GB Studio's own navigator shows ("Idle Down",
// "Moving Up"), matching the user's own two examples exactly.
const formatSubStateLabel = (key: string): string =>
  key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

// Side panel: pick the active AnimationState's AnimationType (fixed/
// two_directions/four_directions), and select which of the sub-states that
// type implies (SUB_STATES_BY_ANIMATION_TYPE) is being edited. Changing the
// type dispatches setSpriteAnimationStateType, which regenerates the real
// sub-state list - a sub-state whose key survives the change keeps its real
// frames/tiles, see that reducer's own comment (entitiesState.ts) for why
// this is safe to call directly from a plain Select onChange with no extra
// confirmation step.
export const SpriteAnimationTypeSelect: FC<SpriteAnimationTypeSelectProps> = ({
  spriteSheetId,
  animationStateId,
  selectedSubStateId,
  onSelectSubState,
}) => {
  const dispatch = useDispatch();
  const spriteSheet = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, spriteSheetId)
  );
  const animationState = spriteSheet?.animationStates?.find(
    (a) => a.id === animationStateId
  );

  if (!animationState) {
    return null;
  }

  const currentOption = ANIMATION_TYPE_OPTIONS.find(
    (option) => option.value === animationState.animationType
  );

  const onChangeType = (option: AnimationTypeOption) => {
    dispatch(
      entitiesActions.setSpriteAnimationStateType({
        spriteSheetId,
        animationStateId,
        animationType: option.value,
      })
    );
  };

  return (
    <div className="SpriteAnimationTypeSelect">
      <FormSectionTitle>{l10n("FIELD_ANIMATION_TYPE")}</FormSectionTitle>
      <FormField name="spriteAnimationType" label={l10n("FIELD_ANIMATION_TYPE")}>
        <Select
          name="spriteAnimationType"
          value={currentOption}
          options={ANIMATION_TYPE_OPTIONS}
          onChange={onChangeType}
        />
      </FormField>
      <div className="SpriteAnimationTypeSelect__SubStates">
        {animationState.subStates.map((subState) => (
          <button
            key={subState.id}
            type="button"
            className={cx("SpriteAnimationTypeSelect__SubState", {
              "SpriteAnimationTypeSelect__SubState--Active":
                subState.id === selectedSubStateId,
            })}
            onClick={() => onSelectSubState(subState.id)}
          >
            {formatSubStateLabel(subState.key)}
          </button>
        ))}
      </div>
    </div>
  );
};
