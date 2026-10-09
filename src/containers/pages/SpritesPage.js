import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import FilesSidebar from "../../components/assets/FilesSidebar";
import ImageViewer from "../../components/assets/ImageViewer";
import SpriteAnimationsPanel from "../../components/assets/SpriteAnimationsPanel";
import SpriteAnimationSettingsPanel from "../../components/assets/SpriteAnimationSettingsPanel";
import SpriteFramesPanel from "../../components/assets/SpriteFramesPanel";
import { SpriteAnimationTypeSelect } from "../../components/sprites/SpriteAnimationTypeSelect";
import { SpriteAnimationTimeline } from "../../components/sprites/SpriteAnimationTimeline";
import { SpriteEditorCanvas } from "../../components/sprites/SpriteEditorCanvas";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import entitiesActions from "../../store/features/entities/entitiesActions";
import electronActions from "../../store/features/electron/electronActions";
import getSpriteAnimations from "../../lib/helpers/spriteAnimations";
import l10n from "../../lib/helpers/l10n";

// Height reserved at the bottom of the left-hand file list for the
// Animations dock below (fixed budget, not measured - keeps FilesSidebar's
// own bottomOffset simple and avoids a layout-thrashing resize-observer for
// what the plan scoped as a small, fixed-shape panel; the dock itself
// scrolls internally if the animation list is taller than this).
const ANIMATIONS_DOCK_HEIGHT = 180;

// One group per sprite state - always including the implicit "Default"
// state (the sheet's own animations) - matching GB Studio 3.2.1's real
// "ANIMATIONS" tree (one group per state, each listing its own animations).
// A named state's animations belong to whichever *other* sheet it points
// at - falls back to an empty list if that sheet was since deleted, rather
// than crashing on a dangling reference.
const buildAnimationGroups = (file, files) => {
  const groups = [
    {
      stateId: undefined,
      label: l10n("FIELD_STATE_DEFAULT"),
      animations: getSpriteAnimations(file.type, file.numFrames)
    }
  ];
  (file.states || []).forEach(spriteState => {
    const target = files.find(f => f.id === spriteState.spriteSheetId);
    groups.push({
      stateId: spriteState.id,
      label: spriteState.name || l10n("FIELD_STATE"),
      animations: target ? getSpriteAnimations(target.type, target.numFrames) : []
    });
  });
  return groups;
};

class SpritesPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      query: "",
      stateId: undefined,
      animationIndex: 0,
      // Path B (metasprite groundwork - SpriteSheet.animationStates, a
      // completely separate data tree from the Path A `states`/
      // `animationIndex` pair above) has its own 3-level selection, tracked
      // independently so the two systems never collide.
      pathBAnimationStateId: undefined,
      pathBSubStateId: undefined,
      pathBFrameId: undefined
    };
  }

  componentDidUpdate(prevProps) {
    const { id } = this.props;
    if (id !== prevProps.id) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({
        stateId: undefined,
        animationIndex: 0,
        pathBAnimationStateId: undefined,
        pathBSubStateId: undefined,
        pathBFrameId: undefined
      });
    }
  }

  onSearch = query => {
    this.setState({
      query
    });
  };

  onSelectState = stateId => {
    this.setState({ stateId, animationIndex: 0 });
  };

  onSelectAnimation = (stateId, animationIndex) => {
    this.setState({ stateId, animationIndex });
  };

  // Reselect Default once the currently-selected state is removed, so the
  // settings/frames panels don't keep pointing at a state that no longer
  // exists.
  onStateRemoved = () => {
    this.setState({ stateId: undefined, animationIndex: 0 });
  };

  // Path B
  onAddPathBAnimationState = () => {
    const { addSpriteAnimationState } = this.props;
    const { file } = this.getGroups();
    if (!file) {
      return;
    }
    addSpriteAnimationState({
      spriteSheetId: file.id,
      name: l10n("FIELD_STATE_DEFAULT")
    });
  };

  onSelectPathBSubState = subStateId => {
    this.setState({ pathBSubStateId: subStateId, pathBFrameId: undefined });
  };

  onSelectPathBFrame = frameId => {
    this.setState({ pathBFrameId: frameId });
  };

  onAddState = () => {
    const { addSpriteState } = this.props;
    const { file, groups } = this.getGroups();
    if (!file) {
      return;
    }
    addSpriteState({
      spriteSheetId: file.id,
      name: `${l10n("FIELD_STATE")} ${groups.length}`,
      targetSpriteSheetId: file.id
    });
  };

  getGroups = () => {
    const { files, id } = this.props;
    const { query } = this.state;
    const filesList = query
      ? files.filter(f => f.name.toUpperCase().indexOf(query.toUpperCase()) > -1)
      : files;
    const file = filesList.find(f => f.id === id) || filesList[0];
    return {
      filesList,
      file,
      groups: file ? buildAnimationGroups(file, files) : []
    };
  };

  render() {
    const { files, openHelp, sidebarWidth } = this.props;
    const {
      query,
      stateId,
      animationIndex,
      pathBAnimationStateId,
      pathBSubStateId,
      pathBFrameId
    } = this.state;
    const { filesList, file, groups } = this.getGroups();

    // Path B selection - defaults to the sheet's own first AnimationState/
    // SubState/Frame (file.animationStates is empty for every project today,
    // nothing creates one yet outside this page's own "+" button below).
    const pathBAnimationStates = (file && file.animationStates) || [];
    const selectedPathBAnimationState =
      pathBAnimationStates.find(a => a.id === pathBAnimationStateId) ||
      pathBAnimationStates[0];
    const selectedPathBSubState =
      selectedPathBAnimationState &&
      (selectedPathBAnimationState.subStates.find(
        s => s.id === pathBSubStateId
      ) ||
        selectedPathBAnimationState.subStates[0]);
    const selectedPathBFrame =
      selectedPathBSubState &&
      (selectedPathBSubState.frames.find(f => f.id === pathBFrameId) ||
        selectedPathBSubState.frames[0]);

    // Whichever sheet is actually in effect for the current selection -
    // this file for Default, or the selected state's own target sheet. The
    // Frames panel already resolves its own sheet purely from an id, so
    // this is the one place that indirection needs to be followed.
    const selectedState = file && (file.states || []).find(s => s.id === stateId);
    const selectedSheet = selectedState
      ? files.find(f => f.id === selectedState.spriteSheetId) || file
      : file;

    const selectedGroup = groups.find(g => g.stateId === stateId) || groups[0];
    const selectedAnimation =
      selectedGroup &&
      selectedGroup.animations[
        Math.min(animationIndex, selectedGroup.animations.length - 1)
      ];

    return (
      <div>
        {file && <ImageViewer file={file} />}
        {file && (
          <SpriteAnimationSettingsPanel
            id={file.id}
            stateId={stateId}
            onRemoved={this.onStateRemoved}
          />
        )}
        {selectedSheet && selectedAnimation && (
          <SpriteFramesPanel
            id={selectedSheet.id}
            animationIndex={animationIndex}
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
              groups={groups}
              selectedStateId={stateId}
              selectedAnimationIndex={animationIndex}
              onSelectState={this.onSelectState}
              onSelectAnimation={this.onSelectAnimation}
              onAddState={this.onAddState}
            />
          </div>
        )}
        {/* Path B (metasprite groundwork) - draft components, first mount.
            Deliberately not laid out against the Path A panels above yet
            (expect visual overlap until this gets its own pass); here so it
            can actually be seen and tried, not hidden in src/. */}
        {file && !selectedPathBAnimationState && (
          <div
            className="SpritesPage__PathBEmpty"
            style={{ left: sidebarWidth + 20 }}
          >
            <button type="button" onClick={this.onAddPathBAnimationState}>
              {l10n("FIELD_ADD_ANIMATION_STATE")}
            </button>
          </div>
        )}
        {file && selectedPathBAnimationState && (
          <div
            className="SpritesPage__PathBDock"
            style={{ left: sidebarWidth + 20 }}
          >
            <SpriteAnimationTypeSelect
              spriteSheetId={file.id}
              animationStateId={selectedPathBAnimationState.id}
              selectedSubStateId={
                selectedPathBSubState && selectedPathBSubState.id
              }
              onSelectSubState={this.onSelectPathBSubState}
            />
            {selectedPathBSubState && selectedPathBFrame && (
              <SpriteEditorCanvas
                spriteSheetId={file.id}
                animationStateId={selectedPathBAnimationState.id}
                subStateId={selectedPathBSubState.id}
                frameId={selectedPathBFrame.id}
              />
            )}
          </div>
        )}
        {file && selectedPathBSubState && (
          <SpriteAnimationTimeline
            spriteSheetId={file.id}
            animationStateId={selectedPathBAnimationState.id}
            subStateId={selectedPathBSubState.id}
            selectedFrameId={selectedPathBFrame && selectedPathBFrame.id}
            onSelectFrame={this.onSelectPathBFrame}
          />
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
  addSpriteState: PropTypes.func.isRequired,
  addSpriteAnimationState: PropTypes.func.isRequired,
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
  openHelp: electronActions.openHelp,
  addSpriteState: entitiesActions.addSpriteState,
  addSpriteAnimationState: entitiesActions.addSpriteAnimationState
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(SpritesPage);
