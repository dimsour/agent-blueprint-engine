/**
 * What a filled-in field looks like (P9-04).
 *
 * The help sentence in `entity-form.tsx` says what a field is; this says what one looks like
 * when someone has done the job. "One or two sentences. Harnesses use this to decide when to
 * load the artifact." explains the Description field; `Senior .NET engineer specialised in
 * unit testing with xUnit and FluentAssertions.` teaches it.
 *
 * One map, keyed `<kind>.<field>`, rather than an `example` prop scattered through 29 field
 * call sites: the examples have to read as one voice, and they only do that when they are
 * written next to each other. They are lifted from the fixture project and the starters —
 * `packages/fixtures/projects/dotnet-testing-expert` and
 * `packages/templates/src/blueprints` — so what the form suggests is what the product ships.
 *
 * This is not "new from template", which fills a whole artifact from
 * `@agent-blueprint/templates/artifacts`. This fills one field, for the person who knows what
 * they want everywhere except here.
 */
import type { EntityKind } from '@agent-blueprint/core'

/** Every example, keyed by the artifact kind and the field it belongs to. */
export const FIELD_EXAMPLES: Record<`${EntityKind}.${string}`, string> = {
  // Agent — the .NET testing expert, which is the fixture every test in the repo reads.
  'agent.id': 'testing-expert',
  'agent.name': 'Testing Expert',
  'agent.description':
    'Senior .NET engineer specialised in unit testing with xUnit and FluentAssertions.',
  'agent.responsibilities': 'Write unit tests for the code the user points at',
  'agent.expertise': 'C# and .NET 8+',
  'agent.outputRequirements': 'Tests compile and pass before the task is reported as done',
  'agent.body':
    'You are a senior .NET engineer who writes tests other people can read.\n\nWork from the observable behaviour of the unit, not from its private members. Run the suite\nand report what you saw before calling anything done.',

  // Skill
  'skill.id': 'xunit',
  'skill.name': 'xUnit',
  'skill.description':
    'Write idiomatic xUnit tests — facts, theories, fixtures, collections and async patterns.',
  'skill.whenToUse': 'When creating or modifying tests in a project that uses xUnit.',
  'skill.filePatterns': '**/*Tests.cs',
  'skill.intents': 'fix failing test',
  'skill.fileTypes': 'C#',
  'skill.body':
    '## Purpose\n\nProduce xUnit tests that follow the framework’s idioms and the project’s conventions.\n\n## Instructions\n\n1. Read the unit under test and list the behaviours worth pinning down.\n2. Write one `[Fact]` per behaviour; use `[Theory]` only when the cases differ by data.\n3. Run `dotnet test` and report the observed result.',

  // Workflow
  'workflow.id': 'write-tests',
  'workflow.name': 'Write Unit Tests',
  'workflow.description': 'From a request to the finished, verified test file.',
  'workflow.intents': 'add unit tests',
  'workflow.body':
    'Understand the unit, design the tests, implement them, run them, and only then report.',

  // Iron Law
  'iron-law.id': 'deterministic-tests',
  'iron-law.name': 'Keep Tests Deterministic',
  'iron-law.description': 'Tests must produce the same result on every run.',
  'iron-law.rule':
    'Never write a test that depends on wall-clock time, random values, network access, test ordering or shared mutable state.',
  'iron-law.rationale': 'Flaky tests erode trust in the suite and hide real regressions.',
  'iron-law.violationBehavior':
    'Stop and say which dependency cannot be made deterministic, rather than retrying the test until it passes.',
  'iron-law.examples': 'A test that reads the clock through an injected time provider',
  'iron-law.counterexamples': 'A test that calls DateTime.Now and compares it to a computed date',
  'iron-law.body': 'Applies to every test project, including the ones that only run in CI.',

  // Rule
  'rule.id': 'prefer-existing-framework',
  'rule.name': 'Prefer the Existing Framework',
  'rule.description': 'Do not add a second test framework to a project that already has one.',
  'rule.guidance':
    'Use the test framework, assertion library and mocking library the project already references before introducing a new one.',
  'rule.paths': '**/*Tests.cs',
  'rule.body': 'Check the `.csproj` before assuming which framework is in use.',

  // Hook
  'hook.id': 'run-tests-after-change',
  'hook.name': 'Run tests after change',
  'hook.description':
    'Runs the affected test project whenever a C# file is edited and returns failures to the agent.',
  'hook.command': 'dotnet test --no-restore',

  // Gate
  'gate.id': 'tests-pass',
  'gate.name': 'Tests must pass',
  'gate.description': 'The task cannot be reported as complete while any test fails.',
  'gate.criterionDescription': 'All tests in the affected projects pass.',
  'gate.criterionCommand': 'dotnet test',

  // Tool
  'tool.id': 'dotnet-cli',
  'tool.name': '.NET CLI',
  'tool.description': 'The dotnet command line for building and testing.',
  'tool.operations': 'test',

  // Reference
  'reference.id': 'testing-patterns',
  'reference.name': 'Testing Patterns',
  'reference.description': 'Longer-form guidance on test structure, doubles and edge cases.',
  'reference.url': 'https://learn.microsoft.com/dotnet/core/testing/',
  'reference.body':
    '# Testing patterns\n\n## Test doubles\n\nPrefer fakes and stubs over mocks. Verify outcomes, not interactions.',

  // Memory
  'memory.id': 'project-conventions',
  'memory.name': 'Project conventions',
  'memory.description': 'Conventions the agent discovers about the codebase it works in.',
  'memory.categories': 'naming conventions',
  'memory.body':
    'Record where test projects live, how they are named and which assertion style dominates.',

  // Requirement
  'requirement.id': 'verify-before-claiming',
  'requirement.name': 'Verify before claiming success',
  'requirement.description': 'The claim this Blueprint makes about how work is reported.',
  'requirement.statement':
    'The agent must run the tests and observe the result before reporting a task as complete.',
  'requirement.body': 'Checked by the gate, the Iron Law and the verification step together.',

  // Scenario
  'scenario.id': 'payment-service-tests',
  'scenario.name': 'Payment service tests',
  'scenario.description': 'A typical request to test a service with failure paths.',
  'scenario.input': 'Write unit tests for this payment service.',
  'scenario.expectedBehaviors': 'Tests failure cases such as declined cards and timeouts',
}

/**
 * The `example` prop for one field, or nothing.
 *
 * Spread rather than passed, because `exactOptionalPropertyTypes` distinguishes an absent
 * prop from one that is present and `undefined`, and a field with no example has no prop.
 */
export function exampleFor(kind: EntityKind, field: string): { example?: string } {
  const example = FIELD_EXAMPLES[`${kind}.${field}`]
  return example ? { example } : {}
}
