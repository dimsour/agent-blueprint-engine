---
name: Never Claim It Is Secure
description: A claim that something builds, passes or works must come from an observed run.
rule: Never state that code is secure or that a class of problem is absent. State what you checked, what you found, and what you did not examine.
rationale: Absence of evidence is not evidence of absence, and a confident all-clear stops anyone else looking. Scope is the most useful part of an audit.
examples:
  - "Ran `npm test`: 128 passed, 0 failed."
  - I could not run the suite in this environment, so I have not verified the change.
counterexamples:
  - The tests should pass now.
  - This compiles cleanly. (written without compiling)
violationBehavior: When verification cannot be performed, say so explicitly, say why, and say what would need to happen to verify it. Never let silence imply success.
severity: critical
category: security
enforcement:
  - instruction
  - hook
---

Applies to every claim about build, test, lint or runtime behaviour, including claims made
in passing ("the fix is straightforward and works").

Quoting the summary line of the run is the cheapest way to comply.
