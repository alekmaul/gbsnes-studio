import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { connect } from "react-redux";
import l10n from "../../lib/helpers/l10n";
import {
  PaintBucketIcon,
  WandIcon,
  SquareIcon,
  SquareIconSmall,
  EyeOpenIcon,
  EyeClosedIcon,
} from "../library/Icons";
import {
  TOOL_COLLISIONS,
  TOOL_ERASER,
  BRUSH_8PX,
  BRUSH_16PX,
  BRUSH_FILL,
  BRUSH_MAGIC,
  COLLISION_TOP,
  COLLISION_BOTTOM,
  COLLISION_LEFT,
  COLLISION_RIGHT,
  COLLISION_ALL,
  TILE_PROP_LADDER
} from "../../consts";
import editorActions from "../../store/features/editor/editorActions";

const validTools = [TOOL_COLLISIONS, TOOL_ERASER];
const tileTypes = [{
  key: "solid",
  name: "Solid",
  flag: COLLISION_ALL,
},{
  key: "top",
  name: "Collision Top",
  flag: COLLISION_TOP,
},{
  key: "bottom",
  name: "Collision Bottom",
  flag: COLLISION_BOTTOM,
},{
  key: "left",
  name: "Collision Left",
  flag: COLLISION_LEFT,
},{
  key: "right",
  name: "Collision Right",
  flag: COLLISION_RIGHT,
},{
  key: "ladder",
  name: "Ladder",
  flag: TILE_PROP_LADDER
}];

const collisionDirectionFlags = [COLLISION_TOP, COLLISION_BOTTOM, COLLISION_LEFT, COLLISION_RIGHT];

