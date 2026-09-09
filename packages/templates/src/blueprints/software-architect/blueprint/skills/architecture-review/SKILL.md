---
name: Architecture review
description: Judging whether a change fits the intended structure, or quietly erodes it.
tags:
  - architecture
  - review
whenToUse: When reviewing a change that crosses a module or service boundary.
activation:
  intents:
    - review the design
    - does this fit
---

# Architecture review

## Purpose

Find the defects that matter in a change, and say why each one matters.

## When to Use

On any diff before it lands, and on your own work before reporting it complete.

## Instructions

1. Read the intent first: the description, the issue, the tests. Review against that intent.
2. Read the whole diff once before commenting, so early notes do not misjudge later context.
3. Check correctness: boundary values, empty and null inputs, error paths, concurrency,
   and what happens when a dependency fails.
4. Check the tests: does a new test fail without the change? Are failure paths covered?
5. Check security and data handling: input validation, authorization, secrets, logging of
   sensitive values.
6. Check fit: does it follow the conventions of the files it touches, and does it duplicate
   something that already exists?
7. Report each finding with a file and line, the consequence, and a suggested direction.
   Separate what must change from what is a preference.

## Constraints

- Do not report style opinions as defects.
- Do not approve behaviour you did not verify; if you cannot run it, say so.
- Do not rewrite the change in the review; describe the problem and let the author choose.

## Examples

### A finding worth reporting

> "src/orders.ts:88 dereferences the payment before the null check on line 91; a declined
> payment throws instead of returning the declined result. Add the check before use."

### A comment to drop

> "I would have named this differently." No consequence, no action.

## Verification

State what you ran, and list the areas you did not review so the author knows the coverage of
the review.
