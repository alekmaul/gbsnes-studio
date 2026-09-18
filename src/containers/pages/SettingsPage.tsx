import React, { FC, useCallback, useLayoutEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import l10n from "../../lib/helpers/l10n";
import castEventValue from "../../lib/helpers/castEventValue";
import CustomControlsPicker from "../../components/forms/CustomControlsPicker";
import Alert, { AlertItem } from "../../components/library/Alert";
import { Select } from "../../components/ui/form/Select";
import { SettingsState } from "../../store/features/settings/settingsState";
import settingsActions from "../../store/features/settings/settingsActions";
import EngineFieldsEditor from "../../components/settings/EngineFieldsEditor";
import { Input } from "../../components/ui/form/Input";
import { RootState } from "../../store/configureStore";
import { useGroupedEngineFields } from "../../components/settings/useGroupedEngineFields";
import { Textarea } from "../../components/ui/form/Textarea";
import useWindowSize from "../../components/ui/hooks/use-window-size";
import {
  SettingsContentColumn,
  SettingsMenuColumn,
  SettingsMenuItem,
  SettingsPageWrapper,
  SettingsSearchWrapper,
} from "../../components/settings/SettingsLayout";
import { CardAnchor, CardHeading } from "../../components/ui/cards/Card";
import { SearchableSettingRow } from "../../components/ui/form/SearchableSettingRow";
import {
  SettingRowInput,
  SettingRowLabel,
} from "../../components/ui/form/SettingRow";
import { SearchableCard } from "../../components/ui/cards/SearchableCard";

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

const SettingsPage: FC = () => {
  const dispatch = useDispatch();
  const settings = useSelector(
    (state: RootState) => state.project.present.settings
  );
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [scrollToId, setScrollToId] = useState<string>("");
  const groupedFields = useGroupedEngineFields();
  const editSettings = useCallback(
    (patch: Partial<SettingsState>) => {
      dispatch(settingsActions.editSettings(patch));
    },
    [dispatch]
  );
  const windowSize = useWindowSize();
  const showMenu = (windowSize.width || 0) >= 750;

  useLayoutEffect(() => {
    if (scrollToId) {
      const el = document.getElementById(scrollToId);
      if (el) {
        el.scrollIntoView();
      }
    }
  }, [scrollToId]);

  const {
    customHead,
  } = settings;

  const snesRegion = settings.snesRegion || "ntsc";
  const snesSramSize = settings.snesSramSize || "03";
  const snesRomBanks = settings.snesRomBanks || 8;

  const currentRegionValue = regionOptions.find(
    (option) => option.value === snesRegion
  );
  const currentSramValue = sramOptions.find(
    (option) => option.value === snesSramSize
  );
  const currentRomBanksValue = romBanksOptions.find(
    (option) => option.value === snesRomBanks
  );

  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.currentTarget.value);
  };

  const onMenuItem = (id: string) => () => {
    const el = document.getElementById(id);
    if (el) {
      setScrollToId(id);
    } else {
      setSearchTerm("");
      setScrollToId(id);
    }
  };

  const onEditSetting = (id: string) => (e: any) => {
    editSettings({
      [id]: castEventValue(e),
    });
  };

  const onChangeRegion = (snesRegion: "ntsc" | "pal") => {
    editSettings({ snesRegion });
  };

  const onChangeSram = (snesSramSize: string) => {
    editSettings({ snesSramSize });
  };

  const onChangeRomBanks = (snesRomBanks: number) => {
    editSettings({ snesRomBanks });
  };

  return (
    <SettingsPageWrapper>
      {showMenu && (
        <SettingsMenuColumn>
          <SearchableCard>
            <SettingsSearchWrapper>
              <Input
                autoFocus
                type="search"
                placeholder="Search Settings..."
                value={searchTerm}
                onChange={onSearch}
              />
            </SettingsSearchWrapper>
            <SettingsMenuItem onClick={onMenuItem("settingsSnesOptions")}>
              {l10n("SETTINGS_SNES_OPTIONS")}
            </SettingsMenuItem>
            {groupedFields.map((group) => (
              <SettingsMenuItem
                key={group.name}
                onClick={onMenuItem(`settings${group.name}`)}
              >
                {l10n(group.name)}
              </SettingsMenuItem>
            ))}
            <SettingsMenuItem onClick={onMenuItem("settingsControls")}>
              {l10n("SETTINGS_CONTROLS")}
            </SettingsMenuItem>
            <SettingsMenuItem onClick={onMenuItem("settingsCustomHead")}>
              {l10n("SETTINGS_CUSTOM_HEADER")}
            </SettingsMenuItem>
          </SearchableCard>
        </SettingsMenuColumn>
      )}
      <SettingsContentColumn>
        <SearchableCard
          searchTerm={searchTerm}
          searchMatches={[
            l10n("SETTINGS_SNES_OPTIONS"),
            l10n("SETTINGS_SNES_REGION"),
            l10n("SETTINGS_SNES_SRAM"),
            l10n("SETTINGS_SNES_ROM_BANKS"),
          ]}
        >
          <CardAnchor id="settingsSnesOptions" />
          <CardHeading>{l10n("SETTINGS_SNES_OPTIONS")}</CardHeading>
          {!searchTerm && (
            <Alert variant="warning">
              <AlertItem>{l10n("WARNING_SNES_PALETTES")}</AlertItem>
              <AlertItem>{l10n("WARNING_SNES_ENGINE_FIELDS")}</AlertItem>
              <AlertItem>{l10n("WARNING_SNES_PROJECTILES")}</AlertItem>
              <AlertItem>{l10n("WARNING_SNES_SPRITE_SHEETS")}</AlertItem>
              <AlertItem>{l10n("WARNING_SNES_NO_WEB_PLAYER")}</AlertItem>
            </Alert>
          )}
          <SearchableSettingRow
            searchTerm={searchTerm}
            searchMatches={[l10n("SETTINGS_SNES_REGION")]}
          >
            <SettingRowLabel>{l10n("SETTINGS_SNES_REGION")}</SettingRowLabel>
            <SettingRowInput>
              <Select
                value={currentRegionValue}
                options={regionOptions}
                onChange={(newValue: { value: string }) => {
                  onChangeRegion(newValue.value as "ntsc" | "pal");
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
                onChange={(newValue: { value: string }) => {
                  onChangeSram(newValue.value);
                }}
              />
            </SettingRowInput>
          </SearchableSettingRow>
          <SearchableSettingRow
            searchTerm={searchTerm}
            searchMatches={[l10n("SETTINGS_SNES_ROM_BANKS")]}
          >
            <SettingRowLabel>{l10n("SETTINGS_SNES_ROM_BANKS")}</SettingRowLabel>
            <SettingRowInput>
              <Select
                value={currentRomBanksValue}
                options={romBanksOptions}
                onChange={(newValue: { value: number }) => {
                  onChangeRomBanks(newValue.value);
                }}
              />
            </SettingRowInput>
          </SearchableSettingRow>
        </SearchableCard>

        <EngineFieldsEditor searchTerm={searchTerm} />

        <SearchableCard
          searchTerm={searchTerm}
          searchMatches={[
            "Up",
            "Down",
            "Left",
            "Right",
            "A",
            "B",
            "Start",
            "Select",
          ]}
        >
          <CardAnchor id="settingsControls" />
          <CardHeading>{l10n("SETTINGS_CONTROLS")}</CardHeading>
          <CustomControlsPicker searchTerm={searchTerm} />
        </SearchableCard>

        <SearchableCard
          searchTerm={searchTerm}
          searchMatches={["Custom HTML Header"]}
        >
          <CardAnchor id="settingsCustomHead" />
          <CardHeading>{l10n("SETTINGS_CUSTOM_HEADER")}</CardHeading>
          <SearchableSettingRow
            searchTerm={searchTerm}
            searchMatches={["Custom HTML Header"]}
          >
            <SettingRowLabel>Custom HTML Header</SettingRowLabel>
            <SettingRowInput>
              <pre>
                &lt;!DOCTYPE html&gt;{"\n"}
                &lt;html&gt;{"\n  "}
                &lt;head&gt;{"\n  "}
                ...
              </pre>
              <Textarea
                id="customHead"
                value={customHead || ""}
                placeholder={
                  'e.g. <style type"text/css">\nbody {\n  background-color: darkgreen;\n}\n</style>'
                }
                onChange={onEditSetting("customHead")}
                rows={15}
                style={{ fontFamily: "monospace" }}
              />
              <pre>
                {"  "}&lt;/head&gt;{"\n  "}
                &lt;body&gt;{"\n  "}
                ...{"\n  "}
                &lt;body&gt;{"\n"}
                &lt;html&gt;
              </pre>
            </SettingRowInput>
          </SearchableSettingRow>
        </SearchableCard>
      </SettingsContentColumn>
    </SettingsPageWrapper>
  );
};

export default SettingsPage;