class BrushToolbar extends Component {
  componentDidMount() {
    window.addEventListener("keydown", this.onKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
  }

  onKeyDown = (e) => {
    if (e.target.nodeName !== "BODY") {
      return;
    }
    if (e.ctrlKey || e.shiftKey || e.metaKey) {
      return;
    }
    if (e.code === "Digit1") {
      this.setSelectedTileTypeIndex(0)(e);
    } else if (e.code === "Digit2") {
      this.setSelectedTileTypeIndex(1)(e);
    } else if (e.code === "Digit3") {
      this.setSelectedTileTypeIndex(2)(e);
    } else if (e.code === "Digit4") {
      this.setSelectedTileTypeIndex(3)(e);
    } else if (e.code === "Digit5") {
      this.setSelectedTileTypeIndex(4)(e);
    } else if (e.code === "Digit6") {
      this.setSelectedTileTypeIndex(5)(e);
    } else if (e.code === "Digit8") {
      this.setBrush(BRUSH_8PX)(e);
    } else if (e.code === "Digit9") {
      this.setBrush(BRUSH_16PX)(e);
    } else if (e.code === "Digit0") {
      this.setBrush(BRUSH_FILL)(e);
    } else if (e.code === "Minus") {
      this.toggleShowLayers(e);
    }
  };

  setBrush = (brush) => (e) => {
    e.stopPropagation();
    const { setBrush } = this.props;
    setBrush({brush});
  };

  setSelectedTileTypeIndex = (index) => (e) => {
    const { setSelectedTileType, showTileTypes } = this.props;
    if (showTileTypes && tileTypes[index]) {
      const { selectedTileType } = this.props;

      if (e.shiftKey && collisionDirectionFlags.includes(tileTypes[index].flag)) {
        if (selectedTileType !== tileTypes[index].flag && selectedTileType & tileTypes[index].flag) {
          setSelectedTileType({tileType:selectedTileType & COLLISION_ALL & ~tileTypes[index].flag});
        } else {
          setSelectedTileType({tileType:selectedTileType & COLLISION_ALL | tileTypes[index].flag});
        }
      } else {
        setSelectedTileType({tileType:tileTypes[index].flag});
      }
    }
  };

  toggleShowLayers = (e) => {
    const { setShowLayers, showLayers } = this.props;
    setShowLayers({showLayers: !showLayers});
  };

  render() {
    const {
      selectedTileType,
      selectedBrush,
      visible,
      showTileTypes,
      showLayers,
    } = this.props;

    return (
      <div
        className={cx("BrushToolbar", { "BrushToolbar--Visible": visible })}
      >
        <div
          onClick={this.setBrush(BRUSH_8PX)}
          className={cx("BrushToolbar__Item", {
            "BrushToolbar__Item--Selected": selectedBrush === BRUSH_8PX,
          })}
          title={`${l10n("TOOL_BRUSH", { size: "8px" })} (8)`}
        >
          <SquareIconSmall />
        </div>
        <div
          onClick={this.setBrush(BRUSH_16PX)}
          className={cx("BrushToolbar__Item", {
            "BrushToolbar__Item--Selected": selectedBrush === BRUSH_16PX,
          })}
          title={`${l10n("TOOL_BRUSH", { size: "16px" })} (9)`}
        >
          <SquareIcon />
        </div>
        <div
          onClick={this.setBrush(BRUSH_FILL)}
          className={cx("BrushToolbar__Item", {
            "BrushToolbar__Item--Selected": selectedBrush === BRUSH_FILL,
          })}
          title={`${l10n("TOOL_FILL")} (0)`}
        >
          <PaintBucketIcon />
        </div>
        <div
          onClick={this.setBrush(BRUSH_MAGIC)}
          className={cx("BrushToolbar__Item", {
            "BrushToolbar__Item--Selected": selectedBrush === BRUSH_MAGIC,
          })}
          title={l10n("TOOL_MAGIC")}
        >
          <WandIcon />
        </div>
        <div className="BrushToolbar__Divider" />
        {showTileTypes &&
          <>
            {tileTypes.slice(0, 5).map((tileType, tileTypeIndex) => (
              <div
                key={tileType.name}
                onClick={this.setSelectedTileTypeIndex(tileTypeIndex)}
                className={cx("BrushToolbar__Item", {
                  "BrushToolbar__Item--Selected":
                  tileType.flag === COLLISION_ALL
                    ? selectedTileType === tileType.flag
                    : selectedTileType !== COLLISION_ALL && selectedTileType & tileType.flag,
                })}
                title={`${tileType.name} (${tileTypeIndex + 1})`}
              >
                <div className={cx("BrushToolbar__Tile", `BrushToolbar__Tile--${tileType.key}`)} />
              </div>
            ))}
            <div className="BrushToolbar__Divider" />
            {tileTypes.slice(5).map((tileType, tileTypeIndex) => (
              <div
                key={tileType.name}
                onClick={this.setSelectedTileTypeIndex(tileTypeIndex + 5)}
                className={cx("BrushToolbar__Item", {
                  "BrushToolbar__Item--Selected":
                  tileType.flag === COLLISION_ALL
                    ? selectedTileType === tileType.flag
                    : selectedTileType !== COLLISION_ALL && selectedTileType & tileType.flag,
                })}
                title={`${tileType.name} (${tileTypeIndex + 5 + 1})`}
              >
                <div className={cx("BrushToolbar__Tile", `BrushToolbar__Tile--${tileType.key}`)} />
              </div>
            ))}
            <div className="BrushToolbar__Divider" />
          </>
        }
        <div
          onClick={this.toggleShowLayers}
          className={cx("BrushToolbar__Item", {
            "BrushToolbar__Item--Selected": !showLayers,
          })}
          title={`${
            showLayers ? l10n("TOOL_HIDE_LAYERS") : l10n("TOOL_SHOW_LAYERS")
          } (-)`}
        >
          {showLayers ? <EyeOpenIcon /> : <EyeClosedIcon />}
        </div>
      </div>
    );
  }
}

BrushToolbar.propTypes = {
  visible: PropTypes.bool.isRequired,
  selectedBrush: PropTypes.oneOf([BRUSH_8PX, BRUSH_16PX, BRUSH_FILL, BRUSH_MAGIC])
    .isRequired,
  showLayers: PropTypes.bool.isRequired,
  showTileTypes: PropTypes.bool.isRequired,
  selectedTileType: PropTypes.number.isRequired,
  setSelectedTileType: PropTypes.func.isRequired,
  setBrush: PropTypes.func.isRequired,
  setShowLayers: PropTypes.func.isRequired,
};

function mapStateToProps(state) {
  const { selectedTileType, selectedBrush, showLayers } = state.editor;
  const selectedTool = state.editor.tool;
  const visible = validTools.includes(selectedTool);
  const showTileTypes = selectedTool === TOOL_COLLISIONS;

  return {
    selectedTileType,
    selectedBrush,
    visible,
    showTileTypes,
    showLayers,
  };
}

const mapDispatchToProps = {
  setSelectedTileType: editorActions.setSelectedTileType,
  setBrush: editorActions.setBrush,
  setShowLayers: editorActions.setShowLayers,
};

export default connect(mapStateToProps, mapDispatchToProps)(BrushToolbar);
