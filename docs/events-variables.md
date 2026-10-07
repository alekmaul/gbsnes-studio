---
title: Variables & Math
parent: Event Reference
grand_parent: Scripting Events
nav_order: 3
---

# Variables & Math

Reading and writing variables, flags, and evaluating expressions. Every variable is a single
byte (0-255).

**Set Variable** - sets a variable to a fixed value, another variable's value, or a property
(e.g. an actor's x position).

**Increment Variable** - adds 1 to a variable.

**Decrement Variable** - subtracts 1 from a variable.

**Set Variable to Random** - sets a variable to a random value within a range.

**Copy Variable** - copies one variable's value into another.

**Math** - adds, subtracts, multiplies, divides or takes the modulo of a variable, by a fixed
value or by another variable.

**If Variable** - branches on a variable's value, compared to a fixed value, another variable,
or simply whether it's true/false.

**If Variable Flags Compare** - branches on whether specific bits are set in a variable used as
a flag register.

**Add Flags** - sets specific bits in a variable.

**Clear Flags** - clears specific bits in a variable.

**Set Flags** - sets a variable to an exact bit pattern.

**Reset All Variables** - sets every variable back to 0.

**Evaluate Expression** - evaluates a full operator-precedence expression (e.g. `5 + 3 * 2`)
and stores the result into a variable.
