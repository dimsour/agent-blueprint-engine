---
name: Investigate a Failure
description: Find the cause of a defect and prove the fix with a test that failed first.
tags:
  - debugging
triggers:
  intents:
    - fix a bug
    - investigate a failure
---

A bug is understood when you can explain why it happens, not when the symptom disappears.

The failing test comes before the fix on purpose: a test that has never failed proves
nothing. If the test passes before you change anything, it is testing the wrong thing.

If the cause turns out to be a design problem rather than a defect, stop and say so instead
of patching around it.
