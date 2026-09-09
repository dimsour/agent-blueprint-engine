---
name: Never Test Implementation Details
description: Tests verify observable behaviour through the public surface.
rule: Never assert on private members, internal call order or mock interactions that the caller cannot observe.
rationale: Tests coupled to implementation break on every refactor and prove nothing about behaviour.
category: code-quality
---
