import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../store/configureStore";
import entitiesActions from "../../store/features/entities/entitiesActions";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import { SpriteSheetSelect } from "../forms/SpriteSheetSelect";
import { Input } from "../ui/form/Input";
import { FormRow, FormSectionTitle } from "../ui/form/FormLayout";
import { Button } from "../ui/buttons/Button";
import { PlusIcon, CloseIcon } from "../ui/icons/Icons";
import l10n from "../../lib/helpers/l10n";

interface SpriteStatesEditorProps {
  id: string;
}

// Phase 4 of the named animation states plan: the first-ever manual
// property editor for a sprite sheet (every asset entity up to now was
// 100% file-watch-driven). Deliberately minimal - a named pointer to
// another already-existing sheet, no tile-placement canvas (see
// entitiesTypes.ts SpriteState / eventActorSetState.js for the rest of
// the feature).
const SpriteStatesEditor: FC<SpriteStatesEditorProps> = ({ id }) => {
  const dispatch = useDispatch();
  const spriteSheet = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const states = spriteSheet?.states || [];

  if (!spriteSheet) {
    return null;
  }

  const onAdd = () => {
    dispatch(
      entitiesActions.addSpriteState({
        spriteSheetId: id,
        name: `${l10n("FIELD_STATE")} ${states.length + 1}`,
        targetSpriteSheetId: id,
      })
    );
  };

  const onEditName =
    (stateId: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      dispatch(
        entitiesActions.editSpriteState({
          spriteSheetId: id,
          stateId,
          changes: { name: e.currentTarget.value },
        })
      );
    };

  const onEditTarget = (stateId: string) => (targetSpriteSheetId: string) => {
    dispatch(
      entitiesActions.editSpriteState({
        spriteSheetId: id,
        stateId,
        changes: { spriteSheetId: targetSpriteSheetId },
      })
    );
  };

  const onRemove = (stateId: string) => () => {
    dispatch(
      entitiesActions.removeSpriteState({
        spriteSheetId: id,
        stateId,
      })
    );
  };

  return (
    <div>
      <FormSectionTitle>
        {l10n("FIELD_STATES")}
        <Button
          variant="transparent"
          size="small"
          onClick={onAdd}
          title={l10n("FIELD_ADD_STATE")}
        >
          <PlusIcon />
        </Button>
      </FormSectionTitle>
      {states.map((state) => (
        <FormRow key={state.id}>
          <Input
            value={state.name}
            onChange={onEditName(state.id)}
            placeholder={l10n("FIELD_STATE_NAME")}
          />
          <SpriteSheetSelect
            name={`spriteState-${state.id}-sheet`}
            value={state.spriteSheetId}
            onChange={onEditTarget(state.id)}
          />
          <Button
            variant="transparent"
            size="small"
            onClick={onRemove(state.id)}
            title={l10n("FIELD_REMOVE")}
          >
            <CloseIcon />
          </Button>
        </FormRow>
      ))}
    </div>
  );
};

export default SpriteStatesEditor;
