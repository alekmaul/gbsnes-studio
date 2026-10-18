import { compile } from "../../src/lib/events/eventActorSetAnimState";

const sprites = [
  {
    id: "base",
    animStates: [
      { id: "state-walk", name: "Walk" },
      { id: "state-attack", name: "Attack" },
    ],
  },
];

test("Should resolve a named animation state to its real index and set it on a real actor", () => {
  const mockActorSetActive = jest.fn();
  const mockActorSetAnimState = jest.fn();
  const mockPlayerSetAnimState = jest.fn();
  compile(
    {
      actorId: "actor1",
      spriteSheetId: "base",
      stateId: "state-attack",
    },
    {
      actorSetActive: mockActorSetActive,
      actorSetAnimState: mockActorSetAnimState,
      playerSetAnimState: mockPlayerSetAnimState,
      getActorById: () => ({ id: "actor1" }),
      sprites,
    }
  );
  expect(mockActorSetActive).toBeCalledWith("actor1");
  // "state-attack" is animStates[1] -> index 1 + 1 = 2
  expect(mockActorSetAnimState).toBeCalledWith(2);
  expect(mockPlayerSetAnimState).not.toBeCalled();
});

test("An empty stateId resolves to index 0 - this sheet's own default state", () => {
  const mockActorSetAnimState = jest.fn();
  compile(
    {
      actorId: "actor1",
      spriteSheetId: "base",
      stateId: "",
    },
    {
      actorSetActive: jest.fn(),
      actorSetAnimState: mockActorSetAnimState,
      playerSetAnimState: jest.fn(),
      getActorById: () => ({ id: "actor1" }),
      sprites,
    }
  );
  expect(mockActorSetAnimState).toBeCalledWith(0);
});

test("Should fall through to the player when actorId is $self$ on a scene script", () => {
  const mockActorSetAnimState = jest.fn();
  const mockPlayerSetAnimState = jest.fn();
  compile(
    {
      actorId: "$self$",
      spriteSheetId: "base",
      stateId: "state-walk",
    },
    {
      actorSetActive: jest.fn(),
      actorSetAnimState: mockActorSetAnimState,
      playerSetAnimState: mockPlayerSetAnimState,
      getActorById: () => undefined,
      sprites,
    }
  );
  // "state-walk" is animStates[0] -> index 0 + 1 = 1
  expect(mockPlayerSetAnimState).toBeCalledWith(1);
  expect(mockActorSetAnimState).not.toBeCalled();
});
