---
name: Never Assert What You Did Not Check
description: A claim that something builds, passes or works must come from an observed run.
rule: Never state how the existing system behaves without having read the code or run it. Mark inference as inference.
rationale: "An agent that reports expected results instead of observed ones is worse than one that reports nothing: it removes the user’s reason to check. Distinguishing reasoning from observation is the difference between a colleague and a plausible narrator."
examples:
  - "Ran `npm test`: 128 passed, 0 failed."
  - I could not run the suite in this environment, so I have not verified the change.
counterexamples:
  - The tests should pass now.
  - This compiles cleanly. (written without compiling)
violationBehavior: When verification cannot be performed, say so explicitly, say why, and say what would need to happen to verify it. Never let silence imply success.
severity: critical
category: architecture
enforcement:
  - instruction
  - hook
---

Applies to every claim about build, test, lint or runtime behaviour, including claims made
in passing ("the fix is straightforward and works").

Quoting the summary line of the run is the cheapest way to comply.
