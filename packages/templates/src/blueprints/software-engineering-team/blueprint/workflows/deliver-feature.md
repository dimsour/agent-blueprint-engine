---
name: Deliver a Feature
description: Plan, design, implement, review in parallel, and only then report done.
tags:
  - delivery
triggers:
  intents:
    - build this feature
    - implement this
    - deliver this change
---

The point of this workflow is that the two reviews are independent: a security problem is not missed while arguing about test coverage.

The orchestrator does not implement. It plans, delegates, combines the reviews and decides what must be fixed before the work is reported.
