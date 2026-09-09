/**
 * Hook and gate templates: the parts of a Blueprint that do not rely on the agent
 * remembering.
 *
 * A hook fires on a harness lifecycle event; a gate is a checkpoint a workflow cannot pass.
 * Both carry a command where one exists, because a check the harness can run is worth more
 * than an instruction the agent can talk itself out of.
 */
import { type GateInput, gateSchema, type HookInput, hookSchema } from '@agent-blueprint/core'

import type { ArtifactTemplate } from '../types'
import { defineTemplate } from './define'

function hookTemplate(spec: {
  id: string
  label: string
  description: string
  make: (params: { id: string; name: string }) => HookInput
}): ArtifactTemplate {
  return defineTemplate<HookInput>({
    id: spec.id,
    kind: 'hook',
    label: spec.label,
    description: spec.description,
    parse: (input) => hookSchema.parse(input),
    make: spec.make,
  })
}

function gateTemplate(spec: {
  id: string
  label: string
  description: string
  make: (params: { id: string; name: string }) => GateInput
}): ArtifactTemplate {
  return defineTemplate<GateInput>({
    id: spec.id,
    kind: 'gate',
    label: spec.label,
    description: spec.description,
    parse: (input) => gateSchema.parse(input),
    make: spec.make,
  })
}

export const hookTemplates: ArtifactTemplate[] = [
  hookTemplate({
    id: 'hook-run-tests',
    label: 'Run tests after a change',
    description:
      'Runs the test suite whenever a source file is edited and returns failures to the agent.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Runs the test suite after every file change so a regression is caught in the same turn that caused it.',
      trigger: 'after-file-change',
      conditions: { filePatterns: ['**/*'] },
      action: {
        type: 'run-tests',
        // Replace with the project's own command; every harness runs it verbatim.
        command: 'npm test',
        timeoutSec: 600,
      },
      // The agent gets the failure and fixes it rather than being stopped.
      onFailure: 'return-to-agent',
      severity: 'high',
    }),
  }),

  hookTemplate({
    id: 'hook-format',
    label: 'Format after a change',
    description: 'Runs the formatter after an edit so formatting never appears in a review.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Runs the project formatter after a file changes, so formatting is never something a human has to comment on.',
      trigger: 'after-file-change',
      action: { type: 'format', command: 'npm run format', timeoutSec: 120 },
      onFailure: 'warn',
      severity: 'low',
    }),
  }),

  hookTemplate({
    id: 'hook-secret-scan',
    label: 'Scan for secrets before finishing',
    description: 'Blocks the turn when a credential is about to be left in the working tree.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Scans the working tree for credentials before the agent finishes, and blocks if it finds one.',
      trigger: 'before-stop',
      action: {
        type: 'secret-scan',
        // Any scanner that exits non-zero on a finding works here.
        command:
          'git diff --cached --name-only | xargs --no-run-if-empty grep -nE "(api[_-]?key|secret|password|BEGIN [A-Z ]*PRIVATE KEY)" && exit 2 || exit 0',
        timeoutSec: 120,
      },
      onFailure: 'block',
      severity: 'critical',
    }),
  }),
]

export const gateTemplates: ArtifactTemplate[] = [
  gateTemplate({
    id: 'gate-tests-pass',
    label: 'Tests must pass',
    description: 'Work cannot be reported as complete while any test fails.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'The task is not complete until the suite runs green and the output has been read.',
      criteria: [
        {
          kind: 'tests-pass',
          description: 'Every test in the affected projects passes.',
          command: 'npm test',
        },
      ],
      onFail: 'block',
    }),
  }),

  gateTemplate({
    id: 'gate-human-approval',
    label: 'Human approval',
    description: 'Stops for a person before an irreversible or outward-facing step.',
    make: ({ id, name }) => ({
      id,
      name,
      description:
        'Stops and asks a person before anything irreversible or visible outside the repository happens.',
      criteria: [
        {
          kind: 'human-approval',
          description:
            'A person has seen exactly what will happen (the diff, the command, the target) and said to proceed.',
        },
      ],
      onFail: 'request-approval',
    }),
  }),
]
