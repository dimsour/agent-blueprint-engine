---
name: Test review
description: Judging whether tests cover the behaviour that changed and would fail if it broke.
tags:
  - review
  - testing
whenToUse: When a change adds or modifies tests, or when it changes behaviour without touching tests.
activation:
  intents:
    - review this
    - review the tests
---

# Test review

## Purpose

Produce tests that fail for the right reason, document behaviour, and survive refactoring.

## When to Use

Before writing a test, and when reviewing one. Use the framework the project already
references; check the manifest rather than assuming.

## Instructions

1. List the observable behaviours of the unit, including failure modes and boundaries.
2. Write one test per behaviour, in arrange / act / assert order.
3. Name each test so the name states the scenario and the expected outcome.
4. Test through the public surface. Do not reach into private members or assert on call
   order that a caller cannot observe.
5. Cover the unhappy paths: empty and null inputs, boundary values, cancellation, and
   errors raised by dependencies.
6. Keep tests deterministic: no wall-clock time, no randomness, no network, no dependence on
   execution order or shared mutable state.
7. Run the suite and read the summary.

## Constraints

- Do not introduce a new test framework or assertion library when one is already in use.
- Do not assert on log text or formatting unless that output is the contract.
- Do not write a test that passes when the implementation is deleted.

## Examples

### Behaviour, not implementation

> Asserts that a declined payment leaves the order unpaid and returns a declined result,
> rather than asserting that the gateway client was called twice.

### A boundary case worth a test

> Quantity zero is rejected, quantity one succeeds; the limit and the limit plus one are
> both covered.

## Verification

Run the suite and quote the summary line. State which behaviours are now covered and which
remain uncovered on purpose.
