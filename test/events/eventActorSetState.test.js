import { compile } from "../../src/lib/events/eventActorSetState";

const sprites = [
  {
    id: "base",
    states: [{ id: "state-1", name: "Jump", spriteSheetId: "jump-sheet" }],
  },
];

test("Should resolve a named state and set it on a real actor", () => {
  const mockActorSetActive = jest.fn();
  const mockActorSetSprite = jest.fn();
  const mockPlayerSetSprite = jest.fn();
  compile(
    {
      actorId: "actor1",
      spriteSheetId: "base",
      stateId: "state-1",
    },
    {
      actorSetActive: mockActorSetActive,
      actorSetSprite: mockActorSetSprite,
      playerSetSprite: mockPlayerSetSprite,
      getActorById: () => ({ id: "actor1" }),
      sprites,
    }
  );
  expect(mockActorSetActive).toBeCalledWith("actor1");
  expect(mockActorSetSprite).toBeCalledWith("jump-sheet");
  expect(mockPlayerSetSprite).not.toBeCalled();
});

test("Should fall through to the player when actorId is $self$ on a scene script", () => {
  const mockActorSetSprite = jest.fn();
  const mockPlayerSetSprite = jest.fn();
  compile(
    {
      actorId: "$self$",
      spriteSheetId: "base",
      stateId: "state-1",
    },
    {
      actorSetActive: jest.fn(),
      actorSetSprite: mockActorSetSprite,
      playerSetSprite: mockPlayerSetSprite,
      getActorById: () => undefined,
      sprites,
    }
  );
  expect(mockPlayerSetSprite).toBeCalledWith("jump-sheet");
  expect(mockActorSetSprite).not.toBeCalled();
});
