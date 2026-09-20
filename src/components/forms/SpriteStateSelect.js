import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import Select from "react-select";
import l10n from "../../lib/helpers/l10n";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";

class SpriteStateSelect extends Component {
  render() {
    const { id, value, spriteSheetId, spriteSheets, onChange } = this.props;

    const spriteSheet = spriteSheets.find((s) => s.id === spriteSheetId);
    const states = (spriteSheet && spriteSheet.states) || [];

    const options = [
      { value: "", label: l10n("FIELD_STATE_DEFAULT") },
      ...states.map((state) => ({
        value: state.id,
        label: state.name,
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

SpriteStateSelect.propTypes = {
  id: PropTypes.string,
  value: PropTypes.string,
  spriteSheetId: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

SpriteStateSelect.defaultProps = {
  id: undefined,
  value: "",
  spriteSheetId: "",
};

function mapStateToProps(state) {
  return {
    spriteSheets: spriteSheetSelectors.selectAll(state),
  };
}

export default connect(mapStateToProps)(SpriteStateSelect);
