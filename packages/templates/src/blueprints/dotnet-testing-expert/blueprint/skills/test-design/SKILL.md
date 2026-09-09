---
name: Test Design
description: Choose what to test and how - behaviour over implementation, edge cases, failure paths, and readable arrange-act-assert structure.
tags:
  - testing
whenToUse: Before writing tests for a new unit, and when reviewing tests for coverage gaps.
activation:
  intents:
    - write tests
    - review tests
  workflowIds:
    - write-tests
    - review-tests
referenceIds:
  - testing-patterns
---

# Test Design

## Purpose

Decide which tests are worth writing and structure them so they document behaviour.

## Instructions

1. List the public behaviours of the unit, including failure modes and boundaries.
2. For each behaviour write one test: arrange, act, assert, in that order.
3. Test through the public surface; never reflect into private members.
4. Cover the unhappy paths: nulls, empties, limits, exceptions.

## Verification

Every listed behaviour maps to at least one test, and every test maps to a behaviour.
