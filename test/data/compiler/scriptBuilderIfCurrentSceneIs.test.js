import ScriptBuilder from "../../../src/lib/compiler/scriptBuilder";
import {
  commandIndex as cmd,
  IF_CURRENT_SCENE_IS,
  JUMP,
} from "../../../src/lib/events/scriptCommands";

test("Should be able to conditionally execute if the current scene matches", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    scenes: [{ id: "scene0" }, { id: "scene1" }],
    compileEvents: () => {
      output.push(99);
    },
  });
  sb.ifCurrentSceneIs("scene1", [], []);
  expect(output).toEqual([
    cmd(IF_CURRENT_SCENE_IS),
    0,
    1,
    0,
    9,
    99,
    cmd(JUMP),
    0,
    10,
    99,
  ]);
});

test("Should wrap a missing scene id to an index that never matches", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    scenes: [{ id: "scene0" }],
    compileEvents: () => {
      output.push(99);
    },
  });
  sb.ifCurrentSceneIs("not-a-real-scene", [], []);
  // findIndex -> -1, wraps to 0xFFFF
  expect(output.slice(0, 3)).toEqual([cmd(IF_CURRENT_SCENE_IS), 0xff, 0xff]);
});
