// M5 (v4): real (non-mocked) pipeline check that EVENT_ACTOR_EMOTE resolves
// a real Emote entity id to its compiled sheet index via the actual event
// dispatch -> ScriptBuilder path, not just the isolated actorEmote() unit
// test in scriptBuilder.test.js.
import compileEntityEvents from "../../../src/lib/compiler/compileEntityEvents";
import {
  commandIndex as cmd,
  ACTOR_EMOTE,
} from "../../../src/lib/events/scriptCommands";

test("EVENT_ACTOR_EMOTE resolves a real emote entity to its compiled index", () => {
  const output = [];
  compileEntityEvents(
    [
      {
        command: "EVENT_ACTOR_EMOTE",
        args: { actorId: "$self$", emoteId: "emote-b" },
      },
    ],
    {
      output,
      variables: [],
      scene: { actors: [], triggers: [] },
      entity: { id: "actor1" },
      emotes: [{ id: "emote-a" }, { id: "emote-b" }, { id: "emote-c" }],
      warnings: () => {},
    }
  );
  // ACTOR_SET_ACTIVE(index) then ACTOR_EMOTE(1) - "emote-b" is index 1
  expect(output).toContain(cmd(ACTOR_EMOTE));
  const emoteOpIndex = output.indexOf(cmd(ACTOR_EMOTE));
  expect(output[emoteOpIndex + 1]).toBe(1);
});
