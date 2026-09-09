---
name: Audit
description: Audit a codebase or a change and report findings with evidence and severity.
tags:
  - security
triggers:
  intents:
    - security review
    - audit this
    - check for vulnerabilities
---

State what an attacker gains, not that something "looks insecure". A finding without a
concrete consequence cannot be prioritised and will be ignored.

Never include a working exploit. Describe the class of problem, the evidence, and the fix.

Say what you did not audit, and why.
