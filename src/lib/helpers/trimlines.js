const LINE_MAX = 4;
const LINE_MIN = 2;
const CHARS_PER_LINE = 18;
const CHARS_MAX_TOTAL = 18 + 18 + 16;

export const varRegex = new RegExp("\\$[VLT]?[0-9]+\\$", "g");
export const varCharRegex = new RegExp("#[VLT]?[0-9]+#", "g");
export const commandRegex = new RegExp("\\!S[0-5]\\!", "g");
export const newlineRegex = new RegExp("\n", "g");

export const dummyText = (text) => {
  return text
    .replace(varRegex, "$$$$$")
    .replace(varCharRegex, "#")
    .replace(commandRegex, "");
};

// v4 (user-asked): GB Studio 3.x's real inline typewriter-speed shorthand
// (!S0!..!S5!, src/lib/fonts/lexText.ts in the real gb-studio-3.2.1
// reference) - commandRegex above already existed on this fork purely to
// exclude it from trimlines' own line-wrap character counting (ported
// alongside trimlines itself), but nothing ever actually implemented the
// feature: a literal "!S3!" compiled straight through to the ROM string
// table and rendered as 4 garbage characters. This must run AFTER
// trimlines()/lineLength() have done their own wrap math using the regex
// above - once a match is turned into raw control bytes here it no longer
// matches `!S[0-5]!` for anything downstream to exclude.
//
// Encodes each match as 2 raw bytes: 0x01 (a control-byte sentinel ui.c's
// ui_reveal_char() recognises - never a printable character, so it can't
// collide with real dialogue text) followed by (speed + 1). The +1 offset
// matters, not just a convention carried over from B: ui.c's ui_subst()
// treats a literal 0x00 byte as the string terminator (it's a plain C
// string), so speed 0 has to encode as byte 1, or the string would
// silently truncate right there - matches B's own real textCodeSetSpeed()
// (`\\001\\${speed + 1}`), which has the identical reason to avoid it.
export const encodeTextSpeedCodes = (text) =>
  text.replace(commandRegex, (match) => {
    const speed = Number(match[2]);
    return String.fromCharCode(1, speed + 1);
  });

export const lineLength = (line) => {
  return line
    .replace(varRegex, "255")
    .replace(varCharRegex, "C")
    .replace(commandRegex, "").length;
};

export const totalLength = (line) => {
  return line
    .replace(newlineRegex, "")
    .replace(varRegex, "255")
    .replace(varCharRegex, "C")
    .replace(commandRegex, "").length;
};

const cropLine = (line, maxLength) => {
  const len = lineLength(line);
  if (len <= maxLength) {
    return line;
  }
  const lenDiff = len - maxLength;
  const cropped = line.substring(0, line.length - lenDiff);
  return cropLine(cropped, maxLength);
};

const trimlines = (
  string,
  maxCharsPerLine = CHARS_PER_LINE,
  maxLines = LINE_MAX,
  maxTotal = CHARS_MAX_TOTAL
) => {
  let lengthCount = 0;

  return (
    string
      .split("\n")
      .map((line, lineIndex) => {

        // Include whole line if under limits
        if (lineLength(line) <= maxCharsPerLine) {
          return line;
        }

        let cropped = line;
        // If not last line
        if (lineIndex < maxLines - 1) {
          // Crop to last space if possible
          if (cropped.indexOf(" ") > -1) {
            while (cropped.indexOf(" " > -1)) {
              const lastBreakSymbol = cropped.lastIndexOf(" ");
              cropped = cropped.substring(0, lastBreakSymbol);
              if (lineLength(cropped) <= maxCharsPerLine) {
                return `${cropped}\n${trimlines(
                  line.substring(cropped.length + 1, line.length),
                  maxCharsPerLine,
                  maxLines
                )}`;
              }
            }
          }
        }

        // Fallback to just cropping the line to fit mid word
        return cropLine(line, maxCharsPerLine);
      })
      .join("\n")
      .split("\n")
      .map((line) => {
        lengthCount += lineLength(line);
        if (lengthCount > maxTotal) {
          const amountOver = lengthCount - maxTotal;
          return line.substring(0, line.length - amountOver);
        }
        return line;
      })
      .slice(0, maxLines)
      .join("\n")
      // Crop to max 80 characters used in C string buffer
      .substring(0, 80)
  );
};

export const textNumLines = (string) =>
  Math.max(LINE_MIN, (string || "").split("\n").length);

export default trimlines;
