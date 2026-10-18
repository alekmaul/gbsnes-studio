import { compile } from "../../src/lib/events/eventPlayerSetAnimState";

const sprites = [
  {
    id: "base",
    animStates: [{ id: "state-walk", name: "Walk" }],
  },
];

test("Should resolve a named animation state to its real index", () => {
  const mockPlayerSetAnimState = jest.fn();
  compile(
    {
      spriteSheetId: "base",
      stateId: "state-walk",
    },
    {
      playerSetAnimState: mockPlayerSetAnimState,
      sprites,
    }
  );
  expect(mockPlayerSetAnimState).toBeCalledWith(1);
});

test("An empty stateId resolves to index 0 - this sheet's own default state", () => {
  const mockPlayerSetAnimState = jest.fn();
  compile(
    {
      spriteSheetId: "base",
      stateId: "",
    },
    {
      playerSetAnimState: mockPlayerSetAnimState,
      sprites,
    }
  );
  expect(mockPlayerSetAnimState).toBeCalledWith(0);
});
