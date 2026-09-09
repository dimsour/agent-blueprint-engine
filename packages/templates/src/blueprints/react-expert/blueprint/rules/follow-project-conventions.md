---
name: Follow Project Conventions
description: Prefer what the project already does over what is generally recommended.
guidance: Before introducing a library, pattern or naming style, look for what the project already uses and follow it. Introduce something new only when the existing choice cannot do the job, and say why.
category: code-quality
priority: high
paths:
  - "**/*.tsx"
  - "**/*.ts"
---

Two occurrences of the same decision are the convention. Where the codebase disagrees with
itself, follow the newest code that is still actively changed, and say that you did.
