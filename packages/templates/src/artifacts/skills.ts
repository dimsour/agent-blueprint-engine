import { type SkillInput, skillSchema } from '@agent-blueprint/core'

import type { ArtifactTemplate } from '../types'
import { body, defineTemplate } from './define'

function skillTemplate(spec: {
  id: string
  label: string
  description: string
  make: (params: { id: string; name: string }) => SkillInput
}): ArtifactTemplate {
  return defineTemplate<SkillInput>({
    id: spec.id,
    kind: 'skill',
    label: spec.label,
    description: spec.description,
    parse: (input) => skillSchema.parse(input),
    make: spec.make,
  })
}

export const skillTemplates: ArtifactTemplate[] = [
  skillTemplate({
    id: 'skill-domain-expertise',
    label: 'Domain expertise',
    description: 'Deep knowledge of one domain: its vocabulary, invariants and common mistakes.',
    make: ({ id, name }) => ({
      id,
      name,
      description: `Domain knowledge for ${name}: vocabulary, invariants, decision rules and the mistakes to avoid.`,
      whenToUse: `When the task touches ${name} and the agent must reason with the domain's own rules rather than generic ones.`,
      tags: ['domain'],
      activation: { intents: [`work on ${name.toLowerCase()}`] },
      body: body(`
# ${name}

## Purpose

Give the agent the working knowledge of ${name} that a senior practitioner carries: the terms
that have precise meanings, the invariants that must hold, and the failure modes that look
reasonable but are not.

## When to Use

Any task that reads or changes ${name} behaviour. Read this before proposing a design, not
after writing code.

## Instructions

1. Establish the vocabulary. List the domain nouns and what each one means here, including
   any word this project uses differently from the industry default.
2. State the invariants. For each one, write what must always be true and what breaks if it
   is violated.
3. Identify the boundaries: what belongs to this domain, what belongs to a neighbour, and
   which direction dependencies are allowed to point.
4. Map the decisions that recur, and the rule of thumb that settles each one.
5. Check the change against the invariants before proposing it.

## Constraints

- Do not infer domain rules from a single example in the codebase; confirm the rule holds in
  at least two places, or say it is unconfirmed.
- Do not rename domain concepts to match a generic framework term.
- Keep this skill about knowledge. Procedures belong in a workflow.

## Examples

### Establishing an invariant

> "An order cannot leave the reserved state without a payment authorization id. Code that
> transitions it must take that id as a parameter, not look it up later."

### Rejecting a plausible-looking change

> "This adds a discount after tax. In this domain tax is computed on the discounted total,
> so the change would produce wrong totals for every order with a coupon."

## Verification

Before reporting completion, restate which invariants the change touches and how each one
still holds.
`),
    }),
  }),

  skillTemplate({
    id: 'skill-coding-procedure',
    label: 'Coding procedure',
    description: 'How to make a code change in this repository, end to end.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'The repeatable procedure for changing code here: read first, change small, verify, report honestly.',
      whenToUse: 'Whenever the task requires editing source files.',
      tags: ['procedure'],
      activation: {
        intents: ['implement', 'fix', 'change the code'],
        agentRoles: ['worker'],
      },
      body: body(`
# ${name}

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
`),
    }),
  }),

  skillTemplate({
    id: 'skill-testing',
    label: 'Testing',
    description: 'Choose what to test and write tests that describe behaviour.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Design and write tests that describe observable behaviour, cover failure paths and stay deterministic.',
      whenToUse: 'When adding tests, changing tested behaviour, or reviewing a test suite.',
      tags: ['testing'],
      activation: {
        filePatterns: ['**/*test*', '**/*spec*'],
        intents: ['write tests', 'add coverage', 'review tests'],
      },
      body: body(`
# ${name}

## Purpose

Produce tests that fail for the right reason, document behaviour, and survive refactoring.

## When to Use

Before writing a test, and when reviewing one. Use the framework the project already
references; check the manifest rather than assuming.

## Instructions

1. List the observable behaviours of the unit, including failure modes and boundaries.
2. Write one test per behaviour, in arrange / act / assert order.
3. Name each test so the name states the scenario and the expected outcome.
4. Test through the public surface. Do not reach into private members or assert on call
   order that a caller cannot observe.
5. Cover the unhappy paths: empty and null inputs, boundary values, cancellation, and
   errors raised by dependencies.
6. Keep tests deterministic: no wall-clock time, no randomness, no network, no dependence on
   execution order or shared mutable state.
7. Run the suite and read the summary.

## Constraints

- Do not introduce a new test framework or assertion library when one is already in use.
- Do not assert on log text or formatting unless that output is the contract.
- Do not write a test that passes when the implementation is deleted.

## Examples

### Behaviour, not implementation

> Asserts that a declined payment leaves the order unpaid and returns a declined result,
> rather than asserting that the gateway client was called twice.

### A boundary case worth a test

> Quantity zero is rejected, quantity one succeeds; the limit and the limit plus one are
> both covered.

## Verification

Run the suite and quote the summary line. State which behaviours are now covered and which
remain uncovered on purpose.
`),
    }),
  }),

  skillTemplate({
    id: 'skill-debugging',
    label: 'Debugging',
    description: 'Find the root cause of a defect before changing anything.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Reproduce, isolate and explain a defect before fixing it, so the fix addresses the cause and not a symptom.',
      whenToUse: 'When something fails, misbehaves, or produces a result the user did not expect.',
      tags: ['debugging'],
      activation: { intents: ['debug', 'investigate a failure', 'why does this happen'] },
      body: body(`
# ${name}

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
`),
    }),
  }),

  skillTemplate({
    id: 'skill-research',
    label: 'Research',
    description: 'Gather and weigh external information before deciding.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Find, judge and summarize external information so a decision rests on sources rather than recall.',
      whenToUse:
        'When the task depends on library behaviour, API contracts or prior art the agent is not certain about.',
      tags: ['research'],
      activation: { intents: ['research', 'compare options', 'find out how'] },
      body: body(`
# ${name}

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
`),
    }),
  }),

  skillTemplate({
    id: 'skill-documentation',
    label: 'Documentation',
    description: 'Write documentation from the code, for a specific reader.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Produce documentation that matches the code, aimed at a named reader with a task to finish.',
      whenToUse: 'When writing or updating a README, guide, API reference or changelog entry.',
      tags: ['documentation'],
      activation: {
        filePatterns: ['**/*.md', '**/docs/**'],
        intents: ['document', 'write a readme', 'update docs'],
      },
      body: body(`
# ${name}

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
`),
    }),
  }),

  skillTemplate({
    id: 'skill-code-review',
    label: 'Code review',
    description: 'Review a change for correctness, risk and clarity.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Review a diff for correctness, security, tests and clarity, and report findings with file and line.',
      whenToUse: 'When reviewing a diff, a pull request, or a change you did not write.',
      tags: ['review'],
      activation: {
        intents: ['review this change', 'review the pull request'],
        agentRoles: ['reviewer'],
      },
      body: body(`
# ${name}

## Purpose

Find the defects that matter in a change, and say why each one matters.

## When to Use

On any diff before it lands, and on your own work before reporting it complete.

## Instructions

1. Read the intent first: the description, the issue, the tests. Review against that intent.
2. Read the whole diff once before commenting, so early notes do not misjudge later context.
3. Check correctness: boundary values, empty and null inputs, error paths, concurrency,
   and what happens when a dependency fails.
4. Check the tests: does a new test fail without the change? Are failure paths covered?
5. Check security and data handling: input validation, authorization, secrets, logging of
   sensitive values.
6. Check fit: does it follow the conventions of the files it touches, and does it duplicate
   something that already exists?
7. Report each finding with a file and line, the consequence, and a suggested direction.
   Separate what must change from what is a preference.

## Constraints

- Do not report style opinions as defects.
- Do not approve behaviour you did not verify; if you cannot run it, say so.
- Do not rewrite the change in the review; describe the problem and let the author choose.

## Examples

### A finding worth reporting

> "src/orders.ts:88 dereferences the payment before the null check on line 91; a declined
> payment throws instead of returning the declined result. Add the check before use."

### A comment to drop

> "I would have named this differently." No consequence, no action.

## Verification

State what you ran, and list the areas you did not review so the author knows the coverage of
the review.
`),
    }),
  }),
]
