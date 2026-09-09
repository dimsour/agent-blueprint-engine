---
name: Keep Tests Deterministic
description: A test gives the same answer every run.
rule: Never write a test that depends on wall-clock time, real network access, random values, test ordering or shared mutable state.
rationale: "A flaky test teaches the team to ignore failures, which costs more than having no test: the suite becomes noise and real regressions pass through it."
examples:
  - Injecting a fixed clock instead of reading the current time.
counterexamples:
  - Retrying a test three times until it passes.
violationBehavior: If a behaviour genuinely cannot be tested deterministically, isolate it in a separate suite that is not part of the gate, and say why.
category: testing
---
