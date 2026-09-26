import React, { useEffect, useState } from "react";
import Path from "path";
import settings from "electron-settings";
import { ipcRenderer } from "electron";
import l10n from "../../lib/helpers/l10n";
import getTmp from "../../lib/helpers/getTmp";
import ThemeProvider from "../ui/theme/ThemeProvider";
import GlobalStyle from "../ui/globalStyle";
import { PreferencesWrapper } from "../ui/preferences/Preferences";
import { FormField, FormRow } from "../ui/form/FormLayout";
import { TextField } from "../ui/form/TextField";
import { Button } from "../ui/buttons/Button";
import { DotsIcon } from "../ui/icons/Icons";
import { FixedSpacer, FlexGrow } from "../ui/spacing/Spacing";
import { AppSelect } from "../ui/form/AppSelect";
import { Select, Option } from "../ui/form/Select";

const { dialog } = require("electron").remote;

// Ported from GB Studio 3.2.1's own Preferences ("UI Elements Scaling") -
// these are Chromium page *zoom levels* (webContents.setZoomLevel), not raw
// percentages: the actual multiplier is 1.2^level (Electron's native page
// zoom, same mechanism as Ctrl/Cmd +/- in a browser). Most steps are round
// integer levels; the two extremes (50%/150%) use the precise inverse-log
// value to land exactly on that percentage rather than the nearest integer
// step - matching upstream's own values exactly.
const zoomOptions: Option[] = [
  { value: "-3.80178", label: "50%" },
  { value: "-3", label: "58%" },
  { value: "-2", label: "69%" },
  { value: "-1", label: "83%" },
  { value: "0", label: "100%" },
  { value: "1", label: "120%" },
  { value: "2.2239", label: "150%" },
  { value: "3", label: "172%" },
  { value: "3.80178", label: "200%" },
];

const Preferences = () => {
  const pathError = "";
  const [tmpPath, setTmpPath] = useState<string>("");
  const [imageEditorPath, setImageEditorPath] = useState<string>("");
  const [musicEditorPath, setMusicEditorPath] = useState<string>("");
  const [zoomLevel, setZoomLevel] = useState<string>("0");

  useEffect(() => {
    setTmpPath(getTmp(false));
    setImageEditorPath(String(settings.get("imageEditorPath") || ""));
    setMusicEditorPath(String(settings.get("musicEditorPath") || ""));
    setZoomLevel(String(settings.get("UIScale") || "0"));
  }, []);

  const onChangeTmpPath = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = e.currentTarget.value;
    setTmpPath(newPath);
    settings.set("tmpDir", newPath);
  };

  const onChangeImageEditorPath = (path: string) => {
    setImageEditorPath(path);
    settings.set("imageEditorPath", path);
  };

  const onChangeMusicEditorPath = (path: string) => {
    setMusicEditorPath(path);
    settings.set("musicEditorPath", path);
  };

  const onSelectTmpFolder = async () => {
    const path = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (path.filePaths[0]) {
      const newPath = Path.normalize(`${path.filePaths[0]}/`);
      setTmpPath(newPath);
      settings.set("tmpDir", newPath);
    }
  };

  const onRestoreDefaultTmpPath = () => {
    settings.delete("tmpDir");
    setTmpPath(getTmp(false));
  };

  const onChangeZoomLevel = (newValue: Option | null) => {
    if (!newValue) {
      return;
    }
    setZoomLevel(newValue.value);
    settings.set("UIScale", newValue.value);
    // Apply immediately to every open window (main editor, splash, this
    // one), not just on next launch - matches upstream's live-apply
    // behaviour. main.ts's "set-ui-scale" handler does the actual
    // webContents.setZoomLevel() call, since a renderer can only reach its
    // own window via remote, not every other open BrowserWindow.
    ipcRenderer.send("set-ui-scale", Number(newValue.value));
  };

  return (
    <ThemeProvider>
      <GlobalStyle />

      <PreferencesWrapper>
        <FormRow>
          <TextField
            name="path"
            label={l10n("FIELD_TMP_DIRECTORY")}
            errorLabel={pathError}
            value={tmpPath}
            onChange={onChangeTmpPath}
            additionalRight={
              <Button onClick={onSelectTmpFolder} type="button">
                <DotsIcon />
              </Button>
            }
            info={l10n("FIELD_TMP_DIRECTORY_INFO")}
          />
        </FormRow>
        <FormRow>
          <Button onClick={onRestoreDefaultTmpPath}>
            {l10n("FIELD_RESTORE_DEFAULT")}
          </Button>
        </FormRow>

        <FlexGrow />

        <FormRow>
          <FormField
            name="musicEditorPath"
            label={l10n("FIELD_DEFAULT_IMAGE_EDITOR")}
          >
            <AppSelect
              value={imageEditorPath}
              onChange={onChangeImageEditorPath}
            />
          </FormField>
        </FormRow>
        <FixedSpacer height={10} />

        <FormRow>
          <FormField
            name="musicEditorPath"
            label={l10n("FIELD_DEFAULT_MUSIC_EDITOR")}
          >
            <AppSelect
              value={musicEditorPath}
              onChange={onChangeMusicEditorPath}
            />
          </FormField>
        </FormRow>
        <FixedSpacer height={10} />

        <FormRow>
          <FormField
            name="zoomLevel"
            label={l10n("FIELD_UI_ELEMENTS_SCALING")}
          >
            <Select
              name="zoomLevel"
              value={zoomOptions.find((o) => o.value === zoomLevel)}
              options={zoomOptions}
              onChange={onChangeZoomLevel}
            />
          </FormField>
        </FormRow>
      </PreferencesWrapper>
    </ThemeProvider>
  );
};

export default Preferences;
