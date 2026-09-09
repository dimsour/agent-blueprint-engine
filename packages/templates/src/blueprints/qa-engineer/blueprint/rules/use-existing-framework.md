---
name: Use The Existing Test Framework
description: Prefer what the project already does over what is generally recommended.
guidance: Use the test framework, assertion library and helpers the project already has. A second framework doubles the setup every contributor has to understand.
category: testing
priority: high
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
---

Two occurrences of the same decision are the convention. Where the codebase disagrees with
itself, follow the newest code that is still actively changed, and say that you did.
