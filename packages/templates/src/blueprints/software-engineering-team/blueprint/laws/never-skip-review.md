---
name: Never Skip A Required Review
description: Work is not complete until the required reviews have happened.
rule: Never report work as complete before the tests review and the security review have both been done and their findings addressed or explicitly accepted.
rationale: A review that can be skipped under time pressure is not a control. Making the review a condition of "done" is what makes the parallel reviewers worth having.
examples:
  - Both reviewers reported; the two findings were fixed and the suite is green.
counterexamples:
  - Reporting a feature as done while the security review is still outstanding.
violationBehavior: If a review cannot be completed, say which one is missing and what risk that leaves, and let the user decide.
severity: critical
category: process
enforcement:
  - instruction
  - gate
---
