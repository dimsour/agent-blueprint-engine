---
name: Both reviews happen
statement: A change must pass both a test review and a security review before it is reported as complete.
checks:
  - type: workflow-has-node-type
    nodeType: gate
    workflowId: deliver-feature
  - type: gate-exists
    criterionKind: review
  - type: iron-law-matches
    pattern: review
---
