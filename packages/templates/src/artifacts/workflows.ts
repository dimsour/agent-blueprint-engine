/**
 * Workflow templates.
 *
 * A workflow template supplies the shape of the work and the prose that goes with it, not
 * the cast: its `agent`, `skill` and `gate` steps are deliberately unassigned, so the
 * validator asks the user to wire them (BP-WF-005) instead of the template inventing ids
 * that do not exist. Every template ends in a verification or a gate, because a workflow
 * that cannot tell whether it succeeded is the failure mode this product exists to prevent.
 */
import { type WorkflowInput, workflowSchema } from '@agent-blueprint/core'

import type { ArtifactTemplate } from '../types'
import { body, chain, defineTemplate, fanOut, type StepSpec } from './define'

function workflowTemplate(spec: {
  id: string
  label: string
  description: string
  make: (params: { id: string; name: string }) => WorkflowInput
}): ArtifactTemplate {
  return defineTemplate<WorkflowInput>({
    id: spec.id,
    kind: 'workflow',
    label: spec.label,
    description: spec.description,
    parse: (input) => workflowSchema.parse(input),
    make: spec.make,
  })
}

const start: StepSpec = { id: 'start', type: 'start', label: 'Start' }
const end: StepSpec = { id: 'end', type: 'end', label: 'Report the outcome' }

const step = (
  id: string,
  label: string,
  description: string,
  extra: Partial<StepSpec> = {},
): StepSpec => ({ id, type: 'agent', label, description, ...extra })

const verify = (id: string, label: string, description: string, command?: string): StepSpec => ({
  id,
  type: 'verification',
  label,
  description,
  config: {
    verification: { method: command ? 'command' : 'review', ...(command ? { command } : {}) },
    onFailure: 'retry',
  },
})

