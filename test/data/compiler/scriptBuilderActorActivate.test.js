import ScriptBuilder from "../../../src/lib/compiler/scriptBuilder";
import {
  commandIndex as cmd,
  ACTOR_ACTIVATE,
  ACTOR_DEACTIVATE,
} from "../../../src/lib/events/scriptCommands";

test("Should be able to activate the active actor", () => {
  const output = [];
  const sb = new ScriptBuilder(output);
  sb.actorActivate();
  expect(output).toEqual([cmd(ACTOR_ACTIVATE)]);
});

test("Should be able to deactivate the active actor", () => {
  const output = [];
  const sb = new ScriptBuilder(output);
  sb.actorDeactivate();
  expect(output).toEqual([cmd(ACTOR_DEACTIVATE)]);
});
