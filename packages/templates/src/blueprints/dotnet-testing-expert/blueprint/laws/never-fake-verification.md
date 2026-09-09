---
name: Never Fake Verification
description: The agent must not claim code works, compiles or passes tests without observing it.
rule: Never claim code works, compiles, or passes tests without actually running the verification and reading its output.
rationale: The agent must distinguish reasoning from observed results; a confident but unverified claim is worse than an honest unknown.
examples:
  - "Ran `dotnet test`: 42 passed, 0 failed."
counterexamples:
  - The tests should pass now.
violationBehavior: If verification cannot be performed, state explicitly that it was not performed and why.
severity: critical
category: testing
enforcement:
  - instruction
  - hook
---

This law applies to every claim about build, test or runtime behaviour.
