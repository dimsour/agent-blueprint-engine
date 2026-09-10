/**
 * A large project, generated rather than checked in.
 *
 * P8-07 needs a Blueprint big enough for the cost of an algorithm to show above the noise.
 * Two hundred artifacts as files in the repository would be two hundred files nobody reads,
 * kept in canonical form by hand forever; generated, it is one function, it is deterministic,
 * and the size is a parameter, so the same code answers "is it linear?" as well as "is it
 * fast enough?".
 *
 * The output is project *files*, not a Blueprint: this package must not depend on core (core's
 * own tests depend on this one), and reading the files is part of what is being measured.
 * Nothing here is random — same count in, same bytes out.
 */

export interface StressProjectOptions {
  /** Total artifacts. Split across the kinds below in fixed proportion. Default 200. */
  artifacts?: number
}

/** How the total is divided. Sums to 20, so each share is `artifacts * n / 20`. */
const MIX = {
  agents: 1,
  skills: 6,
  workflows: 2,
  laws: 3,
  rules: 3,
  references: 2,
  requirements: 2,
  tools: 1,
} as const

type Kind = keyof typeof MIX

/** Deterministic and readable: `skill-007`, so a failure names something findable. */
function id(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(3, '0')}`
}

function counts(total: number): Record<Kind, number> {
  const shares = Object.values(MIX).reduce((sum, share) => sum + share, 0)
  const entries = Object.entries(MIX) as [Kind, number][]
  return Object.fromEntries(
    entries.map(([kind, share]) => [kind, Math.max(1, Math.round((total * share) / shares))]),
  ) as Record<Kind, number>
}

/** A body long enough that text-scanning rules have something to scan. */
function body(subject: string): string {
  return [
    `## Purpose`,
    `Everything about ${subject}, stated at the length a real artifact reaches.`,
    `## Instructions`,
    `1. Read the code before changing it.`,
    `2. State what you verified and what you did not.`,
    `3. Never claim a result you did not observe.`,
    `## Verification`,
    `Run the suite and read the output.`,
  ].join('\n\n')
}

/**
 * A workflow graph: start, three steps, a verification and an end, wired in a line with one
 * retry edge back. Enough shape that the graph rules have real work rather than a stub.
 */
function workflowGraph(index: number, agentId: string, skillId: string): string {
  const nodes = [
    { id: 'start', type: 'start', label: 'Start', position: { x: 0, y: 0 }, config: {} },
    {
      id: 'work',
      type: 'agent',
      label: 'Do the work',
      position: { x: 0, y: 120 },
      config: { agentId, contextInputs: [], outputSpec: 'The change, described.' },
    },
    {
      id: 'apply',
      type: 'skill',
      label: 'Apply the skill',
      position: { x: 0, y: 240 },
      config: { skillId },
    },
    {
      id: 'check',
      type: 'verification',
      label: 'Verify',
      position: { x: 0, y: 360 },
      config: { method: 'command', command: 'npm test' },
    },
    { id: 'done', type: 'end', label: 'Done', position: { x: 0, y: 480 }, config: {} },
  ]
  const edges = [
    { id: 'e1', from: 'start', to: 'work', kind: 'sequential', required: true },
    { id: 'e2', from: 'work', to: 'apply', kind: 'sequential', required: true },
    { id: 'e3', from: 'apply', to: 'check', kind: 'sequential', required: true },
    { id: 'e4', from: 'check', to: 'done', kind: 'sequential', required: true },
    { id: 'e5', from: 'check', to: 'work', kind: 'retry', required: false },
  ]
  void index
  return `${JSON.stringify({ entryNodeId: 'start', nodes, edges }, null, 2)}\n`
}

