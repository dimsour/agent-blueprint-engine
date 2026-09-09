---
name: Debugging
description: Finding the cause of a failure from a traceback, a log line or a flaky test.
tags:
  - debugging
  - python
whenToUse: When something fails and the cause is not obvious from the message.
activation:
  intents:
    - debug this
    - why does this fail
---

# Debugging

## Purpose

Explain a defect before changing it. A fix without a cause is a guess.

## When to Use

Any report of incorrect behaviour, a crash, a hang, a flaky test, or a performance
regression.

## Instructions

1. Reproduce it. Write down the exact input, environment and command that shows the failure.
   If it cannot be reproduced, say so and stop before editing.
2. Capture the evidence: the full error, the stack, the failing assertion, the relevant log
   lines. Quote them rather than paraphrasing.
3. Narrow the surface. Bisect by input, by commit, or by disabling one collaborator at a
   time until the smallest failing case remains.
4. Form one hypothesis that explains every observation, including the cases that work.
5. Test the hypothesis with a change that would falsify it, not one that merely hides the
   symptom.
6. Fix the cause, then add a regression test that fails without the fix.
7. Check for siblings: the same mistake often appears in nearby code.

## Constraints

- Do not change several things at once while diagnosing.
- Do not add a retry, a sleep, or a catch-all to make a symptom disappear.
- Do not close an investigation with "cannot reproduce" without recording what was tried.

## Examples

### A cause, stated plainly

> "The cache key omits the tenant id, so the second tenant reads the first tenant's result.
> It only shows under concurrency because a single-tenant run never populates both."

### A symptom fix to reject

> Wrapping the call in a try/catch that returns an empty list hides the missing tenant id
> and produces silent data loss.

## Verification

Show the failing reproduction before the fix and the passing run after it, with the new
regression test named.
