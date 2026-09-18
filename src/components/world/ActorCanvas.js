import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import SpriteSheetCanvas from "./SpriteSheetCanvas";
import { framesPerDirection } from "../../lib/helpers/gbstudio";
import { SPRITE_TYPE_STATIC } from "../../consts";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";

const ActorCanvas = ({
  spriteSheetId,
  spriteType,
  direction,
  overrideDirection,
  frame,
  totalFrames,
}) => {
  let spriteFrame = frame || 0;
  if (spriteType !== SPRITE_TYPE_STATIC) {
    spriteFrame = frame % totalFrames;
  } else if (overrideDirection) {
    spriteFrame = 0;
  }

  return (
    <SpriteSheetCanvas
      spriteSheetId={spriteSheetId}
      direction={direction}
      frame={spriteFrame}
    />
  );
};

ActorCanvas.propTypes = {
  spriteSheetId: PropTypes.string.isRequired,
  spriteType: PropTypes.string,
  direction: PropTypes.string,
  overrideDirection: PropTypes.string,
  frame: PropTypes.number,
  totalFrames: PropTypes.number,
};

ActorCanvas.defaultProps = {
  direction: undefined,
  overrideDirection: undefined,
  frame: undefined,
  totalFrames: 1,
  spriteType: SPRITE_TYPE_STATIC
};

function mapStateToProps(state, props) {
  const {
    spriteSheetId,
    spriteType,
    direction,
    frame,
  } = props.actor;

  const spriteSheet = spriteSheetSelectors.selectById(state, spriteSheetId);
  const spriteFrames = spriteSheet ? spriteSheet.numFrames : 0;
  const totalFrames = framesPerDirection(spriteType, spriteFrames);

  return {
    spriteSheetId,
    spriteType,
    direction: props.direction !== undefined ? props.direction : direction,
    overrideDirection: props.direction,
    frame: props.frame !== undefined ? props.frame % totalFrames : frame,
    totalFrames,
  };
}

export default connect(mapStateToProps)(ActorCanvas);
