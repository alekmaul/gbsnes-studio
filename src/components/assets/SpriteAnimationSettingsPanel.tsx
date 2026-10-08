import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../store/configureStore";
import entitiesActions from "../../store/features/entities/entitiesActions";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import { SpriteSheetSelect } from "../forms/SpriteSheetSelect";
import { AnimationSpeedSelect } from "../forms/AnimationSpeedSelect";
import { Select } from "../ui/form/Select";
import { Input } from "../ui/form/Input";
import { FormField, FormRow, FormSectionTitle } from "../ui/form/FormLayout";
import { Button } from "../ui/buttons/Button";
import { CloseIcon } from "../ui/icons/Icons";
import l10n from "../../lib/helpers/l10n";

interface SpriteTypeOverrideOption {
  value?: "static";
  label: string;
}

interface SpriteAnimationSettingsPanelProps {
  id: string; // the sheet currently open on the Sprites page
  stateId?: string; // undefined = the implicit "Default" state
  onRemoved: () => void;
}

// v4 follow-up (user-found, pointed at the real source: NavigatorSprites.tsx/
// helpers.ts/AnimationTypeSelect.tsx in the gb-studio-3.2.1 reference, not
// re-derived from memory). B's real "Animation Type" (SpriteAnimationType:
// fixed/fixed_movement/multi/multi_movement/platform_player/cursor) is a
// *filter* over a fixed 8-slot animation array every state always has
// (helpers.ts filterAnimationsBySpriteType) - "fixed" shows just the one
// "Idle" slot (1 metasprite, which can itself hold many auto-cycling
// frames - this is how B's "Static" 1-frame and "Animated" 2-25-frame
// sprite TYPES both end up as the exact same "fixed" animationType,
// differing only in how many frames that one Idle slot's own SpriteAnimation
// holds); "multi"/"multi_movement" show the directional slots. This fork's
// own SpriteType (static/animated/actor/actor_animated) maps onto exactly
// those same 3 real B categories - static & animated are both "fixed"
// (non-directional, 1 or N auto-cycling frames); actor is "multi" with
// flipLeft (3 authored directions, left auto-flipped from right - exactly
// matching this engine's own existing render convention); actor_animated is
// "multi_movement" with flipLeft (idle+walk pose per direction). No
// "platform_player"/"cursor" equivalent exists on this engine (no
// Platformer-genre jump/climb sprite poses, no point-and-click cursor
// sprite concept).
const TYPE_LABELS: Record<string, string> = {
  static: l10n("FIELD_FIXED_DIRECTION"),
  animated: l10n("FIELD_FIXED_DIRECTION"),
  actor: l10n("FIELD_MULTI_DIRECTION"),
  actor_animated: l10n("FIELD_MULTI_DIRECTION_MOVEMENT"),
};

