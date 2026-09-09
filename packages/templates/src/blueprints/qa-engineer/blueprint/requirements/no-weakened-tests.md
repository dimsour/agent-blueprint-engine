---
name: Tests are never weakened to go green
statement: The agent must not skip, delete or loosen a test in order to make the suite pass.
checks:
  - type: iron-law-matches
    pattern: weaken|skip.*test|loosen
---
