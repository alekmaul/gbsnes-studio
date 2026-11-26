import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import SpriteSheetCanvas from "./SpriteSheetCanvas";

const ActorCanvas = ({
  spriteSheetId,
  direction,
  overrideDirection,
  frame,
}) => (
  <SpriteSheetCanvas
    spriteSheetId={spriteSheetId}
    direction={direction}
    frame={overrideDirection ? 0 : frame || 0}
  />
);

ActorCanvas.propTypes = {
  spriteSheetId: PropTypes.string.isRequired,
  direction: PropTypes.string,
  overrideDirection: PropTypes.string,
  frame: PropTypes.number,
};

ActorCanvas.defaultProps = {
  direction: undefined,
  overrideDirection: undefined,
  frame: undefined,
};

function mapStateToProps(state, props) {
  const { spriteSheetId, direction, frame } = props.actor;

  return {
    spriteSheetId,
    direction: props.direction !== undefined ? props.direction : direction,
    overrideDirection: props.direction,
    frame: props.frame !== undefined ? props.frame : frame,
  };
}

export default connect(mapStateToProps)(ActorCanvas);
