import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import {
  FormField,
  ToggleableFormField,
  ToggleableCheckBoxField
} from "../../components/library/Forms";
import l10n from "../../lib/helpers/l10n";
import PageHeader from "../../components/library/PageHeader";
import PageContent from "../../components/library/PageContent";
import castEventValue from "../../lib/helpers/castEventValue";
import * as actions from "../../actions";
import CustomPalettePicker from "../../components/forms/CustomPalettePicker";
import { getScenesLookup } from "../../reducers/entitiesReducer";
import CustomControlsPicker from "../../components/forms/CustomControlsPicker";
import CartPicker from "../../components/forms/CartPicker";

class SettingsPage extends Component {
  onEditSetting = key => e => {
    const { editProjectSettings } = this.props;
    editProjectSettings({
      [key]: castEventValue(e)
    });
  };

  onEditProject = key => e => {
    const { editProject } = this.props;
    editProject({
      [key]: castEventValue(e)
    });
  };

  render() {
    const { project, settings, scenesLookup } = this.props;

    if (!project || !project.scenes) {
      return <div />;
    }

    const { scenes } = project;
    const {
      customColorsEnabled,
      customHead,
      gbcFastCPUEnabled,
      target,
      snesRegion,
      snesSramSize
    } = settings;

    const scenesLength = scenes.length;
    const actorsLength = scenes.reduce((memo, sceneId) => {
      const scene = scenesLookup[sceneId];
      return memo + scene.actors.length;
    }, 0);

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          transform: "translate3d(0,0,0)"
        }}
      >
        <PageHeader>
          <h1>{l10n("SETTINGS")}</h1>
          <p>
            {scenesLength}{" "}
            {scenesLength === 1
              ? l10n("SETTINGS_SCENE")
              : l10n("SETTINGS_SCENES")}
          </p>
          <p>
            {actorsLength}{" "}
            {actorsLength === 1
              ? l10n("SETTINGS_ACTOR")
              : l10n("SETTINGS_ACTORS")}
          </p>
        </PageHeader>
        <PageContent>
          <section>
            <h2>{l10n("SETTINGS_TARGET_PLATFORM")}</h2>
            <FormField>
              <label htmlFor="targetPlatform">
                {l10n("FIELD_TARGET_PLATFORM")}
                <select
                  id="targetPlatform"
                  value={target || "gb"}
                  onChange={this.onEditSetting("target")}
                >
                  <option value="gb">{l10n("FIELD_TARGET_GB")}</option>
                  <option value="snes">{l10n("FIELD_TARGET_SNES")}</option>
                </select>
              </label>
              <p>{l10n("FIELD_TARGET_HELP")}</p>
              {target === "snes" && (
                <p
                  style={{
                    background: "rgba(255, 193, 7, 0.15)",
                    border: "1px solid rgba(255, 193, 7, 0.5)",
                    borderRadius: 4,
                    padding: 10
                  }}
                >
                  {l10n("FIELD_TARGET_SNES_WARNING")}
                </p>
              )}
            </FormField>
          </section>

          {target === "snes" && (
            <section>
              <h2>{l10n("SETTINGS_SNES_OPTIONS")}</h2>
              <FormField>
                <label htmlFor="snesRegion">
                  {l10n("FIELD_SNES_REGION")}
                  <select
                    id="snesRegion"
                    value={snesRegion || "ntsc"}
                    onChange={this.onEditSetting("snesRegion")}
                  >
                    <option value="ntsc">{l10n("FIELD_SNES_REGION_NTSC")}</option>
                    <option value="pal">{l10n("FIELD_SNES_REGION_PAL")}</option>
                  </select>
                </label>
              </FormField>
              <FormField>
                <label htmlFor="snesSramSize">
                  {l10n("FIELD_SNES_SRAM_SIZE")}
                  <select
                    id="snesSramSize"
                    value={snesSramSize || "03"}
                    onChange={this.onEditSetting("snesSramSize")}
                  >
                    <option value="00">{l10n("FIELD_SNES_SRAM_NONE")}</option>
                    <option value="01">2 KB</option>
                    <option value="03">{l10n("FIELD_SNES_SRAM_8KB")}</option>
                    <option value="05">32 KB</option>
                  </select>
                </label>
                <p>{l10n("FIELD_SNES_SRAM_HELP")}</p>
              </FormField>
            </section>
          )}

          {target !== "snes" && (
            <section>
              <h2>{l10n("SETTINGS_GBC")}</h2>

              <ToggleableCheckBoxField
                label={l10n("FIELD_GBC_FAST_CPU")}
                open={gbcFastCPUEnabled}
                onToggle={this.onEditSetting("gbcFastCPUEnabled")}
              ></ToggleableCheckBoxField>

              <ToggleableCheckBoxField
                label={l10n("FIELD_EXPORT_CUSTOM_COLORS")}
                open={customColorsEnabled}
                onToggle={this.onEditSetting("customColorsEnabled")}
              >
                <CustomPalettePicker />
              </ToggleableCheckBoxField>
            </section>
          )}

          <section>
            <h2>{l10n("SETTINGS_CONTROLS")}</h2>
            <CustomControlsPicker />
          </section>

          {target !== "snes" && (
            <section>
              <h2>{l10n("SETTINGS_CART_TYPE")}</h2>
              <CartPicker />
            </section>
          )}

          <section>
            <h2>{l10n("SETTINGS_CUSTOM_HEADER")}</h2>
            <FormField>
              <label htmlFor="customHead">
                {l10n("FIELD_CUSTOM_HEAD")}

                <pre>
                  &lt;!DOCTYPE html&gt;{"\n"}
                  &lt;html&gt;{"\n  "}
                  &lt;head&gt;{"\n  "}
                  ...
                </pre>
                <textarea
                  id="customHead"
                  value={customHead || ""}
                  placeholder={
                    'e.g. <style type"text/css">\nbody {\n  background-color: darkgreen;\n}\n</style>'
                  }
                  onChange={this.onEditSetting("customHead")}
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
              </label>
            </FormField>
          </section>
        </PageContent>
      </div>
    );
  }
}

function mapStateToProps(state) {
  const project = state.entities.present.result;
  const settings = project ? project.settings : {};
  const scenesLookup = getScenesLookup(state);

  return {
    project,
    settings,
    scenesLookup
  };
}

const mapDispatchToProps = {
  editProject: actions.editProject,
  editProjectSettings: actions.editProjectSettings
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(SettingsPage);
