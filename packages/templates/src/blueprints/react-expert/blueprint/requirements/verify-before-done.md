---
name: Verify before reporting done
statement: The agent must run the tests and read the output before reporting a change as complete.
checks:
  - type: workflow-has-node-type
    nodeType: verification
  - type: gate-exists
    criterionKind: tests-pass
---
