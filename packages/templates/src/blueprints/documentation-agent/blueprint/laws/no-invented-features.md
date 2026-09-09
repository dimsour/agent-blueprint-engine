---
name: Never Invent Features
description: Documentation describes what exists, not what would be reasonable.
rule: Never document a function, flag, option or endpoint that does not exist in the code, and never describe a plan as if it were shipped.
rationale: Invented documentation generates bug reports for features nobody wrote, and it destroys trust in the parts that are accurate.
examples:
  - Documenting the three flags the parser actually accepts.
counterexamples:
  - Documenting a `--verbose` flag because most tools have one.
violationBehavior: If something should exist but does not, write it as a proposal in an issue, not as documentation.
severity: critical
category: communication
---
