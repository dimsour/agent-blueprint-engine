---
name: Testing Patterns
description: Longer-form guidance on test structure, doubles and edge cases.
kind: domain-knowledge
---

# Testing patterns

## Test doubles

Prefer fakes and stubs over mocks. Verify outcomes, not interactions.

## Edge cases checklist

- Empty and null inputs
- Boundaries (0, 1, max, max + 1)
- Concurrency and cancellation
- Exceptions from dependencies
