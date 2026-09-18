import { compile, fields } from "../../src/lib/events/eventTextDialogue";

const textField = fields.find((f) => f.key === "text");
const avatarField = fields.find((f) => f.key === "avatarId");

test("Should be able to display text", () => {
  const mockTextDialogue = jest.fn();

  compile(
    {
      text: "Hello World",
      avatarId: "1"
    },
    {
      textDialogue: mockTextDialogue
    }
  );
  expect(mockTextDialogue).toBeCalledWith("Hello World", "1");
});

test("Should be able to display multiple text boxes", () => {
  const mockTextDialogue = jest.fn();
  const mockTextSetOpenInstant = jest.fn();
  const mockTextSetCloseInstant = jest.fn();
  const mockTextRestoreOpenSpeed = jest.fn();
  const mockTextRestoreCloseSpeed = jest.fn();

  compile(
    {
      text: ["Hello World", "Goodbye World"],
      avatarId: "1"
    },
    {
      textDialogue: mockTextDialogue,
      textSetOpenInstant: mockTextSetOpenInstant,
      textSetCloseInstant: mockTextSetCloseInstant,
      textRestoreOpenSpeed: mockTextRestoreOpenSpeed,
      textRestoreCloseSpeed: mockTextRestoreCloseSpeed
    }
  );
  expect(mockTextSetCloseInstant).toHaveBeenCalledBefore(mockTextDialogue);
  expect(mockTextRestoreCloseSpeed).toHaveBeenCalledAfter(mockTextDialogue);
  expect(mockTextSetOpenInstant).toHaveBeenCalledAfter(mockTextDialogue);
  expect(mockTextRestoreOpenSpeed).toHaveBeenCalledAfter(mockTextDialogue);
  expect(mockTextDialogue.mock.calls.length).toBe(2);
  expect(mockTextDialogue).toBeCalledWith("Hello World", "1");
  expect(mockTextDialogue).toBeCalledWith("Goodbye World", "1");
});

describe("editor pre-wrap (updateFn/postUpdate)", () => {
  // A string this long has no natural spaces to break on, so it always
  // wraps at exactly the target's char-per-line limit.
  const longLine = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  test("wraps at 27 chars/line, 23 with an avatar", () => {
    expect(
      textField.updateFn(longLine, textField, {}).split("\n")[0].length
    ).toBe(27);
    expect(
      textField
        .updateFn(longLine, textField, { avatarId: "1" })
        .split("\n")[0].length
    ).toBe(23);
  });

  test("postUpdate (toggling the avatar) re-wraps using the same limits", () => {
    const args = { text: longLine, avatarId: "1" };
    const result = avatarField.postUpdate(args, {});
    expect(result.text.split("\n")[0].length).toBe(23);
  });
});
