import { Dictionary } from "@reduxjs/toolkit";
import {
  EngineFieldCType,
  EngineFieldSchema,
} from "../../store/features/engine/engineState";

interface PrecompiledEngineField {
  offset: number;
  field: EngineFieldSchema;
}

export const precompileEngineFields = (
  engineFields: EngineFieldSchema[]
): Dictionary<PrecompiledEngineField> => {
  let offset = 0;
  const offsets: Dictionary<PrecompiledEngineField> = {};
  for (let engineField of engineFields) {
    // "define" fields (button remapping - INPUT_PLATFORM_JUMP etc.) are a
    // compile-time #define, not a runtime-readable byte in
    // engine_fields_raw[] - they have no offset at all, matching GB
    // Studio's own real schema (same cType, same reason). Skipping them
    // here, not just at the call sites, keeps every *other* field's offset
    // correct regardless of where a "define" field sits in engine.json's
    // own list order.
    if (engineField.cType === "define") {
      continue;
    }
    offsets[engineField.key] = {
      offset,
      field: engineField,
    };
    if (is16BitCType(engineField.cType)) {
      offset += 2;
    } else {
      offset += 1;
    }
  }
  return offsets;
};

export const is16BitCType = (cType: EngineFieldCType): boolean => {
  return cType === "WORD" || cType === "UWORD";
};

export const minForCType = (cType: EngineFieldCType): number => {
  if (cType === "WORD") {
    return -32768;
  }
  if (cType === "BYTE") {
    return -128;
  }
  return 0;
};

export const maxForCType = (cType: EngineFieldCType): number => {
  if (cType === "UWORD") {
    return 65535;
  }
  if (cType === "WORD") {
    return 32767;
  }
  if (cType === "BYTE") {
    return 127;
  }
  return 255;
};

export const clampToCType = (
  value: number,
  cType: EngineFieldCType
): number => {
  const min = minForCType(cType);
  const max = maxForCType(cType);
  return Math.max(min, Math.min(max, value));
};
