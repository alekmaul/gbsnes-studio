import { ipcRenderer, remote } from "electron";
import uuid from "uuid/v4";
import Path from "path";
import buildProject from "../lib/compiler/buildProject";
import {
  BUILD_GAME,
  SET_SECTION,
  CMD_START,
  CMD_COMPLETE,
  CMD_STD_OUT,
  CMD_STD_ERR
} from "../actions/actionTypes";
import copy from "../lib/helpers/fsCopy";
import { denormalizeProject } from "../reducers/entitiesReducer";
import getTmp from "../lib/helpers/getTmp";

const buildUUID = uuid();

// See index.js's "release-play" handler: a web build reuses the same
// per-session outputRoot every time, so an already-open Play window can
// still be holding a lock on the exact files a new web build is about to
// overwrite (Windows-only EPERM, user-reported: "Export ROM works fine...
// Export Web hangs"). Ask the main process to navigate it away first.
// Bounded with a timeout fallback so a main-process hiccup (event never
// fires) can't hang the build forever - worst case, the original EPERM
// retry logic in writeFileAtomic.js is still the safety net underneath.
const releasePlayWindow = () =>
  new Promise(resolve => {
    const timeout = setTimeout(resolve, 2000);
    ipcRenderer.once("release-play-complete", () => {
      clearTimeout(timeout);
      resolve();
    });
    ipcRenderer.send("release-play");
  });

export default store => next => async action => {
  if (action.type === BUILD_GAME) {
    const { buildType, exportBuild, ejectBuild } = action;
    const dispatch = store.dispatch.bind(store);

    dispatch({ type: CMD_START });
    try {
      const state = store.getState();
      const projectRoot = state.document && state.document.root;
      const project = denormalizeProject(state.entities.present);
      const outputRoot = Path.normalize(`${getTmp()}/${buildUUID}`);
      const target =
        process.env.GBS_TARGET ||
        (project.settings && project.settings.target) ||
        "gb";
      const romName = target === "snes" ? "game.sfc" : "game.gb";

      if (buildType === "web") {
        await releasePlayWindow();
      }

      await buildProject(project, {
        projectRoot,
        buildType,
        outputRoot,
        tmpPath: getTmp(),
        progress: message => {
          if (
            message !== "'" &&
            message.indexOf("unknown or unsupported #pragma") === -1
          ) {
            dispatch({ type: CMD_STD_OUT, text: message });
          }
        },
        warnings: message => {
          dispatch({ type: CMD_STD_ERR, text: message });
        }
      });

      if (exportBuild) {
        await copy(
          `${outputRoot}/build/${buildType}`,
          `${projectRoot}/build/${buildType}`
        );
        remote.shell.openItem(`${projectRoot}/build/${buildType}`);
        dispatch({
          type: CMD_STD_OUT,
          text: "-"
        });
        dispatch({
          type: CMD_STD_OUT,
          text: `Success! ${
            buildType === "web"
              ? `Site is ready at ${Path.normalize(
                  `${projectRoot}/build/web/index.html`
                )}`
              : `ROM is ready at ${Path.normalize(
                  `${projectRoot}/build/rom/${romName}`
                )}`
          }`
        });
      } else if (ejectBuild) {
        await copy(`${outputRoot}`, `${projectRoot}/eject`);
        remote.shell.openItem(`${projectRoot}/eject`);
      }

      dispatch({ type: CMD_COMPLETE });

      if (buildType === "web" && !exportBuild && !ejectBuild) {
        dispatch({
          type: CMD_STD_OUT,
          text: "-"
        });
        dispatch({
          type: CMD_STD_OUT,
          text: "Success! Starting emulator..."
        });
        ipcRenderer.send(
          "open-play",
          `file://${outputRoot}/build/web/index.html`,
          target
        );
      }

      return {
        outputRoot
      };
    } catch (e) {
      if (typeof e === "string") {
        dispatch({ type: SET_SECTION, section: "build" });
        dispatch({ type: CMD_STD_ERR, text: e });
      } else {
        dispatch({ type: SET_SECTION, section: "build" });
        dispatch({ type: CMD_STD_ERR, text: e.toString() });
      }
      dispatch({ type: CMD_COMPLETE });
      throw e;
    }
  }

  return next(action);
};
