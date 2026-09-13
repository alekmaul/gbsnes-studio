import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import l10n from "../../lib/helpers/l10n";
import settingsActions from "../../store/features/settings/settingsActions";
import { Select } from "../ui/form/Select";
import { SearchableSettingRow } from "../ui/form/SearchableSettingRow";
import { SettingRowInput, SettingRowLabel } from "../ui/form/SettingRow";

const targetOptions = [
  {
    value: "gb",
    label: "Game Boy",
  },
  {
    value: "snes",
    label: "Super Nintendo",
  },
];

const regionOptions = [
  {
    value: "ntsc",
    label: "NTSC",
  },
  {
    value: "pal",
    label: "PAL",
  },
];

const sramOptions = [
  {
    value: "00",
    label: "None",
  },
  {
    value: "03",
    label: "8KB (Battery)",
  },
];

class TargetPicker extends Component {
  onChangeTarget = (target) => {
    const { editProjectSettings } = this.props;
    editProjectSettings({ target });
  };

  onChangeRegion = (snesRegion) => {
    const { editProjectSettings } = this.props;
    editProjectSettings({ snesRegion });
  };

  onChangeSram = (snesSramSize) => {
    const { editProjectSettings } = this.props;
    editProjectSettings({ snesSramSize });
  };

  render() {
    const { settings, searchTerm } = this.props;

    const target = settings.target || "gb";
    const isSnes = target === "snes";
    const snesRegion = settings.snesRegion || "ntsc";
    const snesSramSize = settings.snesSramSize || "03";

    const currentTargetValue = targetOptions.find(
      (option) => option.value === target
    );
    const currentRegionValue = regionOptions.find(
      (option) => option.value === snesRegion
    );
    const currentSramValue = sramOptions.find(
      (option) => option.value === snesSramSize
    );

    return (
      <>
        <SearchableSettingRow
          searchTerm={searchTerm}
          searchMatches={[l10n("SETTINGS_TARGET_PLATFORM")]}
        >
          <SettingRowLabel>{l10n("SETTINGS_TARGET_PLATFORM")}</SettingRowLabel>
          <SettingRowInput>
            <Select
              value={currentTargetValue}
              options={targetOptions}
              onChange={(newValue) => {
                this.onChangeTarget(newValue.value);
              }}
            />
          </SettingRowInput>
        </SearchableSettingRow>
        {isSnes && (
          <>
            <SearchableSettingRow
              searchTerm={searchTerm}
              searchMatches={[l10n("SETTINGS_SNES_REGION")]}
            >
              <SettingRowLabel>{l10n("SETTINGS_SNES_REGION")}</SettingRowLabel>
              <SettingRowInput>
                <Select
                  value={currentRegionValue}
                  options={regionOptions}
                  onChange={(newValue) => {
                    this.onChangeRegion(newValue.value);
                  }}
                />
              </SettingRowInput>
            </SearchableSettingRow>
            <SearchableSettingRow
              searchTerm={searchTerm}
              searchMatches={[l10n("SETTINGS_SNES_SRAM")]}
            >
              <SettingRowLabel>{l10n("SETTINGS_SNES_SRAM")}</SettingRowLabel>
              <SettingRowInput>
                <Select
                  value={currentSramValue}
                  options={sramOptions}
                  onChange={(newValue) => {
                    this.onChangeSram(newValue.value);
                  }}
                />
              </SettingRowInput>
            </SearchableSettingRow>
          </>
        )}
      </>
    );
  }
}

TargetPicker.propTypes = {
  settings: PropTypes.shape({
    target: PropTypes.string,
    snesRegion: PropTypes.string,
    snesSramSize: PropTypes.string,
  }).isRequired,
  editProjectSettings: PropTypes.func.isRequired,
  searchTerm: PropTypes.string,
};

TargetPicker.defaultProps = {
  searchTerm: "",
};

function mapStateToProps(state) {
  const settings = state.project.present.settings;
  return {
    settings,
  };
}

const mapDispatchToProps = {
  editProjectSettings: settingsActions.editSettings,
};

export default connect(mapStateToProps, mapDispatchToProps)(TargetPicker);
