import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

const directions = ["up", "down", "left", "right"];

// Face diamond (Y left, A right, X top, B bottom), two shoulder buttons and the
// Select / Start capsules - the SNES pad, in place of the Game Boy one.
const SNESControlsPreview = ({ onSelect, selected }) => (
  <div className="SNESControlsPreview">
    <div className="SNESControlsPreview__Shoulders">
      {["l", "r"].map(button => (
        <div
          key={button}
          className={cx(
            "SNESControlsPreview__Shoulder",
            `SNESControlsPreview__Shoulder--${button}`,
            { "SNESControlsPreview__Shoulder--Selected": button === selected }
          )}
          onClick={() => onSelect(button)}
        >
          <div className="SNESControlsPreview__ButtonLabel">
            {button.toUpperCase()}
          </div>
        </div>
      ))}
    </div>
    <div className="SNESControlsPreview__DPad">
      {directions.map(direction => (
        <div
          key={direction}
          className={cx(
            "SNESControlsPreview__DPadButton",
            `SNESControlsPreview__DPadButton--${direction}`,
            {
              "SNESControlsPreview__DPadButton--Selected": direction === selected
            }
          )}
          onClick={() => onSelect(direction)}
        />
      ))}
    </div>
    <div className="SNESControlsPreview__Face">
      {["x", "y", "a", "b"].map(button => (
        <div
          key={button}
          className={cx(
            "SNESControlsPreview__Button",
            `SNESControlsPreview__Button--${button}`,
            { "SNESControlsPreview__Button--Selected": button === selected }
          )}
          onClick={() => onSelect(button)}
        >
          <div className="SNESControlsPreview__ButtonLabel">
            {button.toUpperCase()}
          </div>
        </div>
      ))}
    </div>
    <div className="SNESControlsPreview__Center">
      {["select", "start"].map(button => (
        <div
          key={button}
          className={cx(
            "SNESControlsPreview__Capsule",
            `SNESControlsPreview__Capsule--${button}`,
            { "SNESControlsPreview__Capsule--Selected": button === selected }
          )}
          onClick={() => onSelect(button)}
        >
          <div className="SNESControlsPreview__CapsuleLabel">{button}</div>
        </div>
      ))}
    </div>
  </div>
);

SNESControlsPreview.propTypes = {
  onSelect: PropTypes.func.isRequired,
  selected: PropTypes.string
};

SNESControlsPreview.defaultProps = {
  selected: ""
};

export default SNESControlsPreview;
