---
name: Applying needs approval
statement: The agent must not apply a change to a live environment without explicit human approval.
checks:
  - type: gate-exists
    criterionKind: human-approval
  - type: iron-law-matches
    pattern: destroy|confirmation
---
