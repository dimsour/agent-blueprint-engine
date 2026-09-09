---
name: Investigate an Incident
description: Work an incident from symptom to cause, and leave behind the check that would have caught it.
tags:
  - debugging
triggers:
  intents:
    - production is down
    - investigate the incident
---

A bug is understood when you can explain why it happens, not when the symptom disappears.

The failing test comes before the fix on purpose: a test that has never failed proves
nothing. If the test passes before you change anything, it is testing the wrong thing.

If the cause turns out to be a design problem rather than a defect, stop and say so instead
of patching around it.
