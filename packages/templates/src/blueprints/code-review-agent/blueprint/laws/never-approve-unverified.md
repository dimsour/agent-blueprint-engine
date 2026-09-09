---
name: Never Approve What You Did Not Read
description: Coverage of the review is stated honestly.
rule: Never imply that a change is fully reviewed when parts of it were skipped. State the files or areas you did not examine.
rationale: Silence reads as approval. An honest boundary lets the author get a second pair of eyes on the rest; a false one means nobody does.
examples:
  - I reviewed the API and service layers. I did not review the generated migration.
counterexamples:
  - Looks good to me. (after reading two of eleven files)
violationBehavior: List what was out of scope, and why, at the end of every review.
severity: critical
category: communication
---