// Matches GB Studio 3.2.1's real "ANIMATION SETTINGS" panel, scoped to
// whichever node is selected in SpriteAnimationsPanel's tree (the sibling
// component this replaces SpriteStatesEditor.tsx's old always-flat state
// list with - this panel now shows settings for ONE state at a time,
// instead of every state's row all at once).
//
// v4 follow-up (user-found: "animation type is not usable" - a plain
// read-only label, unlike Animation Speed right below it). B's own Animation
// Type dropdown only has real effect because each state's 8 animation slots
// are independently authored metasprites there (arbitrary tile
// composition) - this engine has no metasprite canvas, so a sheet's
// physical PNG layout is still its one fixed set of poses. But a real,
// already-wired lever *does* exist here: helpers.js's spriteTypeDec() can
// force a 3- or 6-frame ("actor"/"actor_animated") sheet to the flat/
// non-directional interpretation instead of its natural directional one
// (frames_len_for/actor_render_tile, scene.c) - already exposed per-ACTOR
// (ActorEditor.tsx's own Sprite Type field) but never as a sheet-level
// default. SpriteSheet.defaultSpriteType (entitiesTypes.ts) is that default,
// applied wherever the shared per-slot table is built (compileSnesData.js's
// buildSceneSprites) - the player's own scene-init equip, and any runtime
// Set Sprite Sheet/Set Sprite State swap. The existing per-actor override is
// completely untouched and still wins for that one actor, same as today.
// For every other frame count there's genuinely only one valid
// interpretation (spriteTypeDec only special-cases 3 and 6), so the control
// stays a plain read-only label there rather than offering a choice with no
// real effect.
//
// Default Animation Speed (SpriteSheet.animSpeed) edits whichever sheet is
// actually in effect - this sheet itself for Default, or the state's own
// target sheet for a named state - since a state is a pointer to a
// *different* sheet's own real animSpeed field, not a duplicate one. The
// new Animation Type control follows the identical pattern.
const SpriteAnimationSettingsPanel: FC<SpriteAnimationSettingsPanelProps> = ({
  id,
  stateId,
  onRemoved,
}) => {
  const dispatch = useDispatch();
  const file = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const spriteState = file?.states?.find((s) => s.id === stateId);
  const targetSheet = useSelector((state: RootState) =>
    spriteState
      ? spriteSheetSelectors.selectById(state, spriteState.spriteSheetId)
      : file
  );

  if (!file) {
    return null;
  }

  const onEditName = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!spriteState) {
      return;
    }
    dispatch(
      entitiesActions.editSpriteState({
        spriteSheetId: id,
        stateId: spriteState.id,
        changes: { name: e.currentTarget.value },
      })
    );
  };

  const onEditTarget = (targetSpriteSheetId: string) => {
    if (!spriteState) {
      return;
    }
    dispatch(
      entitiesActions.editSpriteState({
        spriteSheetId: id,
        stateId: spriteState.id,
        changes: { spriteSheetId: targetSpriteSheetId },
      })
    );
  };

  const onEditAnimSpeed = (animSpeed: number | null) => {
    if (!targetSheet) {
      return;
    }
    dispatch(
      entitiesActions.editSpriteSheet({
        spriteSheetId: targetSheet.id,
        changes: { animSpeed },
      })
    );
  };

  const onEditDefaultSpriteType = (defaultSpriteType?: "static") => {
    if (!targetSheet) {
      return;
    }
    dispatch(
      entitiesActions.editSpriteSheet({
        spriteSheetId: targetSheet.id,
        changes: { defaultSpriteType },
      })
    );
  };

  const onRemove = () => {
    if (!spriteState) {
      return;
    }
    dispatch(
      entitiesActions.removeSpriteState({
        spriteSheetId: id,
        stateId: spriteState.id,
      })
    );
    onRemoved();
  };

  // Only "actor" (3 frames) and "actor_animated" (6 frames) have a second,
  // genuinely different interpretation spriteTypeDec can select between -
  // every other frame count is always static regardless, so there's nothing
  // real to offer a choice over there.
  const showSpriteTypeOverride =
    targetSheet &&
    (targetSheet.type === "actor" || targetSheet.type === "actor_animated");
  const spriteTypeOptions: SpriteTypeOverrideOption[] = targetSheet
    ? [
        { value: undefined, label: TYPE_LABELS[targetSheet.type] },
        { value: "static", label: l10n("FIELD_FIXED_DIRECTION") },
      ]
    : [];
  const currentSpriteTypeOption =
    spriteTypeOptions.find((o) => o.value === targetSheet?.defaultSpriteType) ||
    spriteTypeOptions[0];

  return (
    <div className="SpriteAnimationSettingsPanel">
      <FormSectionTitle>{l10n("FIELD_ANIMATION_SETTINGS")}</FormSectionTitle>
      {spriteState && (
        <>
          <FormRow>
            <Input
              value={spriteState.name}
              onChange={onEditName}
              placeholder={l10n("FIELD_STATE_NAME")}
            />
            <Button
              variant="transparent"
              size="small"
              onClick={onRemove}
              title={l10n("FIELD_REMOVE")}
            >
              <CloseIcon />
            </Button>
          </FormRow>
          <FormField
            name="stateTargetSheet"
            label={l10n("FIELD_STATE_TARGET_SPRITE_SHEET")}
          >
            <SpriteSheetSelect
              name="stateTargetSheet"
              value={spriteState.spriteSheetId}
              onChange={onEditTarget}
            />
          </FormField>
        </>
      )}
      <FormField name="animationType" label={l10n("FIELD_ANIMATION_TYPE")}>
        {showSpriteTypeOverride ? (
          <Select
            name="animationType"
            value={currentSpriteTypeOption}
            options={spriteTypeOptions}
            onChange={(newValue: SpriteTypeOverrideOption) =>
              onEditDefaultSpriteType(newValue.value)
            }
          />
        ) : (
          <div className="SpriteAnimationSettingsPanel__TypeLabel">
            {targetSheet ? TYPE_LABELS[targetSheet.type] : ""}
          </div>
        )}
      </FormField>
      <FormField name="spriteAnimSpeed" label={l10n("FIELD_ANIMATION_SPEED")}>
        <AnimationSpeedSelect
          name="spriteAnimSpeed"
          value={targetSheet?.animSpeed ?? null}
          onChange={onEditAnimSpeed}
        />
      </FormField>
    </div>
  );
};

export default SpriteAnimationSettingsPanel;
