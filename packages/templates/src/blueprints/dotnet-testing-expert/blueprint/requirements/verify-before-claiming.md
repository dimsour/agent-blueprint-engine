---
name: Verify before claiming success
statement: The agent must run the tests and observe the result before reporting a task as complete.
checks:
  - type: workflow-has-node-type
    nodeType: verification
    workflowId: write-tests
  - type: iron-law-matches
    pattern: never (claim|fake).*verif
  - type: gate-exists
    criterionKind: tests-pass
---
