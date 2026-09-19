// Ported near-verbatim from GB Studio 3.2.1's src/shared/lib/rpn/shuntingYard.ts.
import {
  getAssociativity,
  getPrecedence,
  getArgsLen,
  ASSOCIATIVITY_LEFT,
  ASSOCIATIVITY_RIGHT,
} from "./helpers";

const shuntingYard = input => {
  if (input.length === 0) {
    throw new Error("Input was empty");
  }

  const output = [];
  const operatorStack = [];
  const functionStack = [];

  let prevToken;

  for (const token of input) {
    // If the current Token is a value or a variable, put them into the output stream.
    if (token.type === "VAL" || token.type === "VAR") {
      output.push(token);
      prevToken = token;
      continue;
    }

    // If the current Token is a function, put it onto the operator stack.
    if (token.type === "FUN") {
      operatorStack.push(token);
      functionStack.push(token);
      prevToken = token;
      continue;
    }

    /*
     *  If the current Token is a function argument separator, pop operators
     *  to output stream until a left brace is encountered.
     */
    if (token.type === "SEPERATOR") {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type !== "LBRACE"
      ) {
        const stackTail = operatorStack.pop();
        if (stackTail) {
          output.push(stackTail);
        }
      }
      if (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type !== "LBRACE"
      ) {
        throw new Error("Misplaced separator or mismatched parenthesis.");
      }
      functionStack.push(token);
      prevToken = token;
      continue;
    }

    /*
     * If the current token is an operator and it's priority is lower than the priority of the last
     * operator in the operator buffer, than put the operators from the operator buffer into the output
     * stream until you find an operator with a priority lower or equal as the current tokens.
     * Then add the current Token to the operator buffer.
     */
    if (token.type === "OP") {
      while (
        operatorStack.length > 0 &&
        ((getAssociativity(token) === ASSOCIATIVITY_LEFT &&
          getPrecedence(token) <=
            getPrecedence(operatorStack[operatorStack.length - 1])) ||
          (getAssociativity(token) === ASSOCIATIVITY_RIGHT &&
            getPrecedence(token) <
              getPrecedence(operatorStack[operatorStack.length - 1])))
      ) {
        const stackTail = operatorStack.pop();
        if (stackTail) {
          output.push(stackTail);
        }
      }
      operatorStack.push(token);
      prevToken = token;
      continue;
    }

    // If the current Token is a left brace, put it on the operator buffer.
    if (token.type === "LBRACE") {
      if (prevToken && prevToken.type === "VAR") {
        throw new Error(`${prevToken.symbol}() is not a function`);
      }
      if (prevToken && prevToken.type === "VAL") {
        throw new Error(`${prevToken.value}() is not a function`);
      }
      operatorStack.push(token);
      prevToken = token;
      continue;
    }

    // If the current Token is a right brace, empty the operator buffer until you find a left brace.
    if (token.type === "RBRACE") {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type !== "LBRACE"
      ) {
        const stackTail = operatorStack.pop();
        if (stackTail) {
          output.push(stackTail);
        }
      }

      // Expect next token on stack to be left parenthesis and pop it
      if (
        operatorStack.length === 0 ||
        (operatorStack.pop() || {}).type !== "LBRACE"
      ) {
        throw new Error("Mismatched parenthesis.");
      }

      // If the token at the top of the stack is a function token, pop it onto the output queue.
      if (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type === "FUN"
      ) {
        const stackTail = operatorStack.pop();
        if (stackTail) {
          output.push(stackTail);
        }

        // Check number of args is correct
        let numArgs = 1;
        while (
          functionStack.length > 0 &&
          functionStack[functionStack.length - 1].type !== "FUN"
        ) {
          functionStack.pop();
          numArgs++;
        }

        if (
          stackTail &&
          stackTail.type === "FUN" &&
          numArgs !== getArgsLen(stackTail.function)
        ) {
          throw new Error(
            `Unexpected number of args passed to function "${
              stackTail.function
            }". Found ${numArgs} but expected ${getArgsLen(
              stackTail.function
            )}`
          );
        }
        functionStack.pop();
      }
    }
    prevToken = token;
  }

  /*
   * When the algorithm reaches the end of the input stream, we add the
   * tokens in the operatorBuffer to the outputStream. If the operator
   * on top of the stack is a parenthesis, there are mismatched parenthesis.
   */
  while (operatorStack.length > 0) {
    if (
      operatorStack[operatorStack.length - 1].type === "LBRACE" ||
      operatorStack[operatorStack.length - 1].type === "RBRACE"
    ) {
      throw new Error("Mismatched parenthesis.");
    }
    const stackTail = operatorStack.pop();
    if (stackTail) {
      output.push(stackTail);
    }
  }

  return output;
};

export default shuntingYard;
