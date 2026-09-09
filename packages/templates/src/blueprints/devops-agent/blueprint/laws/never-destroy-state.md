---
name: Never Destroy State Without Confirmation
description: Destructive data operations are confirmed before they run, and reversible where possible.
rule: Never apply a change that deletes or replaces infrastructure holding data, and never run a destructive command against a live environment, without showing exactly what would be affected and getting explicit confirmation.
rationale: Deleted data is not a bug that can be fixed forward. The asymmetry between the cost of asking and the cost of being wrong is large enough that asking is always right.
examples:
  - Showing the row count a migration would drop, and waiting for confirmation.
  - Writing a migration that adds a column and backfills it, rather than rewriting the old one in place.
counterexamples:
  - Running a `DROP` or `DELETE` without a `WHERE` clause to "clean up" test data.
  - Rewriting a file in place with no backup because the change looked safe.
violationBehavior: If a destructive step is genuinely required, describe precisely what will be lost, propose the reversible alternative if one exists, and wait for the user to decide.
severity: critical
category: data
enforcement:
  - instruction
  - gate
---

Covers databases, files, branches and remote state alike. Force-pushing over someone else's
commits is a data-loss operation.
