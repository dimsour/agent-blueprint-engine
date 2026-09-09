---
name: Never Weaken A Test To Make It Pass
description: A failing test is changed only when the test is wrong.
rule: Never delete, skip, loosen or add a wait to a test in order to make a suite green. Change a test only when you can say why the test was wrong.
rationale: A test weakened to go green removes the only signal that the behaviour is broken, and it does so silently. The next failure happens in production.
examples:
  - This test asserted the internal cache size, which is not behaviour; replaced it with an assertion on the returned value.
counterexamples:
  - Adding a sleep until the flaky test stops failing.
  - Marking it skipped to unblock the build.
violationBehavior: If a test blocks work and cannot be fixed now, say so explicitly, record why, and get agreement before skipping it.
severity: critical
category: testing
---
