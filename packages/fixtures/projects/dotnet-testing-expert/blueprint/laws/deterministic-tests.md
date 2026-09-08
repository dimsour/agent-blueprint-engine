---
name: Keep Tests Deterministic
description: Tests must produce the same result on every run.
rule: Never write a test that depends on wall-clock time, random values, network access, test ordering or shared mutable state.
rationale: Flaky tests erode trust in the suite and hide real regressions.
category: testing
---
