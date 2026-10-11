import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import entitiesActions from "../../store/features/entities/entitiesActions";
import castEventValue from "../../lib/helpers/castEventValue";
import { Sidebar, SidebarColumn } from "../ui/sidebars/Sidebar";
import {
  FormContainer,
  FormHeader,
  FormRow,
  FormField,
  FormDivider,
  FormSectionTitle,
} from "../ui/form/FormLayout";
import { EditableText } from "../ui/form/EditableText";
import { CoordinateInput } from "../ui/form/CoordinateInput";
import { AnimationTypeSelect } from "../forms/AnimationTypeSelect";
import { SpriteSheetSelectButton } from "../forms/SpriteSheetSelectButton";
import { SpriteAnimationType } from "../../store/features/entities/entitiesTypes";
import l10n from "../../lib/helpers/l10n";

// Right sidebar - field order mirrors GB Studio 3.0.3's own SpriteEditor.tsx
// exactly (name -> Canvas Size -> divider -> Collision Bounding Box ->
// Animation Settings -> Animation Type -> selected state), scoped per
// SPRITE_EDITOR_PROGRESS.md: Canvas Size is fixed/read-only, Collision
// Bounding Box is stored but inert, Animation Type only offers the 3 real
// values, and "selected state" is this fork's own whole-sheet-swap feature.

interface SpriteInspectorProps {
  id: string;
  selectedStateId: string;
}

export const SpriteInspector: FC<SpriteInspectorProps> = ({
  id,
  selectedStateId,
}) => {
  const dispatch = useDispatch();
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const spriteState = selectedStateId
    ? sprite?.states?.find((s) => s.id === selectedStateId)
    : undefined;

  if (!sprite) {
    return (
      <Sidebar>
        <SidebarColumn />
      </Sidebar>
    );
  }

  const editSheet = (changes: Record<string, unknown>) => {
    dispatch(
      entitiesActions.editSpriteSheet({
        spriteSheetId: id,
        changes,
      })
    );
  };

  const editState = (changes: Record<string, unknown>) => {
    if (!selectedStateId) {
      return;
    }
    dispatch(
      entitiesActions.editSpriteState({
        spriteSheetId: id,
        stateId: selectedStateId,
        changes,
      })
    );
  };

  return (
    <Sidebar>
      <SidebarColumn>
        <FormContainer>
          <FormHeader>
            <EditableText
              name="name"
              placeholder={l10n("FIELD_SPRITE")}
              value={sprite.name || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                editSheet({ name: e.currentTarget.value })
              }
            />
          </FormHeader>

          <FormRow>
            <FormField
              name="canvasSize"
              label={l10n("FIELD_CANVAS_SIZE")}
              info={l10n("FIELD_CANVAS_SIZE_NOTE")}
            >
              <FormRow>
                <CoordinateInput
                  name="canvasWidth"
                  coordinate="w"
                  value={16}
                  disabled
                />
                <CoordinateInput
                  name="canvasHeight"
                  coordinate="h"
                  value={16}
                  disabled
                />
              </FormRow>
            </FormField>
          </FormRow>

          <FormDivider />

          <FormRow>
            <FormField
              name="bounds"
              label={l10n("FIELD_COLLISION_BOUNDING_BOX")}
              info={l10n("FIELD_COLLISION_BOUNDING_BOX_NOTE")}
            >
              <FormRow>
                <CoordinateInput
                  name="boundsX"
                  coordinate="x"
                  placeholder="0"
                  min={-96}
                  max={96}
                  value={sprite.boundsX}
                  onChange={(e) => editSheet({ boundsX: castEventValue(e) })}
                />
                <CoordinateInput
                  name="boundsY"
                  coordinate="y"
                  placeholder="0"
                  min={-96}
                  max={96}
                  value={sprite.boundsY}
                  onChange={(e) => editSheet({ boundsY: castEventValue(e) })}
                />
              </FormRow>
              <FormRow>
                <CoordinateInput
                  name="boundsWidth"
                  coordinate="w"
                  placeholder="16"
                  min={0}
                  max={128}
                  value={sprite.boundsWidth}
                  onChange={(e) =>
                    editSheet({ boundsWidth: castEventValue(e) })
                  }
                />
                <CoordinateInput
                  name="boundsHeight"
                  coordinate="h"
                  placeholder="16"
                  min={0}
                  max={128}
                  value={sprite.boundsHeight}
                  onChange={(e) =>
                    editSheet({ boundsHeight: castEventValue(e) })
                  }
                />
              </FormRow>
            </FormField>
          </FormRow>

          <FormSectionTitle>{l10n("FIELD_ANIMATION_SETTINGS")}</FormSectionTitle>

          <FormRow>
            <FormField
              name="animationType"
              label={l10n("FIELD_ANIMATION_TYPE")}
              info={l10n("FIELD_ANIMATION_TYPE_NOTE")}
            >
              <AnimationTypeSelect
                name="animationType"
                value={sprite.animationType}
                onChange={(newValue?: SpriteAnimationType) =>
                  editSheet({ animationType: newValue })
                }
              />
            </FormField>
          </FormRow>

          {spriteState && (
            <>
              <FormDivider />
              <FormRow>
                <FormField name="stateName" label={l10n("FIELD_STATE_NAME")}>
                  <EditableText
                    name="stateName"
                    value={spriteState.name || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      editState({ name: e.currentTarget.value })
                    }
                  />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField
                  name="stateTarget"
                  label={l10n("FIELD_STATE_TARGET_SPRITE_SHEET")}
                  info={l10n("FIELD_STATE_NOTE")}
                >
                  <SpriteSheetSelectButton
                    name="stateTarget"
                    value={spriteState.spriteSheetId}
                    includeInfo
                    onChange={(newId: string) =>
                      editState({ spriteSheetId: newId })
                    }
                  />
                </FormField>
              </FormRow>
            </>
          )}
        </FormContainer>
      </SidebarColumn>
    </Sidebar>
  );
};
