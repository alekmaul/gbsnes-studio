import { compile } from "../../src/lib/events/eventActorDeactivate";

test("Should be able to deactivate actor", () => {
  const mockActorSetActive = jest.fn();
  const mockActorDeactivate = jest.fn();

  compile(
    {
      actorId: "abc"
    },
    {
      actorSetActive: mockActorSetActive,
      actorDeactivate: mockActorDeactivate
    }
  );
  expect(mockActorSetActive).toBeCalledWith("abc");
  expect(mockActorDeactivate).toBeCalled();
});
