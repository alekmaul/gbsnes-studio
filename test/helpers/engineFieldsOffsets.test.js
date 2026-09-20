/* eslint-disable camelcase */
// Guards the coupling engine_fields.h's own top comment calls out: its
// hand-written macro offsets (and ENGINE_FIELDS_SIZE) must match what
// precompileEngineFields() (src/lib/helpers/engineFields.ts) really computes
// from the current appData/src/snes/engine.json - the same offset the
// runtime ENGINE_FIELD_UPDATE/STORE opcodes (script_cmds.c) are compiled
// against. If engine.json's field list/order ever changes without updating
// engine_fields.h by hand, this test catches the drift instead of it
// silently corrupting a neighbouring field's storage in the compiled ROM.
const fs = require("fs");
const path = require("path");
const { precompileEngineFields } = require("../../src/lib/helpers/engineFields");
const { engineRoot } = require("../../src/consts");

const engineJsonPath = path.join(engineRoot, "snes", "engine.json");
const engineFieldsHPath = path.join(engineRoot, "snes", "src", "engine_fields.h");

test("engine_fields.h's macro offsets match precompileEngineFields(engine.json)", () => {
  const schema = JSON.parse(fs.readFileSync(engineJsonPath, "utf8")).fields || [];
  const expected = precompileEngineFields(schema);
  const header = fs.readFileSync(engineFieldsHPath, "utf8");

  const sizeMatch = header.match(/#define ENGINE_FIELDS_SIZE (\d+)/);
  expect(sizeMatch).not.toBeNull();
  const declaredSize = Number(sizeMatch[1]);

  let computedSize = 0;
  Object.values(expected).forEach(({ offset, field }) => {
    const is16Bit = field.cType === "UWORD" || field.cType === "WORD";
    const macroRegex = is16Bit
      ? new RegExp(
          `#define ${field.key}\\s+\\(\\*\\(s16 \\*\\)&engine_fields_raw\\[(\\d+)\\]\\)`
        )
      : new RegExp(`#define ${field.key}\\s+\\(engine_fields_raw\\[(\\d+)\\]\\)`);
    const match = header.match(macroRegex);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBe(offset);

    const size = is16Bit ? 2 : 1;
    computedSize = Math.max(computedSize, offset + size);
  });

  expect(declaredSize).toBe(computedSize);
});
