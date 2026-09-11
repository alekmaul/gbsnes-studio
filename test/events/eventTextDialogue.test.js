import { compile, fields } from "../../src/lib/events/eventTextDialogue";

const textField = fields.find(f => f.key === "text");
const avatarField = fields.find(f => f.key === "avatarId");

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

// User-found: a SNES project's text box editor stayed wrapped at the GB's
// 18/16-char width, wasting most of the wider 32-tile screen. updateFn /
// postUpdate return a single "\n"-joined string (trimlines' own shape), not
// an array.
describe("text field wrap width is target-aware", () => {
  // 22 chars: over the GB width (18) but fits the SNES width (27) whole
  const line = "Hello there adventurer";

  test("wraps at the GB width (18 chars, no avatar) when target is gb/undefined", () => {
    const gbWrapped = textField.updateFn(line, textField, {}, "gb");
    const defaultWrapped = textField.updateFn(line, textField, {}, undefined);
    expect(gbWrapped).toBe(defaultWrapped);
    expect(gbWrapped.split("\n")).toEqual(["Hello there", "adventurer"]);
  });

  test("wraps at the SNES width (27 chars, no avatar) - fits on one line", () => {
    const snesWrapped = textField.updateFn(line, textField, {}, "snes");
    expect(snesWrapped.split("\n")).toEqual([line]);
  });

  test("the avatar portrait narrows the width on both targets, still target-aware", () => {
    const avatarLine = "This message needs the avatar width to wrap";
    const gbWrapped = avatarField.postUpdate(
      { text: avatarLine, avatarId: "1" },
      "gb"
    );
    const snesWrapped = avatarField.postUpdate(
      { text: avatarLine, avatarId: "1" },
      "snes"
    );
    const gbLines = gbWrapped.text.split("\n");
    const snesLines = snesWrapped.text.split("\n");
    expect(Math.max(...gbLines.map(l => l.length))).toBeLessThanOrEqual(16);
    expect(Math.max(...snesLines.map(l => l.length))).toBeLessThanOrEqual(23);
    // the SNES line keeps more of the original text before truncating
    expect(snesLines.join(" ").length).toBeGreaterThan(gbLines.join(" ").length);
  });
});
