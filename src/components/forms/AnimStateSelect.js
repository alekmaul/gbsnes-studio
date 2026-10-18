import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import Select from "react-select";
import l10n from "../../lib/helpers/l10n";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import { SpriteShape } from "../../store/stateShape";

// Named animation states (v4 follow-up) - the AnimState sibling of
// SpriteStateSelect.js, resolving against a sheet's own animStates[]
// (GB Studio 3.2.1-style named pose-sets within one sheet) rather than
// states[] (this fork's older, unrelated "Sprite Swap" feature - see
// entitiesTypes.ts's own SpriteState/AnimState comments for why the two
// needed separate pickers). value "" is always this sheet's own default/
// implicit state (compiled to ACTOR_SET_ANIM_STATE/PLAYER_SET_ANIM_STATE
// index 0).
class AnimStateSelect extends Component {
  render() {
    const { id, value, spriteSheetId, spriteSheets, onChange } = this.props;

    const spriteSheet = spriteSheets.find((s) => s.id === spriteSheetId);
    const animStates = (spriteSheet && spriteSheet.animStates) || [];

    const options = [
      { value: "", label: l10n("FIELD_STATE_DEFAULT") },
      ...animStates.map((animState) => ({
        value: animState.id,
        label: animState.name,
      })),
    ];

    const current = options.find((o) => o.value === value) || options[0];

    return (
      <Select
        id={id}
        className="ReactSelectContainer"
        classNamePrefix="ReactSelect"
        options={options}
        value={current}
        onChange={(data) => {
          onChange(data.value);
        }}
        menuPlacement="auto"
        blurInputOnSelect
      />
    );
  }
}

AnimStateSelect.propTypes = {
  id: PropTypes.string,
  value: PropTypes.string,
  spriteSheetId: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  spriteSheets: PropTypes.arrayOf(SpriteShape).isRequired,
};

AnimStateSelect.defaultProps = {
  id: undefined,
  value: "",
  spriteSheetId: "",
};

function mapStateToProps(state) {
  return {
    spriteSheets: spriteSheetSelectors.selectAll(state),
  };
}

export default connect(mapStateToProps)(AnimStateSelect);
