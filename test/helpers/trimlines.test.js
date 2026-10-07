import trimlines, { encodeTextSpeedCodes } from "../../src/lib/helpers/trimlines";

test("shouldn't modify strings under line limit", () => {
  expect(trimlines("012345678901234567")).toBe("012345678901234567", 18);
});

test("should trim strings over line limit", () => {
  expect(trimlines("0123456789012345678")).toBe("012345678901234567", 18);
  expect(trimlines("01234567890123456789")).toBe("012345678901234567", 18);
});

test("should wrap words over limit onto new line", () => {
  expect(trimlines("0123456789012345 6789")).toBe("0123456789012345\n6789", 18);
});

test("should trim full string to 52 characters", () => {
  expect(
    trimlines("012345678901234567\n012345678901234567\n012345678901234567")
  ).toBe("012345678901234567\n012345678901234567\n0123456789012345", 18);
});

test("should keep cropped word on last line", () => {
  expect(
    trimlines("012345678901234567\n012345678901234567\n0123456789\n01 2345678901234567")
  ).toBe("012345678901234567\n012345678901234567\n0123456789\n01 234", 18);
});

test("should allow 52 characters to be distributed any way across the three lines", () => {
  // 18 / 18 / 16
  expect(
    trimlines("012345678901234567\n012345678901234567\n0123456789012345")
  ).toBe("012345678901234567\n012345678901234567\n0123456789012345", 18);

  // 16 / 18 / 18
  expect(
    trimlines("0123456789012345\n012345678901234567\n012345678901234567")
  ).toBe("0123456789012345\n012345678901234567\n012345678901234567", 18);

  // 17/ 17 / 18
  expect(
    trimlines("01234567890123456\n01234567890123456\n012345678901234567")
  ).toBe("01234567890123456\n01234567890123456\n012345678901234567", 18);
});

test("should allow 52 characters to be distributed any way across the four lines", () => {
  // 18 / 18 / 10 / 6
  expect(
    trimlines("012345678901234567\n012345678901234567\n0123456789\n012345")
  ).toBe("012345678901234567\n012345678901234567\n0123456789\n012345");

  // 2 / 14 / 18 / 18
  expect(
    trimlines("01\n01234567890123\n012345678901234567\n012345678901234567")
  ).toBe("01\n01234567890123\n012345678901234567\n012345678901234567");
});


test("should not include command codes in character limits", () => {
  expect(
    trimlines("Hello\nWorld", 5)
  ).toBe("Hello\nWorld");
  expect(
    trimlines("!S0!Hello\nWorld", 5)
  ).toBe("!S0!Hello\nWorld");
  expect(
    trimlines("!S0!HelloTa\nWorld", 5)
  ).toBe("!S0!Hello\nWorld");  
  expect(
    trimlines("!S0!!S0!!S0!!S0!!S0!!S0!!S0!HelloTa\nWorld", 5)
  ).toBe("!S0!!S0!!S0!!S0!!S0!!S0!!S0!Hello\nWorld"); 
  expect(
    trimlines("Hello!S5!\nWorld", 5)
  ).toBe("Hello!S5!\nWorld"); 
});

test("should treat variables as length=3 in character limits", () => {
  expect(
    trimlines("$L0$Hello\nWorld", 5)
  ).toBe("$L0$He\nWorld");  
  expect(
    trimlines("He$L0$\nWorld", 5)
  ).toBe("He$L0$\nWorld");    
  expect(
    trimlines("Hello$L0$\nWorld", 5)
  ).toBe("Hello\nWorld");   
});

test("should treat variable characters as length=1 in character limits", () => {
  expect(
    trimlines("#L0#Hello\nWorld", 5)
  ).toBe("#L0#Hell\nWorld");  
  expect(
    trimlines("Hello#L0#\nWorld", 5)
  ).toBe("Hello\nWorld");   
  expect(
    trimlines("Hell#L0#\nWorld", 5)
  ).toBe("Hell#L0#\nWorld");   
});

test("should treat variables as length=3 in total limits", () => {
  expect(
    trimlines("$L0$Hello\nWorld", 5, 1)
  ).toBe("$L0$He");  
  expect(
    trimlines("He$L0$\nWorld", 5, 1)
  ).toBe("He$L0$");    
  expect(
    trimlines("Hello$L0$\nWorld", 5, 1)
  ).toBe("Hello");   
});

test("should treat variable characters as length=1 in total limits", () => {
  expect(
    trimlines("HelloWorld", 5, 1)
  ).toBe("Hello");
  expect(
    trimlines("#L0#HelloWorld", 5, 1)
  ).toBe("#L0#Hell"); 
  expect(
    trimlines("01234567890123456#L0#\n01234567890123456#L0#\n012345678901234#L0#67")
  ).toBe("01234567890123456#L0#\n01234567890123456#L0#\n012345678901234#L0#", 18);
});

// v4 fix (user-asked): !S0!..!S5! was recognised by trimlines' own
// commandRegex (for line-wrap math, tested above) but never actually
// implemented - a literal "!S3!" compiled straight to the ROM string table
// and rendered as 4 garbage characters. encodeTextSpeedCodes (called from
// scriptBuilder.js's textDialogue, after trimlines - see that call site's
// own comment) turns each match into the 2 raw bytes ui.c's
// ui_reveal_char() now understands: a 0x01 sentinel + (speed + 1), the +1
// so a speed-0 code never embeds a literal 0x00 (the C string terminator
// ui_subst() looks for).
describe("encodeTextSpeedCodes (v4 fix)", () => {
  test("replaces a speed code with 2 raw bytes: 0x01 sentinel + speed + 1", () => {
    const out = encodeTextSpeedCodes("Hi!S3!there");
    expect(out).toBe(`Hi${String.fromCharCode(1, 4)}there`);
    expect(out.charCodeAt(2)).toBe(1);
    expect(out.charCodeAt(3)).toBe(4);
  });

  test("speed 0 encodes as byte 1, never a literal 0x00", () => {
    const out = encodeTextSpeedCodes("!S0!");
    expect(out.length).toBe(2);
    expect(out.charCodeAt(0)).toBe(1);
    expect(out.charCodeAt(1)).toBe(1);
  });

  test("speed 5 (the highest real value) encodes as byte 6", () => {
    const out = encodeTextSpeedCodes("!S5!");
    expect(out.charCodeAt(1)).toBe(6);
  });

  test("multiple codes in one string all get replaced", () => {
    const out = encodeTextSpeedCodes("!S1!Hello!S4!World");
    expect(out).toBe(
      `${String.fromCharCode(1, 2)}Hello${String.fromCharCode(1, 5)}World`
    );
  });

  test("text with no speed codes is unchanged", () => {
    expect(encodeTextSpeedCodes("Hello World")).toBe("Hello World");
  });
});

test("should allow trimming text to a single line using third arg", () => {
  expect(trimlines("Obsid$", 6, 1)).toBe("Obsid$");
  expect(trimlines("Obsid $", 6, 1)).toBe("Obsid ");
  expect(trimlines("Obsidian", 6, 1)).toBe("Obsidi");
  expect(trimlines("Obsi\n$", 6, 1)).toBe("Obsi");
  expect(trimlines("\n\n\n\n\n\n", 6, 1)).toBe("");
});
