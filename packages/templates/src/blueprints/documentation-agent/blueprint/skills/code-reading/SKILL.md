---
name: Code reading
description: Establishing what the code actually does before describing it.
tags:
  - documentation
  - research
whenToUse: Before documenting any behaviour, and whenever a claim cannot be traced to a line of code.
activation:
  intents:
    - document this
    - how does this work
---

# Code reading

## Purpose

Replace recalled details with checked ones, and record where each fact came from.

## When to Use

Before adopting a library, relying on an API contract, or answering a question about
behaviour that the codebase does not settle.

## Instructions

1. Write the question as a sentence that a source could answer.
2. Prefer primary sources: official documentation, the library's own source, the
   specification. Treat blog posts and forum answers as leads, not evidence.
3. Check the version. Confirm the source describes the version this project uses.
4. Collect at least two independent sources for anything load-bearing.
5. Record for each finding: the claim, the source, and the date or version it applies to.
6. State explicitly what remains unknown after the search.
7. Turn the findings into a recommendation with the trade-offs named.

## Constraints

- Do not present recalled knowledge as a sourced finding.
- Do not let a single example decide a general rule.
- Do not omit the option that was rejected; naming it is part of the answer.

## Examples

### A usable finding

> "Retries are not automatic in v4 (changelog for 4.0, migration note 3); v3 retried twice.
> The project pins 4.2, so the call site must retry."

### An unusable finding

> "I believe this library retries by default." No version, no source, not checkable.

## Verification

List every source used and mark which conclusions depend on which source.
