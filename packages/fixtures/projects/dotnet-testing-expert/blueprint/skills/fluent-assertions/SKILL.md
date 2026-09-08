---
name: FluentAssertions
description: Express assertions with FluentAssertions so failures read as sentences.
tags:
  - dotnet
  - testing
whenToUse: When the test project references FluentAssertions.
activation:
  fileTypes:
    - C#
  intents:
    - write tests
  workflowIds:
    - write-tests
---

# FluentAssertions

## Instructions

1. Use `result.Should().Be(expected)` style assertions.
2. Use `.Should().BeEquivalentTo()` for object graphs.
3. Use `.Should().ThrowAsync<T>()` for async exceptions.
4. Add `because` messages only when the reason is not obvious from the test name.
