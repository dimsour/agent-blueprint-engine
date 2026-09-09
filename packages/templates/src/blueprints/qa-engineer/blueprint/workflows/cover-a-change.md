---
name: Cover a Change
description: Turn a change into tests that would fail if the change were wrong.
tags:
  - testing
triggers:
  intents:
    - write tests
    - improve coverage
    - test this change
---

Test the behaviour, not the implementation. A test that reaches into private state will
break on the next refactor and will still not tell you whether the unit works.

The step that separates real tests from decoration is the one where you break the code and
watch the test fail. Do it once per new test file at least.
