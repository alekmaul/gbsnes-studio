// Ported near-verbatim from GB Studio 3.2.1's src/shared/lib/rpn/tokenizer.ts.
import {
  isFunctionSymbol,
  isNumeric,
  toNumber,
  isOperatorSymbol,
  isVariable,
} from "./helpers";

const identity = i => i;

const tokenizer = input => {
  return input
    .replace(/\s+/g, "")
    .split(/(==|!=|>=|>|<=|<|&&|\|\||[+\-*/^%&|~@(),])/)
    .filter(identity)
    .map(token => {
      if (isNumeric(token)) {
        return {
          type: "VAL",
          value: toNumber(token),
        };
      }
      if (isFunctionSymbol(token)) {
        return {
          type: "FUN",
          function: token,
        };
      }
      if (token === "(") {
        return {
          type: "LBRACE",
        };
      }
      if (token === ")") {
        return {
          type: "RBRACE",
        };
      }
      if (token === ",") {
        return {
          type: "SEPERATOR",
        };
      }
      if (isOperatorSymbol(token)) {
        return {
          type: "OP",
          operator: token,
        };
      }
      if (isVariable(token)) {
        return {
          type: "VAR",
          symbol: token,
        };
      }
      throw new Error(`Unexpected token ${token}`);
    })
    .filter(identity)
    .map((token, i, tokens) => {
      // Handle unary negation
      if (token.type === "OP" && token.operator === "-") {
        if (i === 0) {
          return [
            {
              type: "VAL",
              value: 0,
            },
            {
              type: "OP",
              operator: "-",
            },
          ];
        }
        const previous = tokens[i - 1];
        if (
          previous.type === "LBRACE" ||
          (previous.type === "OP" && isOperatorSymbol(previous.operator))
        ) {
          return [
            {
              type: "VAL",
              value: 0,
            },
            {
              type: "OP",
              operator: "u",
            },
          ];
        }
      }
      return [token];
    })
    .flat();
};

export default tokenizer;
