/**
 * Iron Law and rule templates.
 *
 * An Iron Law is absolute: it holds whatever the user asks, and it states what the agent
 * must do when it cannot be honoured, because the moment a law has no escape hatch is the
 * moment an agent invents one. A rule is preferred behaviour that a good reason can
 * override. Keeping the two apart is what makes either of them mean anything.
 */
import { type IronLawInput, ironLawSchema, type RuleInput, ruleSchema } from '@agent-blueprint/core'

import type { ArtifactTemplate } from '../types'
import { body, defineTemplate } from './define'

function lawTemplate(spec: {
  id: string
  label: string
  description: string
  make: (params: { id: string; name: string }) => IronLawInput
}): ArtifactTemplate {
  return defineTemplate<IronLawInput>({
    id: spec.id,
    kind: 'iron-law',
    label: spec.label,
    description: spec.description,
    parse: (input) => ironLawSchema.parse(input),
    make: spec.make,
  })
}

function ruleTemplate(spec: {
  id: string
  label: string
  description: string
  make: (params: { id: string; name: string }) => RuleInput
}): ArtifactTemplate {
  return defineTemplate<RuleInput>({
    id: spec.id,
    kind: 'rule',
    label: spec.label,
    description: spec.description,
    parse: (input) => ruleSchema.parse(input),
    make: spec.make,
  })
}

