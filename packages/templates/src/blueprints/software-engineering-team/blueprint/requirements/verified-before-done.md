---
name: Verified before done
statement: The suite must be run and read before work is reported as complete.
checks:
  - type: workflow-has-node-type
    nodeType: verification
  - type: gate-exists
    criterionKind: tests-pass
---
