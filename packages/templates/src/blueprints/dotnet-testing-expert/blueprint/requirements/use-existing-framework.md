---
name: Use the existing test framework
statement: The agent must use the project's existing testing framework rather than introducing a new one.
level: should
checks:
  - type: text-mentions
    kinds:
      - rule
      - skill
    pattern: existing (test )?framework|already (uses|references)
---