function frontmatter(data: Record<string, unknown>, text: string): string {
  const lines: string[] = ['---']
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${item}`)
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }
  lines.push('---', '', text)
  return `${lines.join('\n')}\n`
}

/**
 * The whole project as `{ path: content }`, in the shape `readProject` consumes.
 *
 * Every reference points at something that exists: a Blueprint with dangling references would
 * measure the error path instead of the working one.
 */
export function stressProjectFiles(options: StressProjectOptions = {}): Record<string, string> {
  const total = options.artifacts ?? 200
  const size = counts(total)
  const files: Record<string, string> = {}

  const agentIds = Array.from({ length: size.agents }, (_, index) => id('agent', index))
  const skillIds = Array.from({ length: size.skills }, (_, index) => id('skill', index))
  const workflowIds = Array.from({ length: size.workflows }, (_, index) => id('workflow', index))
  const lawIds = Array.from({ length: size.laws }, (_, index) => id('law', index))
  const ruleIds = Array.from({ length: size.rules }, (_, index) => id('rule', index))
  const referenceIds = Array.from({ length: size.references }, (_, index) => id('reference', index))
  const requirementIds = Array.from({ length: size.requirements }, (_, index) =>
    id('requirement', index),
  )
  const toolIds = Array.from({ length: size.tools }, (_, index) => id('tool', index))

  /** Spread the references around so every artifact is reachable from some agent. */
  const slice = <T>(items: T[], owner: number, owners: number): T[] =>
    items.filter((_, index) => index % owners === owner % owners)

  agentIds.forEach((agentId, index) => {
    files[`blueprint/agents/${agentId}.md`] = frontmatter(
      {
        name: `Agent ${index}`,
        description: `Owns the ${index}th slice of the work.`,
        role: index === 0 ? 'orchestrator' : 'worker',
        expertise: ['TypeScript', 'testing'],
        responsibilities: [`Handle the ${index}th slice`, 'Report what was verified'],
        skillIds: slice(skillIds, index, agentIds.length),
        workflowIds: slice(workflowIds, index, agentIds.length),
        ironLawIds: slice(lawIds, index, agentIds.length),
        ruleIds: slice(ruleIds, index, agentIds.length),
        toolIds: slice(toolIds, index, agentIds.length),
        referenceIds: slice(referenceIds, index, agentIds.length),
        outputRequirements: ['Tests pass before the task is reported as done'],
      },
      body(`agent ${index}`),
    )
  })

  skillIds.forEach((skillId, index) => {
    files[`blueprint/skills/${skillId}/SKILL.md`] = frontmatter(
      {
        name: `Skill ${index}`,
        description: `What to do about topic ${index}, and how to check it worked.`,
        whenToUse: `When the task touches topic ${index}.`,
        referenceIds: slice(referenceIds, index, skillIds.length),
      },
      body(`skill ${index}`),
    )
    files[`blueprint/skills/${skillId}/references/notes.md`] = `# Notes ${index}\n`
  })

  workflowIds.forEach((workflowId, index) => {
    files[`blueprint/workflows/${workflowId}.md`] = frontmatter(
      {
        name: `Workflow ${index}`,
        description: `From a request to a verified change, for topic ${index}.`,
      },
      body(`workflow ${index}`),
    )
    files[`blueprint/workflows/${workflowId}.workflow.json`] = workflowGraph(
      index,
      agentIds[index % agentIds.length] ?? 'agent-000',
      skillIds[index % skillIds.length] ?? 'skill-000',
    )
  })

  lawIds.forEach((lawId, index) => {
    files[`blueprint/laws/${lawId}.md`] = frontmatter(
      {
        name: `Law ${index}`,
        description: `The ${index}th thing that is never acceptable.`,
        rule: `Never do the ${index}th forbidden thing, whatever the pressure.`,
        rationale: `Doing it costs more than the time it saves.`,
        violationBehavior: 'Stop, say what happened, and correct it before continuing.',
        severity: index % 5 === 0 ? 'critical' : 'high',
        category: 'code-quality',
      },
      body(`law ${index}`),
    )
  })

  ruleIds.forEach((ruleId, index) => {
    files[`blueprint/rules/${ruleId}.md`] = frontmatter(
      {
        name: `Rule ${index}`,
        description: `Guidance for topic ${index}.`,
        guidance: `Prefer the ${index}th established approach over inventing another one.`,
        category: 'general',
        paths: index % 3 === 0 ? [`src/area-${index}/**`] : [],
      },
      body(`rule ${index}`),
    )
  })

  referenceIds.forEach((referenceId, index) => {
    files[`blueprint/references/${referenceId}.md`] = frontmatter(
      { name: `Reference ${index}`, description: `Background on topic ${index}.` },
      body(`reference ${index}`),
    )
  })

  requirementIds.forEach((requirementId, index) => {
    files[`blueprint/requirements/${requirementId}.md`] = frontmatter(
      {
        name: `Requirement ${index}`,
        description: `The ${index}th thing the Blueprint must satisfy.`,
        statement: `Topic ${index} is handled by a skill and verified by a workflow.`,
        level: 'must',
      },
      body(`requirement ${index}`),
    )
  })

  toolIds.forEach((toolId, index) => {
    files[`blueprint/tools/${toolId}.yaml`] =
      `name: Tool ${index}\ndescription: The ${index}th tool the agents may use.\nkind: shell\noperations:\n  - run\n`
  })

  const list = (ids: string[]): string =>
    ids.length === 0 ? '' : `\n${ids.map((value) => `    - ${value}`).join('\n')}`

  files['blueprint/blueprint.yaml'] = [
    'schemaVersion: "1.0"',
    'id: stress-project',
    'name: Stress Project',
    'version: 1.0.0',
    `description: A generated Blueprint with ${total} artifacts, for measuring how the app scales.`,
    'settings:',
    `  primaryAgentId: ${agentIds[0] ?? 'agent-000'}`,
    'targets:',
    '  - harnessId: claude-code',
    '  - harnessId: codex',
    'artifacts:',
    `  agents:${list(agentIds)}`,
    `  skills:${list(skillIds)}`,
    `  workflows:${list(workflowIds)}`,
    `  ironLaws:${list(lawIds)}`,
    `  rules:${list(ruleIds)}`,
    `  tools:${list(toolIds)}`,
    `  references:${list(referenceIds)}`,
    `  requirements:${list(requirementIds)}`,
    '',
  ].join('\n')

  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)))
}
