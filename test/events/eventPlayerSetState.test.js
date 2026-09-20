import { compile } from "../../src/lib/events/eventPlayerSetState";

test("Should resolve a named state to its target sprite sheet", () => {
  const mockPlayerSetSprite = jest.fn();
  compile(
    {
      spriteSheetId: "base",
      stateId: "state-1",
      persist: false,
    },
    {
      playerSetSprite: mockPlayerSetSprite,
      sprites: [
        {
          id: "base",
          states: [
            { id: "state-1", name: "Jump", spriteSheetId: "jump-sheet" },
          ],
        },
      ],
    }
  );
  expect(mockPlayerSetSprite).toBeCalledWith("jump-sheet", false);
});

test("Should fall back to the sheet itself for an unmatched/default state", () => {
  const mockPlayerSetSprite = jest.fn();
  compile(
    {
      spriteSheetId: "base",
      stateId: "",
      persist: true,
    },
    {
      playerSetSprite: mockPlayerSetSprite,
      sprites: [
        {
          id: "base",
          states: [
            { id: "state-1", name: "Jump", spriteSheetId: "jump-sheet" },
          ],
        },
      ],
    }
  );
  expect(mockPlayerSetSprite).toBeCalledWith("base", true);
});
