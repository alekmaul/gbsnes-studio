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

describe("editor pre-wrap (updateFn/postUpdate) - target-aware (M9)", () => {
  // A string this long only fits GB's 18-char lines (no natural spaces to
  // break on), so the two targets visibly wrap differently.
  const longLine = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  test("undefined target falls back to gb (byte-identical to before M9)", () => {
    const wrapped = textField.updateFn(longLine, textField, {});
    expect(wrapped.split("\n")[0].length).toBe(18);
  });

  test("gb target wraps at 18 chars/line, 16 with an avatar", () => {
    expect(
      textField.updateFn(longLine, textField, {}, "gb").split("\n")[0].length
    ).toBe(18);
    expect(
      textField
        .updateFn(longLine, textField, { avatarId: "1" }, "gb")
        .split("\n")[0].length
    ).toBe(16);
  });

  test("snes target wraps at 27 chars/line, 23 with an avatar", () => {
    expect(
      textField.updateFn(longLine, textField, {}, "snes").split("\n")[0]
        .length
    ).toBe(27);
    expect(
      textField
        .updateFn(longLine, textField, { avatarId: "1" }, "snes")
        .split("\n")[0].length
    ).toBe(23);
  });

  test("postUpdate (toggling the avatar) re-wraps using the same target-aware limits", () => {
    const args = { text: longLine, avatarId: "1" };
    const gbResult = avatarField.postUpdate(args, {}, "gb");
    expect(gbResult.text.split("\n")[0].length).toBe(16);
    const snesResult = avatarField.postUpdate(args, {}, "snes");
    expect(snesResult.text.split("\n")[0].length).toBe(23);
  });
});
