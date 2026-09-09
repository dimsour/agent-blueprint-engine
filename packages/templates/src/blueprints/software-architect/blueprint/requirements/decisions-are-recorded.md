---
name: Decisions are recorded
statement: Every architectural decision must be recorded with its context, options and consequences.
checks:
  - type: text-mentions
    kinds:
      - skill
      - reference
    pattern: decision record|consequences
  - type: agent-has-skill-tag
    tag: architecture
---
