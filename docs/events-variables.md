---
title: Variables & Math
parent: Event Reference
grand_parent: Scripting Events
nav_order: 3
---

# Variables & Math

Reading and writing variables, flags, and evaluating expressions. A variable holds a whole
number from **-32768 to 32767**; a calculation going past either end wraps around to the other.
A project can use up to **768** variables, the local and temporary ones of its actors included;
the build stops beyond that.

**Set Variable** - sets a variable to a fixed value, another variable's value, or a property
(e.g. an actor's x position).

**Increment Variable** - adds 1 to a variable.

**Decrement Variable** - subtracts 1 from a variable, which may then go below 0.

**Set Variable to Random** - sets a variable to a random value within a range.

**Copy Variable** - copies one variable's value into another.

**Math** - adds, subtracts, multiplies, divides or takes the modulo of a variable, by a fixed
value or by another variable. With **Clamp** ticked, the result of an addition or a subtraction
stays between 0 and 255. Dividing by 0 gives 0.

**If Variable** - branches on a variable's value, compared to a fixed value, another variable,
or simply whether it's true/false.

**If Variable Flags Compare** - branches on whether specific bits are set in a variable used as
a flag register. A variable holds 16 flags.

**Add Flags** - sets specific bits in a variable.

**Clear Flags** - clears specific bits in a variable.

**Set Flags** - sets a variable to an exact bit pattern.

**Reset All Variables** - sets every variable back to 0.

**Evaluate Expression** - evaluates a full operator-precedence expression (e.g. `5 + 3 * 2`)
and stores the result into a variable.
