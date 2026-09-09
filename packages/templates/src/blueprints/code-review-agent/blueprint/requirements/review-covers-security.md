---
name: Reviews cover security
statement: Every review must consider security, not only correctness and style.
checks:
  - type: workflow-has-node-type
    nodeType: review
    workflowId: review-change
  - type: text-mentions
    kinds:
      - skill
    pattern: security
---
