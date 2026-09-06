import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import Button from "../library/Button";
import * as actions from "../../actions";
import l10n from "../../lib/helpers/l10n";
import { zoomForSection, assetFilename } from "../../lib/helpers/gbstudio";
import { backgroundWarnings } from "../../lib/helpers/assetWarnings";

class ImageViewer extends Component {
  componentDidMount() {
    window.addEventListener("mousewheel", this.onMouseWheel);
  }

  componentWillUnmount() {
    window.removeEventListener("mousewheel", this.onMouseWheel);
  }

  onMouseWheel = e => {
    const { zoomIn, zoomOut, section } = this.props;
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.wheelDelta > 0) {
        zoomIn(section, e.deltaY * 0.5);
      } else {
        zoomOut(section, e.deltaY * 0.5);
      }
    }
  };

  onOpen = () => {
    const { projectRoot, file, folder, openFolder } = this.props;
    openFolder(`${projectRoot}/assets/${folder}/${file.filename}`);
  };

  getWarnings = () => {
    const { file, folder, target } = this.props;
    if (file && folder === "backgrounds") {
      return backgroundWarnings(file, target);
    }
    return [];
  };

  render() {
    const { projectRoot, file, folder, zoom, sidebarWidth } = this.props;
    const warnings = this.getWarnings();
    return (
      <div className="ImageViewer" style={{ right: sidebarWidth }}>
        <div className="ImageViewer__Content">
          {file && (
            <div
              className="ImageViewer__Image"
              style={{ transform: `scale(${zoom})` }}
            >
              <img
                alt=""
                src={`${assetFilename(
                  projectRoot,
                  folder,
                  file
                )}?_v=${file._v || 0}`}
              />
            </div>
          )}
        </div>
        {file && (
          <div
            className="ImageViewer__Edit"
            style={{ right: sidebarWidth + 10 }}
          >
            <Button onClick={this.onOpen}>{l10n("ASSET_EDIT")}</Button>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="ImageViewer__Warning">
            <ul>
              {warnings.map((warning, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
}

ImageViewer.propTypes = {
  projectRoot: PropTypes.string.isRequired,
  folder: PropTypes.string.isRequired,
  target: PropTypes.string,
  file: PropTypes.shape({
    id: PropTypes.string.isRequired,
    filename: PropTypes.string.isRequired,
    imageWidth: PropTypes.number,
    imageHeight: PropTypes.number,
    _v: PropTypes.number
  }),
  section: PropTypes.string.isRequired,
  zoom: PropTypes.number.isRequired,
  sidebarWidth: PropTypes.number.isRequired,
  zoomIn: PropTypes.func.isRequired,
  zoomOut: PropTypes.func.isRequired,
  openFolder: PropTypes.func.isRequired
};

ImageViewer.defaultProps = {
  file: {},
  target: "gb"
};

function mapStateToProps(state) {
  const { section } = state.navigation;
  const folder = section;
  const zoom = zoomForSection(section, state.editor);
  const { filesSidebarWidth: sidebarWidth } = state.settings;
  const { settings } = state.entities.present.result;
  return {
    projectRoot: state.document && state.document.root,
    folder,
    section,
    zoom: (zoom || 100) / 100,
    sidebarWidth,
    target: settings.target
  };
}

const mapDispatchToProps = {
  openFolder: actions.openFolder,
  zoomIn: actions.zoomIn,
  zoomOut: actions.zoomOut
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(ImageViewer);
