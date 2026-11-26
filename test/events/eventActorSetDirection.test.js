import { compile } from "../../src/lib/events/eventActorSetDirection";

test("Should set player direction", () => {
  const mockactorSetActive = jest.fn();
  const mockActorSetDirection = jest.fn();
  const mockGetActorById = jest.fn()

  compile(
    {
      actorId: "player",
      direction: {
        type: "direction",
        value: "up"
      }
    },
    {
      scene: { actors: [] },
      actorSetActive: mockactorSetActive,
      actorSetDirection: mockActorSetDirection,
      getActorById: mockGetActorById
    }
  );
  expect(mockactorSetActive).toBeCalledWith("player");
  expect(mockActorSetDirection).toBeCalledWith("up");
});

test("Should set actor direction", () => {
  const mockactorSetActive = jest.fn();
  const mockActorSetDirection = jest.fn();
  const mockGetActorById = jest.fn()

  compile(
    {
      actorId: "abc",
      direction: {
        type: "direction",
        value: "right"
      }
    },
    {
      scene: {
        actors: [
          {
            id: "abc"
          }
        ]
      },
      actorSetActive: mockactorSetActive,
      actorSetDirection: mockActorSetDirection,
      getActorById: mockGetActorById
    }
  );
  expect(mockactorSetActive).toBeCalledWith("abc");
  expect(mockActorSetDirection).toBeCalledWith("right");
});
