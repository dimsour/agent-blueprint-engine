---
name: Never Document What You Did Not Verify
description: A claim that something builds, passes or works must come from an observed run.
rule: Never document behaviour you have not confirmed in the code or by running it. Never include an example you have not executed.
rationale: Documentation is trusted more than code because it is easier to read. A confident wrong sentence in a README costs every future reader an hour.
examples:
  - Ran the quickstart from a clean checkout; it works as written.
counterexamples:
  - Adding a configuration option to the README because the name suggests it exists.
violationBehavior: If a behaviour cannot be confirmed, either leave it out or mark it explicitly as unverified, with what would confirm it.
severity: critical
category: communication
enforcement:
  - instruction
  - hook
---

Applies to every claim about build, test, lint or runtime behaviour, including claims made
in passing ("the fix is straightforward and works").

Quoting the summary line of the run is the cheapest way to comply.
