import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import FilesSidebar from "../../components/assets/FilesSidebar";
import ImageViewer from "../../components/assets/ImageViewer";
import SpriteStatesEditor from "../../components/assets/SpriteStatesEditor";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import electronActions from "../../store/features/electron/electronActions";

// Height reserved at the bottom of the left-hand file list for the States
// dock below (fixed budget, not measured - keeps FilesSidebar's own
// bottomOffset simple and avoids a layout-thrashing resize-observer for
// what the plan scoped as a small, fixed-shape panel).
const STATES_DOCK_HEIGHT = 220;

class SpritesPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      query: ""
    };
  }

  onSearch = query => {
    this.setState({
      query
    });
  };

  render() {
    const { files, id, openHelp, sidebarWidth } = this.props;
    const { query } = this.state;

    const filesList = query
      ? files.filter(f => {
          return f.name.toUpperCase().indexOf(query.toUpperCase()) > -1;
        })
      : files;

    const file = filesList.find(f => f.id === id) || filesList[0];

    return (
      <div>
        {file && <ImageViewer file={file} />}
        <FilesSidebar
          files={filesList}
          selectedFile={file}
          query={query}
          onSearch={this.onSearch}
          bottomOffset={file ? STATES_DOCK_HEIGHT : 0}
          onAdd={() => {
            openHelp("sprites");
          }}
        />
        {file && (
          <div
            className="FilesSidebar__StatesDock"
            style={{ height: STATES_DOCK_HEIGHT, width: sidebarWidth }}
          >
            <SpriteStatesEditor id={file.id} />
          </div>
        )}
      </div>
    );
  }
}

SpritesPage.propTypes = {
  id: PropTypes.string,
  files: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired
    })
  ).isRequired,
  openHelp: PropTypes.func.isRequired,
  sidebarWidth: PropTypes.number.isRequired
};

SpritesPage.defaultProps = {
  id: ""
};

function mapStateToProps(state) {
  const { id } = state.navigation;
  const files = spriteSheetSelectors.selectAll(state);
  const { filesSidebarWidth: sidebarWidth } = state.editor;
  return {
    files,
    id,
    sidebarWidth
  };
}

const mapDispatchToProps = {
  openHelp: electronActions.openHelp
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(SpritesPage);
