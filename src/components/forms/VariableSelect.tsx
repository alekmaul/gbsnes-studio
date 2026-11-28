import React, { useState, useEffect, FC } from "react";
import { Select as DefaultSelect, Option, OptGroup } from "../ui/form/Select";
import styled from "styled-components";
import PropTypes from "prop-types";
import { useDispatch, useSelector } from "react-redux";
import {
  customEventSelectors,
  variableSelectors,
} from "../../store/features/entities/entitiesState";
import { RootState } from "../../store/configureStore";
import {
  groupVariables,
  NamedVariable,
  namedVariablesByContext,
} from "../../lib/helpers/variables";
import { CheckIcon, PencilIcon } from "../ui/icons/Icons";
import { Input } from "../ui/form/Input";
import entitiesActions from "../../store/features/entities/entitiesActions";
import l10n from "../../lib/helpers/l10n";
import editorActions from "../../store/features/editor/editorActions";

interface VariableSelectProps {
  id?: string;
  value?: string;
  entityId: string;
  allowRename?: boolean;
  onChange: (newValue: string) => void;
}

const Wrapper = styled.div`
  position: relative;
`;

const Select = styled(DefaultSelect)`
  .CustomSelect__control {
    padding-left: 22px;
  }
` as unknown as React.ComponentType<{
  value: Option | undefined;
  options: OptGroup[];
  onChange: (newValue: Option) => void;
}>;
// react-select/styled-components/@types version drift makes the styled
// wrapper's inferred prop overloads reject this component's real usage
// below ("Property 'value' does not exist..." etc.) - not a real prop
// mismatch, just a types mismatch from this fresh install's resolved
// versions. Recast to the props this component actually passes.

const VariableRenameInput = styled(Input)`
  &&&& {
    padding-left: 25px;
    padding-right: 32px;
    height: 28px;
  }
`;

const VariableRenameButton = styled.button`
  position: absolute;
  top: 3px;
  right: 3px;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: ${(props) => Math.max(0, props.theme.borderRadius - 1)}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  line-height: 10px;
  font-size: 12px;
  font-weight: bold;
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
  background: ${(props) => props.theme.colors.input.background};
  border-color: ${(props) => props.theme.colors.input.background};

  ${Wrapper}:hover & {
    opacity: 1;
  }

  :focus {
    opacity: 1;
  }
  :hover {
    background: rgba(128, 128, 128, 0.3);
  }
  :active {
    background: rgba(128, 128, 128, 0.4);
  }

  svg {
    width: 12px;
    height: 12px;
    fill: #666;
  }
`;

const VariableRenameCompleteButton = styled.button`
  position: absolute;
  top: 3px;
  right: 3px;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: ${(props) => Math.max(0, props.theme.borderRadius - 1)}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  line-height: 10px;
  font-size: 12px;
  font-weight: bold;
  background: transparent;
  border-color: transparent;

  :hover {
    background: rgba(128, 128, 128, 0.3);
  }
  :active {
    background: rgba(128, 128, 128, 0.4);
  }
  svg {
    width: 12px;
    height: 12px;
    fill: #333;
  }
`;

export const VariableSelect: FC<VariableSelectProps> = ({
  value,
  onChange,
  entityId,
  allowRename,
}) => {
  const [renameVisible, setRenameVisible] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [renameId, setRenameId] = useState("");
  const [variables, setVariables] = useState<NamedVariable[]>([]);
  const [options, setOptions] = useState<OptGroup[]>([]);
  const [currentVariable, setCurrentVariable] = useState<NamedVariable>();
  const [currentValue, setCurrentValue] = useState<Option>();
  const editorType = useSelector((state: RootState) => state.editor.type);
  const variablesLookup = useSelector((state: RootState) =>
    variableSelectors.selectEntities(state)
  );
  const customEvent = useSelector((state: RootState) =>
    customEventSelectors.selectById(state, entityId)
  );
  const dispatch = useDispatch();

  const valueIsLocal = value && value.startsWith("L");
  const valueIsTemp = value && value.startsWith("T");
  const canRename = !valueIsTemp && editorType !== "customEvent";

  useEffect(() => {
    const variables = namedVariablesByContext(
      editorType,
      entityId,
      variablesLookup,
      customEvent
    );
    const groupedVariables = groupVariables(variables);
    const groupedOptions: OptGroup[] = groupedVariables.map((g) => {
      const options = g.variables.map((v) => ({
        value: v.id,
        label: `${v.name}`,
      }));
      return {
        label: g.name,
        options,
      };
    });
    setVariables(variables);
    setOptions(groupedOptions);
  }, [entityId, variablesLookup, editorType, customEvent]);

  useEffect(() => {
    setCurrentVariable(variables.find((v) => v.id === value));
  }, [variables, value]);

  useEffect(() => {
    if (currentVariable) {
      setCurrentValue({
        value: currentVariable.id,
        label: `${currentVariable.name}`,
      });
    }
  }, [currentVariable]);

  const onRenameStart = () => {
    if (currentValue) {
      setEditValue(currentValue.label);
      setRenameId(currentValue.value);
      setRenameVisible(true);
    }
  };

  const onRenameFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  };

  const onRename = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.currentTarget.value);
  };

  const onRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onRenameFinish();
    } else if (e.key === "Escape") {
      setRenameVisible(false);
    }
  };

  const onRenameFinish = () => {
    if (renameId) {
      if (valueIsLocal) {
        dispatch(
          entitiesActions.renameVariable({
            variableId: `${entityId}__${renameId}`,
            name: editValue,
          })
        );
      } else {
        dispatch(
          entitiesActions.renameVariable({
            variableId: renameId || "0",
            name: editValue,
          })
        );
      }
    }

    setRenameVisible(false);
  };

  const onJumpToVariable = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    if (e.altKey) {
      if (
        value &&
        editorType !== "customEvent" &&
        Number.isInteger(Number(value))
      ) {
        dispatch(editorActions.selectVariable({ variableId: value }));
      }
    }
  };

  return (
    <Wrapper onClick={onJumpToVariable}>
      {renameVisible ? (
        <VariableRenameInput
          key={renameId}
          value={editValue}
          onChange={onRename}
          onKeyDown={onRenameKeyDown}
          onFocus={onRenameFocus}
          onBlur={onRenameFinish}
          autoFocus
        />
      ) : (
        <Select
          value={currentValue}
          options={options}
          onChange={(newValue: Option) => {
            onChange(newValue.value);
          }}
        />
      )}
      {canRename &&
        (renameVisible ? (
          <VariableRenameCompleteButton
            onClick={onRenameFinish}
            title={l10n("FIELD_RENAME")}
          >
            <CheckIcon />
          </VariableRenameCompleteButton>
        ) : (
          <VariableRenameButton
            onClick={onRenameStart}
            title={l10n("FIELD_RENAME")}
          >
            <PencilIcon />
          </VariableRenameButton>
        ))}
    </Wrapper>
  );
};
