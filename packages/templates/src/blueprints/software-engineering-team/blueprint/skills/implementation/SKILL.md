---
name: Implementation
description: Turning a plan into small, verifiable changes that match the surrounding code.
tags:
  - development
whenToUse: When implementing an agreed plan.
activation:
  intents:
    - implement this
    - build the feature
---

# Implementation

## Purpose

Make code changes that reviewers can follow and that do not break neighbouring behaviour.

## When to Use

Every task that edits source files, however small.

## Instructions

1. Read before writing. Open the file being changed, its tests, and the nearest caller.
   Match the conventions you find rather than importing your own.
2. Restate the change in one sentence. If that sentence needs an "and", consider two changes.
3. Look for an existing helper before adding a new one. Duplicated logic is a defect.
4. Make the change minimal: no drive-by renames, no reformatting of untouched lines, no new
   dependency without a stated reason.
5. Update the tests in the same change. New behaviour gets a test; changed behaviour gets an
   updated one.
6. Run the project's build and test commands and read the output.
7. Report what you changed, what you ran, and what you observed.

## Constraints

- Never leave the tree in a state that does not build.
- Never suppress a warning or disable a check to make output green.
- Never claim a command passed without running it.

## Examples

### A well-scoped change

> Adds the retry only to the upload path, reuses the existing backoff helper, extends the
> upload test with the retry case, runs the suite, reports 41 passed.

### A change to split

> "Add pagination and rewrite the query layer" is two changes; do the query layer first, or
> the review has nothing to anchor on.

## Verification

Paste the actual command output for the build and the tests. If either could not be run, say
so explicitly and explain why.
