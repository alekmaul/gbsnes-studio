import React, { FC, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useSelector } from "react-redux";
import { RootState } from "../../store/configureStore";
import { Select, Option, OptGroup } from "../ui/form/Select";
import l10n from "../../lib/helpers/l10n";
import { useGroupedEngineFields } from "../settings/useGroupedEngineFields";

// "define" fields (button remapping - INPUT_PLATFORM_JUMP etc.) are a
// compile-time #define, not a runtime-readable byte - Engine Field: Set/
// Store can't target them, matching GB Studio's own real EngineFieldSelect
// (same filter, same reason).
const notDefine = (field: { cType: string }) => field.cType !== "define";

interface EngineFieldSelectProps {
  value?: string;
  onChange?: (newValue: string) => void;
}

const EngineFieldSelect: React.FC<EngineFieldSelectProps> = ({
  value,
  onChange,
}) => {
  const groupedFields = useGroupedEngineFields();
  const engineFields = useSelector((state: RootState) => state.engine.fields);
  const [options, setOptions] = useState<OptGroup[]>([]);

  useEffect(() => {
    setOptions(
      groupedFields
        .map((g) => ({
          label: l10n(g.name),
          options: g.fields.filter(notDefine).map((f) => ({
            value: f.key,
            label: l10n(f.label),
          })),
        }))
        .filter((g) => g.options.length > 0)
    );
  }, [groupedFields]);

  const currentField = engineFields.find((f) => f.key === value);

  const currentValue = currentField && {
    value: currentField.key,
    label: l10n(currentField.label),
  };

  return (
    <Select
      value={currentValue}
      options={options}
      onChange={(e: Option) => {
        if (onChange) {
          onChange(e.value);
        }
      }}
    />
  );
};

EngineFieldSelect.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
};

EngineFieldSelect.defaultProps = {
  value: undefined,
  onChange: undefined,
};

export default EngineFieldSelect;