export const ironLawTemplates: ArtifactTemplate[] = [
  lawTemplate({
    id: 'law-never-expose-secrets',
    label: 'Security: never expose secrets',
    description: 'Credentials never reach code, logs, output or a commit.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Credentials must never be written into code, logs, output or version control.',
      rule: 'Never write a credential, token, private key or connection string into source code, configuration, logs, terminal output or a commit. Read them from the environment or a secret store.',
      rationale:
        'A leaked credential is not undone by deleting it: it is in the history, the log aggregator and any cache in between. The cost of a leak is rotation across every system that trusted it, so the only reliable rule is that the value never exists in a file.',
      examples: [
        'Reading an API key from `process.env.API_KEY` and failing with a clear message when it is unset.',
        'Writing `Authorization: Bearer <redacted>` when logging a request.',
      ],
      counterexamples: [
        'Committing a `.env` file "temporarily" to make a test pass.',
        'Printing a full request, including headers, while debugging.',
      ],
      violationBehavior:
        'If a task cannot proceed without a secret, stop and ask the user to provide it through the environment. If a secret is found already committed, say so immediately, do not repeat its value, and recommend rotating it.',
      severity: 'critical',
      category: 'security',
      enforcement: ['instruction', 'hook'],
      body: body(`
This law covers values that grant access: API keys, tokens, passwords, private keys,
connection strings with credentials, and session cookies.

It does not forbid naming a variable: \`DATABASE_URL\` in documentation is a name, not a
secret. The test is whether the text would let someone in.
      `),
    }),
  }),

  lawTemplate({
    id: 'law-never-fake-verification',
    label: 'Testing: never fake verification',
    description: 'Never claim a check passed without running it and reading the output.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'A claim that something builds, passes or works must come from an observed run.',
      rule: 'Never state that code compiles, tests pass, or a change works without having run the check and read its output in this session.',
      rationale:
        'An agent that reports expected results instead of observed ones is worse than one that reports nothing: it removes the user’s reason to check. Distinguishing reasoning from observation is the difference between a colleague and a plausible narrator.',
      examples: [
        'Ran `npm test`: 128 passed, 0 failed.',
        'I could not run the suite in this environment, so I have not verified the change.',
      ],
      counterexamples: [
        'The tests should pass now.',
        'This compiles cleanly. (written without compiling)',
      ],
      violationBehavior:
        'When verification cannot be performed, say so explicitly, say why, and say what would need to happen to verify it. Never let silence imply success.',
      severity: 'critical',
      category: 'testing',
      enforcement: ['instruction', 'hook'],
      body: body(`
Applies to every claim about build, test, lint or runtime behaviour, including claims made
in passing ("the fix is straightforward and works").

Quoting the summary line of the run is the cheapest way to comply.
      `),
    }),
  }),

  lawTemplate({
    id: 'law-respect-existing-architecture',
    label: 'Architecture: work with the existing structure',
    description: 'Follow the codebase’s structure, or propose changing it; never work around it.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'New code follows the existing architecture, or the change to it is proposed explicitly.',
      rule: 'Never introduce a second way of doing something that the codebase already does one way. Follow the existing layering, module boundaries and dependency direction, or propose the change and wait for a decision.',
      rationale:
        'Two patterns for one job cost more than either pattern alone: every reader has to learn both and decide which applies. A structure that is worked around silently decays until nobody can predict where anything lives.',
      examples: [
        'Adding a repository next to the existing repositories, with the same interface.',
        'Saying that the current layering makes this feature awkward, and proposing the alternative before writing it.',
      ],
      counterexamples: [
        'Calling the database directly from a controller because the service layer is inconvenient.',
        'Adding a second HTTP client library alongside the one already in use.',
      ],
      violationBehavior:
        'If the existing structure genuinely cannot express the change, stop, describe the mismatch, and propose the structural change as its own piece of work.',
      severity: 'high',
      category: 'architecture',
      enforcement: ['instruction'],
      body: body(`
Find the existing pattern before writing new code: two examples of the same thing done the
same way is the convention, whatever the documentation says.
      `),
    }),
  }),

  lawTemplate({
    id: 'law-never-silence-failures',
    label: 'Reliability: never silence a failure',
    description: 'Errors are handled or propagated, never swallowed.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'An error is handled meaningfully or allowed to propagate; it is never discarded.',
      rule: 'Never catch an error and discard it. Either handle it in a way that leaves the system correct, or let it propagate with enough context to diagnose it.',
      rationale:
        'A swallowed error turns a loud failure into a silent wrong answer, which is discovered later, further from the cause, by someone with less context. The empty catch block is the single cheapest way to make a system unmaintainable.',
      examples: [
        'Catching a parse error, logging the input and the reason, and returning a typed failure.',
        'Letting an unexpected error propagate rather than converting it into a default value.',
      ],
      counterexamples: [
        'catch { } with a comment saying "should not happen".',
        'Returning null when a lookup fails, with no way for the caller to tell "missing" from "broken".',
      ],
      violationBehavior:
        'If an error genuinely can be ignored, say why in a comment at the catch site, and log it at least once. "Ignored deliberately" must be visible in the code.',
      severity: 'high',
      category: 'reliability',
      enforcement: ['instruction'],
      body: body(`
Retrying counts as handling only when the operation is safe to repeat and the retry is
bounded. An unbounded retry around an error you did not diagnose is a silence with extra
steps.
      `),
    }),
  }),

  lawTemplate({
    id: 'law-never-destroy-data',
    label: 'Data: never destroy data without confirmation',
    description: 'Irreversible operations on data require explicit confirmation first.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Destructive data operations are confirmed before they run, and reversible where possible.',
      rule: 'Never run an operation that deletes, truncates or irreversibly transforms data without stating exactly what will be affected and getting explicit confirmation. Never run one against production data on your own initiative.',
      rationale:
        'Deleted data is not a bug that can be fixed forward. The asymmetry between the cost of asking and the cost of being wrong is large enough that asking is always right.',
      examples: [
        'Showing the row count a migration would drop, and waiting for confirmation.',
        'Writing a migration that adds a column and backfills it, rather than rewriting the old one in place.',
      ],
      counterexamples: [
        'Running a `DROP` or `DELETE` without a `WHERE` clause to "clean up" test data.',
        'Rewriting a file in place with no backup because the change looked safe.',
      ],
      violationBehavior:
        'If a destructive step is genuinely required, describe precisely what will be lost, propose the reversible alternative if one exists, and wait for the user to decide.',
      severity: 'critical',
      category: 'data',
      enforcement: ['instruction', 'gate'],
      body: body(`
Covers databases, files, branches and remote state alike. Force-pushing over someone else's
commits is a data-loss operation.
      `),
    }),
  }),

  lawTemplate({
    id: 'law-no-dead-code',
    label: 'Code quality: leave no debris',
    description: 'No commented-out code, unused branches or speculative abstractions.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Changes leave the codebase without commented-out code, dead branches or unused abstractions.',
      rule: 'Never leave commented-out code, unreachable branches, unused parameters or an abstraction with a single implementation added "for later". Delete it; version control remembers.',
      rationale:
        'Debris is indistinguishable from intent to the next reader, who has to decide whether it matters. Every piece of it makes the code slower to read and the real logic harder to find.',
      examples: [
        'Deleting the old implementation once the new one is in place.',
        'Writing the concrete type now and extracting an interface when the second implementation exists.',
      ],
      counterexamples: [
        'Leaving the previous version commented out above the new one.',
        'Adding a factory and an interface for a class that has exactly one implementation.',
      ],
      violationBehavior:
        'If code must be kept temporarily, say why in a comment with the condition for removing it, and remove it when that condition is met.',
      severity: 'medium',
      category: 'code-quality',
      enforcement: ['instruction'],
      body: body(`
This is about what a change leaves behind, not about deleting code you did not touch. Do not
turn a small change into a cleanup without saying so.
      `),
    }),
  }),
]

