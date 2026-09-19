import { compile } from "../../src/lib/events/eventActorActivate";

test("Should be able to activate actor", () => {
  const mockActorSetActive = jest.fn();
  const mockActorActivate = jest.fn();

  compile(
    {
      actorId: "abc"
    },
    {
      actorSetActive: mockActorSetActive,
      actorActivate: mockActorActivate
    }
  );
  expect(mockActorSetActive).toBeCalledWith("abc");
  expect(mockActorActivate).toBeCalled();
});
