import fs from "fs";
import Path from "path";
import { scriptCommands } from "../../../src/lib/events/scriptCommands";

const repo = Path.join(__dirname, "..", "..", "..");

// Pull the `{ handler, args_len }` rows out of the SNES engine's
// script_cmds[] table - an X-macro (struct field far-reads mis-index under
// 816-tcc, so the SNES engine splits fn / args_len into two parallel arrays
// generated from one #define SCRIPT_CMD_TABLE list):
//   X(Script_Foo_b, 3) /* 0x01 NAME */
const parseCmdTable = (source) => {
  const rows = [];
  let m;
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((l) => /#define\s+SCRIPT_CMD_TABLE/.test(l));
  const collected = [];
  for (let i = start; i < lines.length; i++) {
    collected.push(lines[i]);
    if (!/\\\s*$/.test(lines[i]) && i !== start) break;
  }
  const re = /X\(\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*(\d+)\s*\)\s*\/\*\s*0x[0-9A-Fa-f]+\s+([A-Z0-9_]+)/g;
  while ((m = re.exec(collected.join("\n"))) !== null) {
    rows.push({ argsLen: Number(m[1]), name: m[2] });
  }
  return rows;
};

const snesTable = parseCmdTable(
  fs.readFileSync(Path.join(repo, "appData/src/snes/src/script_cmds.c"), "utf8")
);

describe("SNES script_cmds[] opcode contract", () => {
  test("has one row per scriptCommands.js entry", () => {
    expect(snesTable.length).toBe(scriptCommands.length);
  });

  test("row comments match the scriptCommands.js order", () => {
    snesTable.forEach((row, i) => {
      expect(row.name).toBe(scriptCommands[i]);
    });
  });
});
