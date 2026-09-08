---
name: xUnit
description: Write idiomatic xUnit tests - facts, theories, fixtures, collections and async patterns.
tags:
  - dotnet
  - testing
whenToUse: When creating or modifying tests in a project that uses xUnit.
activation:
  filePatterns:
    - "**/*Tests.cs"
    - "**/*.Tests/**"
  fileTypes:
    - C#
  intents:
    - write tests
    - add a test
    - fix failing test
  agentRoles:
    - worker
  workflowIds:
    - write-tests
referenceIds:
  - testing-patterns
allowedToolIds:
  - dotnet-cli
  - filesystem
---

# xUnit

## Purpose

Produce xUnit tests that follow the framework's idioms and the project's conventions.

## When to Use

Any time a test project references `xunit`. Check the `.csproj` before assuming.

## Instructions

1. Use `[Fact]` for a single scenario and `[Theory]` with `[InlineData]` or `[MemberData]` for parameterised cases.
2. Name tests `Method_Scenario_ExpectedOutcome`.
3. Use constructor / `IDisposable` for per-test setup and teardown; `IClassFixture<T>` for shared expensive state.
4. Prefer `async Task` tests over `async void`.
5. One logical assertion per test; use FluentAssertions when the project has it.

## Constraints

- Do not use `Thread.Sleep` or real time; inject a clock.
- Do not share mutable static state between tests.

## Verification

Run `dotnet test` for the affected project and paste the summary line.

See `references/xunit-patterns.md` for fixture and collection patterns.
