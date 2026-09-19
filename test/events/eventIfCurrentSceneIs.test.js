import { compile } from "../../src/lib/events/eventIfCurrentSceneIs";

test("Should be able to conditionally execute if the current scene matches", () => {
  const mockIfCurrentSceneIs = jest.fn();
  const truePath = [{ command: "EVENT_END", id: "abc" }];
  const falsePath = [{ command: "EVENT_END", id: "def" }];
  compile(
    {
      sceneId: "scene1",
      true: truePath,
      false: falsePath,
    },
    {
      ifCurrentSceneIs: mockIfCurrentSceneIs,
    }
  );
  expect(mockIfCurrentSceneIs).toBeCalledWith("scene1", truePath, falsePath);
});

test("Should use empty false path when else is disabled", () => {
  const mockIfCurrentSceneIs = jest.fn();
  const truePath = [{ command: "EVENT_END", id: "abc" }];
  compile(
    {
      sceneId: "scene1",
      true: truePath,
      false: [{ command: "EVENT_END", id: "def" }],
      __disableElse: true,
    },
    {
      ifCurrentSceneIs: mockIfCurrentSceneIs,
    }
  );
  expect(mockIfCurrentSceneIs).toBeCalledWith("scene1", truePath, []);
});
