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

// Power-of-2 LoROM bank counts buildSnesRom.js's romSizing() already
// understands (32 KB/bank) - a project with many backgrounds/sprites/music
// tracks can overflow the 8-bank (256 KB) default at link time
// ("INSERT_SECTIONS: No room for section... in ROM bank 0"), and there was
// previously no way to raise it from the editor at all (settings.snesRomBanks
// was compiler-only).
const romBanksOptions = [
  {
    value: 8,
    label: "256KB (8 banks, default)",
  },
  {
    value: 16,
    label: "512KB (16 banks)",
  },
  {
    value: 32,
    label: "1MB (32 banks)",
  },
  {
    value: 64,
    label: "2MB (64 banks)",
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

  onChangeRomBanks = (snesRomBanks) => {
    const { editProjectSettings } = this.props;
    editProjectSettings({ snesRomBanks });
  };

  render() {
    const { settings, searchTerm } = this.props;

    const target = settings.target || "gb";
    const isSnes = target === "snes";
    const snesRegion = settings.snesRegion || "ntsc";
    const snesSramSize = settings.snesSramSize || "03";
    const snesRomBanks = settings.snesRomBanks || 8;

    const currentTargetValue = targetOptions.find(
      (option) => option.value === target
    );
    const currentRegionValue = regionOptions.find(
      (option) => option.value === snesRegion
    );
    const currentSramValue = sramOptions.find(
      (option) => option.value === snesSramSize
    );
    const currentRomBanksValue = romBanksOptions.find(
      (option) => option.value === snesRomBanks
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
            <SearchableSettingRow
              searchTerm={searchTerm}
              searchMatches={[l10n("SETTINGS_SNES_ROM_BANKS")]}
            >
              <SettingRowLabel>
                {l10n("SETTINGS_SNES_ROM_BANKS")}
              </SettingRowLabel>
              <SettingRowInput>
                <Select
                  value={currentRomBanksValue}
                  options={romBanksOptions}
                  onChange={(newValue) => {
                    this.onChangeRomBanks(newValue.value);
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
    snesRomBanks: PropTypes.number,
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