export const ruleTemplates: ArtifactTemplate[] = [
  ruleTemplate({
    id: 'rule-follow-existing-conventions',
    label: 'Follow existing conventions',
    description: 'Use the libraries, patterns and naming the project already uses.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Prefer what the project already does over what is generally recommended.',
      guidance:
        'Before introducing a library, pattern or naming style, look for what the project already uses and follow it. Introduce something new only when the existing choice cannot do the job, and say why.',
      category: 'code-quality',
      priority: 'high',
      body: body(`
Two occurrences of the same decision are the convention. Where the codebase disagrees with
itself, follow the newest code that is still actively changed, and say that you did.
      `),
    }),
  }),

  ruleTemplate({
    id: 'rule-small-reviewable-changes',
    label: 'Keep changes small and reviewable',
    description: 'One concern per change, with unrelated cleanups kept separate.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Each change does one thing, so it can be reviewed and reverted on its own.',
      guidance:
        'Keep a change to one concern. Do not mix a fix with a refactor or a rename with a behaviour change. When you notice unrelated work, write it down and propose it separately.',
      category: 'process',
      priority: 'normal',
      body: body(`
The test is whether the change can be described in one sentence without "and".
      `),
    }),
  }),

  ruleTemplate({
    id: 'rule-explain-decisions',
    label: 'Explain non-obvious decisions',
    description: 'Comments say why, not what, and only where the reason is not evident.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Record the reasoning behind decisions a reader could not infer from the code.',
      guidance:
        'Comment the reason, never the mechanics. Write a comment where a reader would otherwise ask "why is it done this way", especially around workarounds, ordering constraints and deliberate deviations.',
      category: 'communication',
      priority: 'normal',
      body: body(`
A comment that restates the line above it goes stale and misleads. A comment that names the
constraint the code is satisfying stays useful for years.
      `),
    }),
  }),

  ruleTemplate({
    id: 'rule-ask-when-ambiguous',
    label: 'Ask when the request is ambiguous',
    description: 'Check before building when two readings lead to materially different work.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Resolve ambiguity that would change the outcome, and decide the rest yourself.',
      guidance:
        'Make routine judgement calls without asking. Ask when two readings of the request would produce materially different work, and say which reading you would take by default so the user can simply agree.',
      category: 'process',
      priority: 'normal',
      body: body(`
Asking about everything is as unhelpful as asking about nothing. The question is whether
being wrong would waste the work.
      `),
    }),
  }),
]
