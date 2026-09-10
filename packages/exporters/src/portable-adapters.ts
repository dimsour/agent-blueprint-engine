/**
 * OpenCode and Pi adapters.
 *
 * Both ship their capability matrix, their options schema and the portable artifact set
 * (`AGENTS.md` plus the `.agents/skills` tree), and both report every concept they cannot
 * represent. Their native mappings (`opencode.json`, `.pi/` extensions) are roadmap P8-02 and
 * P8-03; the capability matrices below already describe what those will do, so the
 * compatibility view is accurate today.
 */
import type { Blueprint, Diagnostic, HarnessId } from '@agent-blueprint/core'
import { z } from 'zod'

import { primaryAgentOf } from './shared/instructions'
import {
  emitPortableInstructionFile,
  emitPortableSkillSet,
  PORTABLE_REFERENCES_DIR,
  PORTABLE_SKILLS_DIR,
} from './shared/portable'
import {
  type CapabilityMatrix,
  type CompatibilityIssue,
  type CompileResult,
  type GeneratedFile,
  type HarnessAdapter,
} from './types'

const optionsSchema = z.object({}).prefault({})
export type PortableAdapterOptions = z.output<typeof optionsSchema>

/** Every workflow is an orchestration skill on these harnesses, with neutral wording. */
function workflowIssues(blueprint: Blueprint, harnessId: HarnessId): CompatibilityIssue[] {
  return blueprint.workflows.map((workflow) => ({
    harnessId,
    concept: 'workflows' as const,
    support: 'adapted' as const,
    ref: { kind: 'workflow' as const, id: workflow.id },
    message: `Workflow "${workflow.name}" is compiled to an orchestration skill; the steps are instructions, not enforced control flow.`,
    adaptation: `${PORTABLE_SKILLS_DIR}/${workflow.id}/SKILL.md`,
  }))
}

function idCollisions(blueprint: Blueprint, code: string, location: string): Diagnostic[] {
  return blueprint.workflows
    .filter((workflow) => blueprint.skills.some((skill) => skill.id === workflow.id))
    .map((workflow) => ({
      code,
      severity: 'error' as const,
      message: `Workflow "${workflow.id}" and a skill share an id. Both compile to ${location}/${workflow.id}, so one would overwrite the other.`,
      ref: { kind: 'workflow' as const, id: workflow.id },
      related: [{ kind: 'skill' as const, id: workflow.id }],
    }))
}

function memoryIssue(blueprint: Blueprint, harnessId: HarnessId): CompatibilityIssue[] {
  if (blueprint.memories.length === 0) return []
  return [
    {
      harnessId,
      concept: 'memory',
      support: 'unsupported',
      message: `This harness has no persistent memory. The ${blueprint.memories.length} memory definition(s) are compiled into AGENTS.md as instructions to write notes into the repository instead.`,
      adaptation: 'AGENTS.md "Memory" section',
    },
  ]
}

function permissionIssue(
  blueprint: Blueprint,
  harnessId: HarnessId,
  message: string,
): CompatibilityIssue[] {
  const primary = primaryAgentOf(blueprint)
  if (!primary) return []
  const constrained =
    Object.values(primary.permissions.operations).some((decision) => decision !== 'allow') ||
    primary.permissions.patterns.length > 0
  if (!constrained) return []
  return [
    {
      harnessId,
      concept: 'permissions',
      support: 'adapted',
      ref: { kind: 'agent', id: primary.id },
      message,
      adaptation: 'AGENTS.md "Command policy" section',
    },
  ]
}

// ---------------------------------------------------------------------------
// OpenCode
// ---------------------------------------------------------------------------

