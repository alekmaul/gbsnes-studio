/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
import glob from "glob";
import fs from "fs";
import plugins, { pluginEmitter } from "../plugins/plugins";
import { eventsRoot } from "../../consts";
import * as l10n from "../helpers/l10n";
import * as eventHelpers from "./helpers";
import * as gbStudioHelpers from "../helpers/gbstudio";
import * as eventSystemHelpers from "../helpers/eventSystem";
import * as compileEntityEvents from "../compiler/compileEntityEvents";
// Namespace import (not the default export) so the mock below keeps a
// `.default` key - eventTextDialogue.js/eventMenu.js/eventTextChoice.js all
// do `require("../helpers/trimlines").default`, matching every other mock
// here. A plain default import would hand the sandbox the already-unwrapped
// function with no `.default` on it, breaking that call with
// "trimlines is not a function" the moment any of those fields run.
import * as trimLinesModule from "../helpers/trimlines";
import * as compilerTargets from "../compiler/targets";

const VM2 = __non_webpack_require__("vm2");
const NodeVM = VM2.NodeVM;

const internalEventHandlerPaths = glob.sync(`${eventsRoot}/event*.js`);

const vm = new NodeVM({
  timeout: 1000,
  sandbox: {},
  require: {
    mock: {
      "./helpers": eventHelpers,
      "../helpers/l10n": l10n,
      "../helpers/gbstudio": gbStudioHelpers,
      "../helpers/eventSystem": eventSystemHelpers,
      "../compiler/compileEntityEvents": compileEntityEvents,
      "../helpers/trimlines": trimLinesModule,
      "../compiler/targets": compilerTargets
    }
  }
});

const eventHandlers = {
  ...internalEventHandlerPaths.reduce((memo, path) => {
    const handlerCode = fs.readFileSync(path, "utf8");
    const handler = vm.run(handlerCode);
    if (!handler.id) {
      throw new Error(`Event handler ${path} is missing id`);
    }
    return {
      ...memo,
      [handler.id]: handler
    };
  }, {}),
  ...plugins.events
};

pluginEmitter.on("update-event", plugin => {
  eventHandlers[plugin.id] = plugin;
});

pluginEmitter.on("add-event", plugin => {
  eventHandlers[plugin.id] = plugin;
});

pluginEmitter.on("remove-event", plugin => {
  delete eventHandlers[plugin.id];
});

const engineFieldUpdateEvents = {};
const engineFieldStoreEvents = {};

export default eventHandlers;

export {
  engineFieldUpdateEvents,
  engineFieldStoreEvents
}
