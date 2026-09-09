---
name: Errors are actionable
statement: Failures must reach the caller with enough context to act on, and never be silently discarded.
checks:
  - type: iron-law-matches
    pattern: except|swallow|discard
---
