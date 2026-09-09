---
name: Decision records
description: "Writing a decision down so the next person understands why, not only what: context, options, choice, consequences."
tags:
  - architecture
  - documentation
whenToUse: Whenever a decision constrains future work.
activation:
  filePatterns:
    - "**/adr/**"
    - "**/decisions/**"
  intents:
    - write an ADR
    - record this decision
---

# Decision records

## Purpose

Write documentation a reader can act on, derived from the code as it is rather than as it
was intended to be.

## When to Use

Whenever behaviour, configuration or a public interface changes, and when onboarding
material is missing.

## Instructions

1. Name the reader and the task: what do they know already, and what must they be able to do
   when they finish reading?
2. Lead with the outcome, then the steps. Put prerequisites before the first command.
3. Derive every statement from the code, a test, or an observed run. Read the source before
   describing behaviour.
4. Show a complete, runnable example and its expected output.
5. Document the failure cases: the common error, what causes it, and what to do about it.
6. Keep reference material and tutorials apart; a reference is scanned, a tutorial is
   followed once.
7. Update the surrounding documents that now contradict the change.

## Constraints

- Never document behaviour that does not exist yet.
- Do not restate the code in prose; explain what it is for.
- Do not leave a version number, path or command that was not checked.

## Examples

### A useful section

> "Set BLUEPRINT_DIR when the project lives outside the repository root. The compiler reads
> it once at startup; changing it requires a restart."

### A section to cut

> "This module contains various utility functions." No reader, no task, no fact.

## Verification

Follow your own instructions from a clean state and confirm each command and output matches
what you wrote.
