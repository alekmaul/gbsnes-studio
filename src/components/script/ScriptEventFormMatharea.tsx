import React, { FC } from "react";
import PropTypes from "prop-types";
import { Textarea } from "../ui/form/Textarea";

// M3 (v4): RPN math-expression evaluator. Plain multi-line textarea, not a
// port of GB Studio 3.x's CodeMirror-based MathTextarea (syntax highlighting
// + $variable$ autocomplete) - scoped down deliberately for a first cut; the
// project's variable/expression syntax (see src/lib/helpers/rpn/) works the
// same either way, this only affects editing comfort.
interface ScriptEventFormMathAreaProps {
  id?: string;
  value?: string;
  placeholder?: string;
  rows?: number;
  onChange: (newValue: string) => void;
}

const ScriptEventFormMathArea: FC<ScriptEventFormMathAreaProps> = ({
  id,
  value,
  placeholder,
  rows,
  onChange,
}) => {
  return (
    <Textarea
      id={id}
      value={value || ""}
      placeholder={placeholder}
      rows={rows || 5}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
};

ScriptEventFormMathArea.propTypes = {
  id: PropTypes.string,
  value: PropTypes.string,
  placeholder: PropTypes.string,
  rows: PropTypes.number,
  onChange: PropTypes.func.isRequired,
};

ScriptEventFormMathArea.defaultProps = {
  id: undefined,
  value: "",
  placeholder: undefined,
  rows: 5,
};

export default ScriptEventFormMathArea;
