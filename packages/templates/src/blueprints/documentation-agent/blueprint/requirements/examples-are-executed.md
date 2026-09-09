---
name: Examples are executed
statement: Every example in the documentation must have been run before it is published.
checks:
  - type: gate-exists
    criterionKind: command
  - type: iron-law-matches
    pattern: example
---