const openCodeCapabilities: CapabilityMatrix = {
  skills: {
    support: 'native',
    explanation:
      'OpenCode reads `.agents/skills/` and `.opencode/skills/`; the portable location is used.',
  },
  agents: {
    support: 'native',
    explanation:
      'OpenCode supports `mode: subagent` agents. Emitting `.opencode/agents/*.md` is roadmap P8; agents are described in AGENTS.md today.',
  },
  parallelAgents: {
    support: 'limited',
    explanation:
      'The Task tool spawns subagents, but OpenCode documents no explicit parallel control.',
  },
  workflows: {
    support: 'adapted',
    explanation:
      'Workflows compile to orchestration skills; `.opencode/commands/` entries are roadmap P8.',
  },
  hooks: {
    support: 'adapted',
    explanation:
      'OpenCode hooks are TypeScript plugins rather than declarative JSON; generating `.opencode/plugins/` is roadmap P8.',
  },
  gates: {
    support: 'adapted',
    explanation:
      'Gates become instructions in the workflow skill; enforcing them needs a plugin (roadmap P8).',
  },
  permissions: {
    support: 'adapted',
    explanation:
      'OpenCode has a native allow/ask/deny `permission` block; emitting `opencode.json` is roadmap P8, so permissions are currently a command policy in AGENTS.md.',
  },
  memory: {
    support: 'unsupported',
    explanation:
      'OpenCode has no persistent memory; memory definitions become instructions to keep notes in the repository.',
  },
  pathScopedRules: {
    support: 'adapted',
    explanation:
      'Path-scoped rules become nested `AGENTS.md` files or `instructions` globs; today they are inlined with an "Applies to" line.',
  },
  commands: {
    support: 'native',
    explanation: 'OpenCode supports `.opencode/commands/`; skills already act as commands.',
  },
  ironLaws: { support: 'adapted', explanation: 'Iron Laws become a section in AGENTS.md.' },
  references: {
    support: 'native',
    explanation: 'References attached to a skill are copied beside it.',
  },
}

export const openCodeAdapter: HarnessAdapter<PortableAdapterOptions> = {
  id: 'opencode',
  name: 'OpenCode',
  version: '0.1.0',
  docsUrl: 'https://opencode.ai/docs/skills/',
  capabilities: openCodeCapabilities,
  optionsSchema,
  parseOptions: (raw) => optionsSchema.parse(raw),
  validate: (blueprint) => idCollisions(blueprint, 'BP-OPENCODE-001', PORTABLE_SKILLS_DIR),

  compile(blueprint): CompileResult {
    const files: GeneratedFile[] = [emitPortableInstructionFile(blueprint).file]
    const skillSet = emitPortableSkillSet(blueprint, {
      root: PORTABLE_SKILLS_DIR,
      owner: 'shared',
      referencesDir: PORTABLE_REFERENCES_DIR,
    })
    files.push(...skillSet.files)

    const issues: CompatibilityIssue[] = [
      ...workflowIssues(blueprint, 'opencode'),
      ...memoryIssue(blueprint, 'opencode'),
      ...permissionIssue(
        blueprint,
        'opencode',
        'OpenCode has a native permission block, but emitting `opencode.json` is roadmap P8; for now the permission set is a command policy in AGENTS.md.',
      ),
    ]
    if (blueprint.hooks.length > 0) {
      issues.push({
        harnessId: 'opencode',
        concept: 'hooks',
        support: 'adapted',
        message: `${blueprint.hooks.length} hook(s) need a TypeScript plugin on OpenCode; generating one is roadmap P8, so they are documented rather than enforced.`,
      })
    }
    return { files, issues }
  },
}

// ---------------------------------------------------------------------------
// Pi
// ---------------------------------------------------------------------------

