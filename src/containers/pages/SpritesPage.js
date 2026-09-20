import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import FilesSidebar from "../../components/assets/FilesSidebar";
import ImageViewer from "../../components/assets/ImageViewer";
import SpriteAnimationsPanel from "../../components/assets/SpriteAnimationsPanel";
import SpriteFramesPanel from "../../components/assets/SpriteFramesPanel";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import electronActions from "../../store/features/electron/electronActions";
import getSpriteAnimations from "../../lib/helpers/spriteAnimations";

// Height reserved at the bottom of the left-hand file list for the
// Animations dock below (fixed budget, not measured - keeps FilesSidebar's
// own bottomOffset simple and avoids a layout-thrashing resize-observer for
// what the plan scoped as a small, fixed-shape panel; the dock itself
// scrolls internally if the animation list is taller than this).
const ANIMATIONS_DOCK_HEIGHT = 180;

class SpritesPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      query: "",
      animationIndex: 0
    };
  }

  componentDidUpdate(prevProps) {
    const { id } = this.props;
    if (id !== prevProps.id) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ animationIndex: 0 });
    }
  }

  onSearch = query => {
    this.setState({
      query
    });
  };

  onSelectAnimation = animationIndex => {
    this.setState({ animationIndex });
  };

  render() {
    const { files, id, openHelp, sidebarWidth } = this.props;
    const { query, animationIndex } = this.state;

    const filesList = query
      ? files.filter(f => {
          return f.name.toUpperCase().indexOf(query.toUpperCase()) > -1;
        })
      : files;

    const file = filesList.find(f => f.id === id) || filesList[0];
    const animations = file
      ? getSpriteAnimations(file.type, file.numFrames)
      : [];
    const selectedAnimation =
      animations[Math.min(animationIndex, animations.length - 1)];

    return (
      <div>
        {file && <ImageViewer file={file} />}
        {file && selectedAnimation && (
          <SpriteFramesPanel
            id={file.id}
            animation={selectedAnimation}
            sidebarWidth={sidebarWidth}
          />
        )}
        <FilesSidebar
          files={filesList}
          selectedFile={file}
          query={query}
          onSearch={this.onSearch}
          bottomOffset={file ? ANIMATIONS_DOCK_HEIGHT : 0}
          onAdd={() => {
            openHelp("sprites");
          }}
        />
        {file && (
          <div
            className="FilesSidebar__StatesDock"
            style={{ height: ANIMATIONS_DOCK_HEIGHT, width: sidebarWidth }}
          >
            <SpriteAnimationsPanel
              animations={animations}
              selectedIndex={animationIndex}
              onSelect={this.onSelectAnimation}
            />
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
