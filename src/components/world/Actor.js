import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { connect } from "react-redux";
import SpriteSheetCanvas from "./SpriteSheetCanvas";
import { ActorShape } from "../../store/stateShape";
import { SPRITE_TYPE_STATIC } from "../../consts";
import {
  actorSelectors,
  spriteSheetSelectors,
} from "../../store/features/entities/entitiesState";
import editorActions from "../../store/features/editor/editorActions";

// M9.4 follow-up (user-found: a Free-form (Metasprite) actor placed on a
// scene still showed as a plain 16x16 sprite) - .Actor's own fixed
// `canvas { top: -8px }` CSS assumes every actor is exactly 16x16
// (bottom-center-anchored: the box below is the actor's own 16x8
// footprint, and a 16-tall sprite's bottom edge needs to sit exactly at
// that footprint's own bottom edge). A composed sprite can be taller/wider
// - this computes the same anchor generalized to any real canvas size,
// matching compileSnesData.js's own dx/dy convention exactly
// (dx = tile.x - canvasWidth/2, dy = tile.y - canvasHeight) so the World
// editor's preview lines up with how the engine actually renders it.
const spriteCanvasOffset = (spriteSheet) => {
  if (!spriteSheet || !spriteSheet.metaspriteMode) {
    return undefined;
  }
  const canvasWidth = spriteSheet.canvasWidth || 16;
  const canvasHeight = spriteSheet.canvasHeight || 16;
  return {
    top: -(canvasHeight - 8),
    left: -(canvasWidth - 16) / 2,
  };
};

class Actor extends Component {
  onMouseDown = (e) => {
    const { actor, sceneId, dragActorStart, setTool } = this.props;
    dragActorStart({sceneId, actorId:actor.id});
    setTool({tool:"select"});
    window.addEventListener("mouseup", this.onMouseUp);
  };

  onMouseUp = (e) => {
    const { dragActorStop } = this.props;
    dragActorStop();
    window.removeEventListener("mouseup", this.onMouseUp);
  };

  render() {
    const { actor, selected, showSprite, canvasOffset } = this.props;
    const { x, y, spriteSheetId, direction, spriteType, frame } = actor;
    return (
      <>
        {selected && actor.isPinned && <div className="Actor__ScreenPreview" />}
        <div
          className={cx("Actor", { "Actor--Selected": selected })}
          onMouseDown={this.onMouseDown}
          style={{
            top: y * 8,
            left: x * 8,
          }}
        >
          {showSprite && (
            <SpriteSheetCanvas
              spriteSheetId={spriteSheetId}
              direction={direction}
              frame={spriteType === SPRITE_TYPE_STATIC ? frame : 0}
              style={canvasOffset}
            />
          )}
        </div>
      </>
    );
  }
}

Actor.propTypes = {
  actor: ActorShape,
  sceneId: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  showSprite: PropTypes.bool.isRequired,
  // eslint-disable-next-line react/forbid-prop-types
  canvasOffset: PropTypes.object,
  dragActorStart: PropTypes.func.isRequired,
  dragActorStop: PropTypes.func.isRequired,
  setTool: PropTypes.func.isRequired,
};

Actor.defaultProps = {
  actor: {},
  selected: false,
  canvasOffset: undefined,
};

function mapStateToProps(state, props) {
  const { type: editorType, entityId, scene: sceneId } = state.editor;

  const actor = actorSelectors.selectById(state, props.id);

  const selected =
    editorType === "actor" &&
    sceneId === props.sceneId &&
    entityId === props.id;
  const showSprite = state.editor.zoom > 80;
  const spriteSheet =
    actor && spriteSheetSelectors.selectById(state, actor.spriteSheetId);
  const canvasOffset = spriteCanvasOffset(spriteSheet);

  return {
    actor,
    selected,
    showSprite,
    canvasOffset,
  };
}

const mapDispatchToProps = {
  dragActorStart: editorActions.dragActorStart,
  dragActorStop: editorActions.dragActorStop,
  setTool: editorActions.setTool,
};

export default connect(mapStateToProps, mapDispatchToProps)(Actor);