const piCapabilities: CapabilityMatrix = {
  skills: {
    support: 'native',
    explanation:
      'Pi reads `.agents/skills/` and `.pi/skills/`; the portable location is used and skills are invoked with `/skill:<id>`.',
  },
  agents: {
    support: 'unsupported',
    explanation:
      'Pi runs a single agent by design. Other agents are described in AGENTS.md, and delegation steps ask the same session to adopt that persona.',
  },
  parallelAgents: {
    support: 'unsupported',
    explanation:
      'Without subagents there is no parallelism; parallel branches are performed one after another.',
  },
  workflows: {
    support: 'adapted',
    explanation:
      'Workflows compile to orchestration skills. Emitting `.pi/prompts/` templates is roadmap P8.',
  },
  hooks: {
    support: 'adapted',
    explanation:
      'Pi hooks are TypeScript extensions; generating `.pi/extensions/` is roadmap P8, so hooks are documented rather than enforced.',
  },
  gates: {
    support: 'adapted',
    explanation:
      'Gates become instructions in the workflow skill; enforcing them needs an extension (roadmap P8).',
  },
  permissions: {
    support: 'adapted',
    explanation:
      'Pi limits tools through `defaultTools` and extension callbacks; today the permission set is a command policy in AGENTS.md.',
  },
  memory: {
    support: 'unsupported',
    explanation:
      'Pi has context files but no persistent memory; memory definitions become instructions to keep notes in the repository.',
  },
  pathScopedRules: {
    support: 'adapted',
    explanation:
      'Pi loads nested `AGENTS.md`; glob-scoped rules are inlined with an "Applies to" line.',
  },
  commands: {
    support: 'native',
    explanation: 'Pi supports `.pi/prompts/`; skills already act as commands.',
  },
  ironLaws: {
    support: 'adapted',
    explanation:
      'Iron Laws become a section in AGENTS.md; putting critical ones in `.pi/APPEND_SYSTEM.md` is roadmap P8.',
  },
  references: {
    support: 'native',
    explanation: 'References attached to a skill are copied beside it.',
  },
}

export const piAdapter: HarnessAdapter<PortableAdapterOptions> = {
  id: 'pi',
  name: 'Pi',
  version: '0.1.0',
  docsUrl: 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md',
  capabilities: piCapabilities,
  optionsSchema,
  parseOptions: (raw) => optionsSchema.parse(raw),
  validate: (blueprint) => idCollisions(blueprint, 'BP-PI-001', PORTABLE_SKILLS_DIR),

  compile(blueprint): CompileResult {
    const files: GeneratedFile[] = [emitPortableInstructionFile(blueprint).file]
    const skillSet = emitPortableSkillSet(blueprint, {
      root: PORTABLE_SKILLS_DIR,
      owner: 'shared',
      referencesDir: PORTABLE_REFERENCES_DIR,
    })
    files.push(...skillSet.files)

    const issues: CompatibilityIssue[] = [
      ...workflowIssues(blueprint, 'pi'),
      ...memoryIssue(blueprint, 'pi'),
      ...permissionIssue(
        blueprint,
        'pi',
        'Pi enforces tool access through its settings and extensions; today the permission set is a command policy in AGENTS.md rather than an enforced boundary.',
      ),
    ]

    const primary = primaryAgentOf(blueprint)
    for (const agent of blueprint.agents) {
      if (agent.id === primary?.id) continue
      issues.push({
        harnessId: 'pi',
        concept: 'agents',
        support: 'unsupported',
        ref: { kind: 'agent', id: agent.id },
        message: `Pi has no subagents, so "${agent.name}" cannot run as a separate agent. Steps that delegate to it ask the single session to adopt its persona, which loses the isolation the Blueprint asks for.`,
        adaptation: 'AGENTS.md agent roster',
      })
    }
    if (
      blueprint.workflows.some((workflow) =>
        workflow.edges.some((edge) => edge.kind === 'parallel'),
      )
    ) {
      issues.push({
        harnessId: 'pi',
        concept: 'parallelAgents',
        support: 'unsupported',
        message:
          'Parallel workflow branches run one after another on Pi, which changes timing and cost but not the result.',
      })
    }
    if (blueprint.hooks.length > 0) {
      issues.push({
        harnessId: 'pi',
        concept: 'hooks',
        support: 'adapted',
        message: `${blueprint.hooks.length} hook(s) need a Pi extension; generating one is roadmap P8, so they are documented rather than enforced.`,
      })
    }
    return { files, issues }
  },
}
