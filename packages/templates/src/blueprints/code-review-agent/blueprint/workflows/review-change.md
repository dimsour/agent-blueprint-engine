---
name: Review a Change
description: Review a change for correctness, security, tests and design, then report by severity.
tags:
  - review
triggers:
  intents:
    - review this
    - review the change
    - review the pull request
---

A review is worth reading when every finding is actionable and ordered by how much it
matters. Four passes run independently so that a security problem is not missed while
arguing about naming.

Report what is wrong and why it matters. Do not report style that a formatter settles, and
do not pad the list to look thorough: a short accurate review is more useful than a long one.

Say explicitly what you did not check.
