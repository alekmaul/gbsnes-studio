import { compile } from "../../src/lib/events/eventActorSetState";

test("Should set the sprite state of an actor", () => {
  const actorSetActive = jest.fn();
  const actorSetState = jest.fn();

  compile(
    { actorId: "actor1", spriteStateId: "Jump" },
    { actorSetActive, actorSetState }
  );

  expect(actorSetActive).toHaveBeenCalledWith("actor1");
  expect(actorSetState).toHaveBeenCalledWith("Jump");
});
