import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { connect } from "react-redux";
import l10n from "../../lib/helpers/l10n";
import * as actions from "../../actions";
import GBControlsPreview from "../library/GBControlsPreview";
import SNESControlsPreview from "../library/SNESControlsPreview";
import { FormField } from "../library/Forms";
import Button from "../library/Button";

const directions = [
  {
    key: "up",
    label: "Up"
  },
  {
    key: "down",
    label: "Down"
  },
  {
    key: "left",
    label: "Left"
  },
  {
    key: "right",
    label: "Right"
  }
];

const buttons = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  {
    key: "start",
    label: "Start"
  },
  {
    key: "select",
    label: "Select"
  }
];

// Shown only for a SNES project, as an extra column.
const snesButtons = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "l", label: "L" },
  { key: "r", label: "R" }
];

const keyMap = {
  up: "customControlsUp",
  down: "customControlsDown",
  left: "customControlsLeft",
  right: "customControlsRight",
  a: "customControlsA",
  b: "customControlsB",
  start: "customControlsStart",
  select: "customControlsSelect",
  x: "customControlsX",
  y: "customControlsY",
  l: "customControlsL",
  r: "customControlsR"
};

const defaultValues = {
  customControlsUp: ["ArrowUp", "w"],
  customControlsDown: ["ArrowDown", "s"],
  customControlsLeft: ["ArrowLeft", "a"],
  customControlsRight: ["ArrowRight", "d"],
  customControlsA: ["Alt", "z", "j"],
  customControlsB: ["Control", "k", "x"],
  customControlsStart: ["Enter"],
  customControlsSelect: ["Shift"],
  // SNES-only (X / Y / L / R) - the same keys the bundled web player falls back
  // to. Ignored by the Game Boy target.
  customControlsX: ["i"],
  customControlsY: ["u"],
  customControlsL: ["o"],
  customControlsR: ["p"]
};

class CustomControlsPicker extends Component {
  constructor() {
    super();
    this.inputRef = React.createRef();
    this.state = {
      input: ""
    };
  }

  onKeyDown = e => {
    const { settings, editProjectSettings } = this.props;
    const { input } = this.state;
    if (input) {
      e.preventDefault();
      const inputKey = keyMap[input];
      const currentValue = Array.isArray(settings[inputKey])
        ? settings[inputKey]
        : defaultValues[inputKey];

      this.setState({ input: "" });
      this.inputRef.current.blur();

      if (e.key === "Backspace") {
        editProjectSettings({
          [inputKey]: []
        });
      } else {
        const patch = Object.values(keyMap).reduce((memo, otherInputKey) => {
          if (inputKey !== otherInputKey) {
            const otherValue = Array.isArray(settings[otherInputKey])
              ? settings[otherInputKey]
              : defaultValues[otherInputKey];
            if (otherValue.indexOf(e.key) > -1) {
              return {
                ...memo,
                [otherInputKey]: otherValue.filter(k => k !== e.key)
              };
            }
            return memo;
          }
          if (currentValue.indexOf(e.key) > -1) {
            return {
              ...memo,
              [inputKey]: currentValue.filter(k => k !== e.key)
            };
          }
          return {
            ...memo,
            [inputKey]: [].concat(currentValue, e.key)
          };
        }, {});
        editProjectSettings(patch);
      }
    }
  };

  onSelectInput = input => {
    this.setState({ input });
    this.inputRef.current.focus();
  };

  onFocus = input => e => {
    this.setState({ input });
    this.inputRef.current.focus();
  };

  onBlur = e => {
    this.setState({ input: "" });
  };

  noop = () => {};

  onRestoreDefault = () => {
    const { editProjectSettings } = this.props;
    editProjectSettings(
      Object.keys(defaultValues).reduce((memo, key) => {
        return {
          ...memo,
          [key]: undefined
        };
      }, {})
    );
  };

  renderField = item => {
    const { settings } = this.props;
    const { input } = this.state;
    return (
      <FormField key={item.key}>
        <label htmlFor="buttonUps">
          {item.label}
          <input
            id="buttonUp"
            value={(
              settings[keyMap[item.key]] ||
              defaultValues[keyMap[item.key]] ||
              []
            ).join(", ")}
            onChange={this.noop}
            placeholder=""
            className={cx("CustomControlsPicker__Input", {
              "CustomControlsPicker__Input--Focus": item.key === input
            })}
            onFocus={this.onFocus(item.key)}
          />
        </label>
      </FormField>
    );
  };

  render() {
    const { settings } = this.props;
    const { input } = this.state;
    const isSnes = settings.target === "snes";
    return (
      <div className="CustomControlsPicker">
        <div
          className={cx("CustomControlsPicker__Columns", {
            "CustomControlsPicker__Columns--snes": isSnes
          })}
        >
          <div className="CustomControlsPicker__Column">
            {directions.map(this.renderField)}
          </div>
          <div className="CustomControlsPicker__Column">
            {buttons.map(this.renderField)}
          </div>
          {isSnes && (
            <div className="CustomControlsPicker__Column">
              {snesButtons.map(this.renderField)}
            </div>
          )}
          <div
            className="CustomControlsPicker__Column"
            style={{ marginTop: 30 }}
          >
            {isSnes ? (
              <SNESControlsPreview
                selected={input}
                onSelect={this.onSelectInput}
              />
            ) : (
              <GBControlsPreview
                selected={input}
                onSelect={this.onSelectInput}
              />
            )}
          </div>
        </div>
        <input
          className="CustomControlsPicker__HiddenInput"
          ref={this.inputRef}
          onKeyDown={this.onKeyDown}
          onBlur={this.onBlur}
        />
        <div style={{ marginTop: 30 }}>
          <Button onClick={this.onRestoreDefault}>
            {l10n("FIELD_RESTORE_DEFAULT")}
          </Button>
        </div>
      </div>
    );
  }
}

const CustomControlPropType = PropTypes.arrayOf(PropTypes.string);

CustomControlsPicker.propTypes = {
  settings: PropTypes.shape({
    customControlsUp: CustomControlPropType,
    customControlsDown: CustomControlPropType,
    customControlsLeft: CustomControlPropType,
    customControlsRight: CustomControlPropType,
    customControlsA: CustomControlPropType,
    customControlsB: CustomControlPropType,
    customControlsStart: CustomControlPropType,
    customControlsSelect: CustomControlPropType,
    customControlsX: CustomControlPropType,
    customControlsY: CustomControlPropType,
    customControlsL: CustomControlPropType,
    customControlsR: CustomControlPropType,
    target: PropTypes.string
  }).isRequired,
  editProjectSettings: PropTypes.func.isRequired
};

function mapStateToProps(state) {
  const project = state.entities.present.result;
  const { settings } = project;
  return {
    settings
  };
}

const mapDispatchToProps = {
  editProjectSettings: actions.editProjectSettings
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(CustomControlsPicker);