export const workflowTemplates: ArtifactTemplate[] = [
  workflowTemplate({
    id: 'workflow-feature-implementation',
    label: 'Feature implementation',
    description:
      'Understand, plan, implement, verify and review a feature, with a gate before it is called done.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Take a feature request from understanding it to verified, reviewed code.',
      tags: ['development'],
      triggers: { intents: ['implement a feature', 'add functionality', 'build this'] },
      ...chain([
        start,
        step(
          'understand',
          'Understand the request',
          'Restate the request, list what is in scope and what is not, and name the acceptance criteria.',
          {
            config: { outputSpec: 'a restatement, the scope boundary and the acceptance criteria' },
          },
        ),
        step(
          'survey',
          'Read the surrounding code',
          'Find the existing patterns this change must match: naming, layering, error handling, tests.',
          { config: { outputSpec: 'the files that will change and the conventions to follow' } },
        ),
        step(
          'plan',
          'Plan the change',
          'Write the steps, in order, with the smallest first change that can be verified.',
          { config: { outputSpec: 'an ordered plan whose steps can each be checked' } },
        ),
        step('implement', 'Implement', 'Work the plan. Keep each step small enough to verify.'),
        verify('verify', 'Verify', 'Run the project checks and read the output.', 'npm test'),
        {
          id: 'review',
          type: 'review',
          label: 'Review the change',
          description:
            'Read the diff as a reviewer: does it meet the acceptance criteria, does it match the conventions, does it leave anything half-done?',
        },
        {
          id: 'gate',
          type: 'gate',
          label: 'Ready to report',
          description: 'Assign a gate that must hold before this is reported as complete.',
        },
        end,
      ]),
      body: body(`
Deliver the feature the user asked for, not the one that would be easier to build.

Two rules make this workflow work. Understand before you plan: a restatement the user agrees
with is cheaper than a rewrite. Verify before you report: run the checks and quote what they
said, never what they should have said.

If the request turns out to be larger than one change, say so and propose the split rather
than starting a change you cannot finish.
      `),
    }),
  }),

  workflowTemplate({
    id: 'workflow-bug-investigation',
    label: 'Bug investigation',
    description:
      'Reproduce, isolate, explain and fix a defect, with a regression test that fails before the fix.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Find the real cause of a defect and prove the fix with a test.',
      tags: ['debugging'],
      triggers: { intents: ['fix a bug', 'investigate a failure', 'this is broken'] },
      ...chain([
        start,
        step(
          'reproduce',
          'Reproduce',
          'Get the failure to happen on demand and write down the exact steps and output.',
          { config: { outputSpec: 'a reliable reproduction and the observed error' } },
        ),
        step(
          'isolate',
          'Isolate',
          'Narrow the failure to the smallest input, code path or commit that still shows it.',
          { config: { outputSpec: 'the narrowest case that still fails' } },
        ),
        step(
          'explain',
          'Explain the cause',
          'State the mechanism: what the code does, what it should do, and why the difference produces this symptom.',
          { config: { outputSpec: 'a causal explanation, not a suspicion' } },
        ),
        step(
          'regression-test',
          'Write a failing test',
          'Add a test that fails for this reason and would pass once the cause is removed.',
        ),
        verify(
          'confirm-failure',
          'Confirm it fails',
          'Run the new test and confirm it fails for the stated reason, not for a different one.',
          'npm test',
        ),
        step('fix', 'Fix the cause', 'Change the cause, not the symptom.'),
        verify(
          'confirm-fix',
          'Confirm it passes',
          'Run the whole suite, not just the new test.',
          'npm test',
        ),
        end,
      ]),
      body: body(`
A bug is understood when you can explain why it happens, not when the symptom disappears.

The failing test comes before the fix on purpose: a test that has never failed proves
nothing. If the test passes before you change anything, it is testing the wrong thing.

If the cause turns out to be a design problem rather than a defect, stop and say so instead
of patching around it.
      `),
    }),
  }),

  workflowTemplate({
    id: 'workflow-code-review',
    label: 'Code review',
    description:
      'Review a change along several dimensions in parallel, then synthesise one prioritised report.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Review a change for correctness, security, tests and design, and report findings by severity.',
      tags: ['review'],
      triggers: { intents: ['review this', 'review the change', 'review the pull request'] },
      ...fanOut({
        before: [
          start,
          step(
            'read',
            'Read the change',
            'Read the diff and enough of the surrounding code to judge it. Note what the change is trying to do.',
            { config: { outputSpec: 'the intent of the change and the files it touches' } },
          ),
          { id: 'split', type: 'parallel', label: 'Review in parallel' },
        ],
        branches: [
          [
            {
              id: 'correctness',
              type: 'review',
              label: 'Correctness',
              description:
                'Look for logic that is wrong for some input: boundaries, empty cases, error paths, concurrency, and assumptions the code makes without checking.',
            },
          ],
          [
            {
              id: 'security',
              type: 'review',
              label: 'Security',
              description:
                'Look for untrusted input reaching a dangerous sink, missing authorisation, secrets in code or logs, and dependencies added without review.',
            },
          ],
          [
            {
              id: 'tests',
              type: 'review',
              label: 'Tests',
              description:
                'Do the tests cover the behaviour that changed, including the failure paths? Would they fail if the change were wrong?',
            },
          ],
          [
            {
              id: 'design',
              type: 'review',
              label: 'Design',
              description:
                'Does the change fit the existing structure, or does it work around it? Is there a simpler shape with the same behaviour?',
            },
          ],
        ],
        merge: {
          id: 'synthesis',
          type: 'synthesis',
          label: 'Combine the findings',
          description:
            'Merge the four reviews into one list, remove duplicates, and order by severity: correctness and security first.',
          config: { mergeStrategy: 'synthesize' },
        },
        after: [
          {
            id: 'report',
            type: 'output',
            label: 'Report',
            description:
              'One report, each finding with file and line, what is wrong, and what to do.',
            config: {
              outputSpec: 'findings grouped by severity, each with file:line and a suggested fix',
            },
          },
          end,
        ],
      }),
      body: body(`
A review is worth reading when every finding is actionable and ordered by how much it
matters. Four passes run independently so that a security problem is not missed while
arguing about naming.

Report what is wrong and why it matters. Do not report style that a formatter settles, and
do not pad the list to look thorough: a short accurate review is more useful than a long one.

Say explicitly what you did not check.
      `),
    }),
  }),

  workflowTemplate({
    id: 'workflow-test-generation',
    label: 'Test generation',
    description:
      'List the behaviours of a unit, write one test per behaviour, and run them before reporting.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Write tests that document behaviour and fail for the right reasons.',
      tags: ['testing'],
      triggers: { intents: ['write tests', 'add unit tests', 'improve coverage'] },
      ...chain([
        start,
        step(
          'behaviours',
          'List the behaviours',
          'List what the unit promises through its public surface, including failure modes and boundaries.',
          { config: { outputSpec: 'a list of behaviours, each one testable' } },
        ),
        step(
          'conventions',
          'Match the project',
          'Find the test framework, assertion library and naming the project already uses, and follow them.',
          { config: { outputSpec: 'the framework, assertion style and file layout to use' } },
        ),
        step(
          'write',
          'Write the tests',
          'One test per behaviour: arrange, act, assert, in that order.',
        ),
        verify('run', 'Run them', 'Run the suite and read the output.', 'npm test'),
        {
          id: 'mutate',
          type: 'review',
          label: 'Check they can fail',
          description:
            'Break the code under test on purpose and confirm the new tests fail. A test that passes against broken code is not a test.',
        },
        {
          id: 'gate',
          type: 'gate',
          label: 'All tests pass',
          description: 'Assign a gate that requires a green suite.',
        },
        end,
      ]),
      body: body(`
Test the behaviour, not the implementation. A test that reaches into private state will
break on the next refactor and will still not tell you whether the unit works.

The step that separates real tests from decoration is the one where you break the code and
watch the test fail. Do it once per new test file at least.
      `),
    }),
  }),

  workflowTemplate({
    id: 'workflow-security-audit',
    label: 'Security audit',
    description:
      'Map the attack surface, check each class of weakness, and report findings with severity and a fix.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Audit a codebase or a change for security weaknesses, with evidence for each finding.',
      tags: ['security'],
      triggers: { intents: ['security review', 'audit this', 'check for vulnerabilities'] },
      ...chain([
        start,
        step(
          'surface',
          'Map the attack surface',
          'List the entry points: routes, message handlers, CLI arguments, file and network input, and anything that deserialises data.',
          { config: { outputSpec: 'the entry points and what each one trusts' } },
        ),
        step(
          'data-flow',
          'Follow untrusted input',
          'For each entry point, follow the input to where it is used: queries, commands, file paths, templates, redirects.',
          { config: { outputSpec: 'paths from untrusted input to a dangerous sink' } },
        ),
        step(
          'authz',
          'Check authentication and authorisation',
          'Who may call this, and where is that enforced? Look for checks that are missing, done in the wrong place, or bypassable.',
        ),
        step(
          'secrets',
          'Check secrets and logging',
          'Look for credentials in code, config or logs, and for error messages that leak internals.',
        ),
        step(
          'dependencies',
          'Check dependencies',
          'Look for known-vulnerable and unmaintained packages, and for anything added recently without review.',
        ),
        verify(
          'scan',
          'Run the scanners',
          'Run the project security tooling and read the output; treat it as a floor, not a verdict.',
          'npm audit',
        ),
        {
          id: 'report',
          type: 'output',
          label: 'Report',
          description:
            'Each finding: what an attacker can do, how you know, how likely, and the smallest fix.',
          config: { outputSpec: 'findings ordered by severity, each with evidence and a fix' },
        },
        end,
      ]),
      body: body(`
State what an attacker gains, not that something "looks insecure". A finding without a
concrete consequence cannot be prioritised and will be ignored.

Never include a working exploit. Describe the class of problem, the evidence, and the fix.

Say what you did not audit, and why.
      `),
    }),
  }),

  workflowTemplate({
    id: 'workflow-refactoring',
    label: 'Refactoring',
    description:
      'Change structure without changing behaviour, with a green suite before and after every step.',
    make: ({ id, name }) => ({
      id,
      name,
      description: 'Improve the shape of existing code while keeping its behaviour identical.',
      tags: ['development'],
      triggers: { intents: ['refactor this', 'clean this up', 'restructure'] },
      ...chain([
        start,
        verify(
          'baseline',
          'Establish a baseline',
          'Run the suite first. If it is not green, stop: you cannot refactor against an unknown baseline.',
          'npm test',
        ),
        step(
          'characterise',
          'Characterise the behaviour',
          'If the code is not covered, add tests that pin the current behaviour, including the parts that look wrong.',
          { config: { outputSpec: 'coverage of the behaviour that must not change' } },
        ),
        step(
          'target',
          'Name the target shape',
          'Say what the structure should be and why it is better. If you cannot name the benefit, do not refactor.',
          { config: { outputSpec: 'the target structure and the reason for it' } },
        ),
        step(
          'small-steps',
          'Move in small steps',
          'Make one behaviour-preserving change at a time. Run the tests after each one.',
          { config: { maxAttempts: 10 } },
        ),
        verify(
          'confirm',
          'Confirm behaviour is unchanged',
          'Run the full suite again.',
          'npm test',
        ),
        {
          id: 'gate',
          type: 'gate',
          label: 'Behaviour unchanged',
          description: 'Assign a gate that requires the same tests passing as at the baseline.',
        },
        end,
      ]),
      body: body(`
Refactoring means the behaviour does not change. If a test had to change, either it was
testing the implementation, or this is not a refactor. Say which.

Never mix a refactor with a fix or a feature in the same step. If you find a bug while
refactoring, write it down and deal with it separately.
      `),
    }),
  }),

  workflowTemplate({
    id: 'workflow-research',
    label: 'Research',
    description:
      'Answer an open question from sources, with the evidence and the uncertainty stated.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Investigate an open question and report an answer that cites what it is based on.',
      tags: ['research'],
      triggers: {
        intents: ['research', 'find out how', 'compare options', 'what is the best way to'],
      },
      ...chain([
        start,
        step(
          'question',
          'Sharpen the question',
          'Restate the question so that an answer would be recognisably right or wrong, and state the constraints that matter.',
          { config: { outputSpec: 'a decidable question and its constraints' } },
        ),
        step(
          'sources',
          'Gather sources',
          'Prefer primary sources: official documentation, the source itself, release notes. Record where each claim came from.',
          { config: { outputSpec: 'sources with what each one supports' } },
        ),
        step(
          'compare',
          'Compare the options',
          'Lay the candidates against the constraints. Include what each one costs, not only what it offers.',
          { config: { outputSpec: 'a comparison against the stated constraints' } },
        ),
        {
          id: 'verify',
          type: 'verification',
          label: 'Check the claims',
          description:
            'Confirm the load-bearing claims against a source or a small experiment. Mark anything you could not confirm.',
          config: { verification: { method: 'manual' }, onFailure: 'continue' },
        },
        {
          id: 'recommend',
          type: 'output',
          label: 'Recommend',
          description:
            'One recommendation, the reason, what would change it, and what remains uncertain.',
          config: { outputSpec: 'a recommendation with its rationale and open questions' },
        },
        end,
      ]),
      body: body(`
The output of research is a decision someone can act on, with the evidence attached.

Separate what you verified from what you inferred, and never present a plausible answer as a
confirmed one. "I could not confirm this" is a useful result.
      `),
    }),
  }),
]
