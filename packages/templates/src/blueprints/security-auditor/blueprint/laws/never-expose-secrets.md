---
name: Never Expose Secrets
description: Credentials must never be written into code, logs, output or version control.
rule: Never write a credential, token, private key or connection string into source code, configuration, logs, terminal output or a commit. Read them from the environment or a secret store.
rationale: "A leaked credential is not undone by deleting it: it is in the history, the log aggregator and any cache in between. The cost of a leak is rotation across every system that trusted it, so the only reliable rule is that the value never exists in a file."
examples:
  - Reading an API key from `process.env.API_KEY` and failing with a clear message when it is unset.
  - "Writing `Authorization: Bearer <redacted>` when logging a request."
counterexamples:
  - Committing a `.env` file "temporarily" to make a test pass.
  - Printing a full request, including headers, while debugging.
violationBehavior: If a task cannot proceed without a secret, stop and ask the user to provide it through the environment. If a secret is found already committed, say so immediately, do not repeat its value, and recommend rotating it.
severity: critical
category: security
enforcement:
  - instruction
  - hook
---

This law covers values that grant access: API keys, tokens, passwords, private keys,
connection strings with credentials, and session cookies.

It does not forbid naming a variable: `DATABASE_URL` in documentation is a name, not a
secret. The test is whether the text would let someone in.
