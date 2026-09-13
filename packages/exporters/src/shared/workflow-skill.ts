/**
 * Compiles a workflow graph into an orchestration skill body.
 *
 * No harness has a workflow primitive, so the graph becomes an invocable skill that spells
 * out the steps, who performs each one, what has to be verified and what must not be
 * skipped. This is the one place where the visual graph turns into behaviour, so the
 * rendering is deliberately explicit: an agent reading it should not have to infer control
 * flow.
 */
import type {
  Blueprint,
  IronLaw,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfig,
} from '@agent-blueprint/core'

import { code, Markdown } from './markdown'
import type { Phrasing } from './phrasing'
import { flattenSteps, walkWorkflow, type WalkItem } from './workflow-walk'

export interface WorkflowSkillResult {
  body: string
  /** Problems worth surfacing in the compatibility view. */
  notes: { message: string; nodeId?: string }[]
}

interface RenderContext {
  blueprint: Blueprint
  workflow: Workflow
  phrasing: Phrasing
  primaryAgentId: string | undefined
  /** Step number by node id, for retry and fallback cross-references. */
  numbers: Map<string, number>
  notes: { message: string; nodeId?: string }[]
}

/**
 * The description of the skill a workflow compiles to. Every harness lists skills and
 * workflows in one command menu, by name and description, so the description says which
 * this is: a person choosing between `/write-tests` and `/xunit` sees "Workflow:" on one.
 */
export function workflowSkillDescription(workflow: Workflow): string {
  return `Workflow: ${workflow.description ?? workflow.name}`
}

export function emitWorkflowSkill(
  workflow: Workflow,
  blueprint: Blueprint,
  phrasing: Phrasing,
): WorkflowSkillResult {
  const walk = walkWorkflow(workflow)
  const notes: { message: string; nodeId?: string }[] = []
  if (walk.entryProblem) notes.push({ message: walk.entryProblem })

  const numbers = new Map<string, number>()
  walk.items.forEach((item, index) => numbers.set(item.node.id, index + 1))

  const ctx: RenderContext = {
    blueprint,
    workflow,
    phrasing,
    primaryAgentId: blueprint.settings.primaryAgentId ?? blueprint.agents[0]?.id,
    numbers,
    notes,
  }

  const md = new Markdown()
  md.paragraph(workflow.description)

  const trigger = triggerSentence(workflow)
  if (trigger) md.paragraph(trigger)

  // What a person types to start it. Without this the skill says what it does and never
  // how it is called, and an argument the steps rely on is a guess.
  if (workflow.argumentHint) {
    md.heading(2, 'Usage')
    md.paragraph(
      `Invoke: ${phrasing.workflowInvocation(workflow.id)}, with ${code(workflow.argumentHint)} as the argument. The steps below refer to whatever was given there as the argument.`,
    )
  }

  md.heading(2, 'Steps')
  const steps = walk.items.map((item) => renderItem(item, ctx))
  if (steps.length === 0) md.paragraph('This workflow has no steps yet.')
  else md.numbered(steps)

  const laws = scopedLaws(blueprint, workflow.id)
  if (laws.length > 0) {
    md.heading(2, 'Non-negotiable')
    md.bullets(laws.map((law) => `**${law.name}.** ${law.rule}`))
  }

  if (workflow.body.trim().length > 0) {
    md.heading(2, 'Notes')
    md.raw(workflow.body)
  }

  if (walk.unreachable.length > 0) {
    md.heading(2, 'Unreachable steps (fix in the Blueprint)')
    md.bullets(walk.unreachable.map((node) => `${node.label} (${code(node.id)}, ${node.type})`))
    for (const node of walk.unreachable) {
      notes.push({
        message: `Step "${node.label}" is not reachable from the entry node and was listed separately.`,
        nodeId: node.id,
      })
    }
  }

  return { body: md.render().trimEnd(), notes }
}

function triggerSentence(workflow: Workflow): string | undefined {
  const intents = workflow.triggers.intents
  if (intents.length === 0) return undefined
  return `Use this workflow when the user asks to ${intents.map((i) => `"${i}"`).join(', ')}.`
}

function scopedLaws(blueprint: Blueprint, workflowId: string): IronLaw[] {
  // Laws that apply everywhere are already in the root instruction file; only laws that
  // single out this workflow are repeated here.
  return blueprint.ironLaws.filter(
    (law) => !law.scope.all && law.scope.workflowIds.includes(workflowId),
  )
}

function renderItem(item: WalkItem, ctx: RenderContext): string {
  if (item.kind === 'step') return renderStep(item.node, item.deferred, ctx)

  const lines = [renderStep(item.node, item.deferred, ctx)]
  const intro =
    item.groupKind === 'parallel'
      ? 'Run these branches at the same time:'
      : 'Take the matching branch:'
  lines.push(`- ${intro}`)
  for (const branch of item.branches) {
    const label = branchLabel(branch.edge)
    lines.push(`  - ${label}`)
    for (const sub of branch.items) {
      for (const line of renderItem(sub, ctx).split('\n')) lines.push(`    - ${stripBullet(line)}`)
    }
  }
  return lines.join('\n')
}

function branchLabel(edge: WorkflowEdge): string {
  const condition = edge.condition ?? edge.label
  const optional = edge.required ? '' : ' (optional)'
  return condition ? `**If ${condition}**${optional}:` : `**${edge.to}**${optional}:`
}

/** Nested rendering re-indents lines; existing list markers would nest twice. */
function stripBullet(line: string): string {
  return line.replace(/^(\s*)- /, '$1')
}

function renderStep(node: WorkflowNode, deferred: WorkflowEdge[], ctx: RenderContext): string {
  const lines: string[] = [`**${node.label}** — ${mechanism(node, ctx)}`]
  const details: string[] = []

  if (node.description) details.push(node.description)

  const config = node.config
  if (config.contextInputs.length > 0) {
    details.push(`Give it: ${config.contextInputs.join('; ')}.`)
  }
  if (config.outputSpec && node.type !== 'output') {
    details.push(`It must return: ${config.outputSpec}.`)
  }
  if (node.type === 'gate') details.push(...gateDetails(node, ctx))
  if (config.onFailure) details.push(`On failure: ${failureText(config.onFailure)}.`)

  for (const edge of deferred) details.push(deferredText(edge, node, ctx))

  for (const detail of details) lines.push(`- ${detail}`)
  return lines.join('\n')
}

function mechanism(node: WorkflowNode, ctx: RenderContext): string {
  const { config } = node
  switch (node.type) {
    case 'start':
      return 'begin here.'
    case 'end':
      return 'report the outcome, including what was verified and what was not.'
    case 'agent':
    case 'delegate': {
      const agentId = config.agentId
      if (agentId === undefined) return 'perform this step (no agent assigned yet).'
      if (node.type === 'agent' && agentId === ctx.primaryAgentId) return 'you do this yourself.'
      if (!ctx.phrasing.supportsDelegation) {
        ctx.notes.push({
          message: `Step "${node.label}" delegates to the ${code(agentId)} agent, which this harness cannot run as a separate agent.`,
          nodeId: node.id,
        })
      }
      return `${ctx.phrasing.delegate(agentId)}.`
    }
    case 'skill': {
      const skillId = config.skillId
      return skillId === undefined
        ? 'apply the relevant skill (none assigned yet).'
        : `${ctx.phrasing.invokeSkill(skillId)}.`
    }
    case 'tool': {
      const tool = ctx.blueprint.tools.find((t) => t.id === config.toolId)
      return tool ? `use ${tool.name}.` : 'use the assigned tool (none assigned yet).'
    }
    case 'condition':
      return config.expression ? `decide: ${config.expression}` : 'decide which branch applies.'
    case 'verification':
      return verificationText(node)
    case 'review':
      return 'review the result and report what is wrong before continuing.'
    case 'gate':
      return 'checkpoint. Do not continue unless every criterion below holds.'
    case 'human-approval':
      return `stop and ask the user for approval${config.approvalPrompt ? `: ${config.approvalPrompt}` : '.'}`
    case 'output':
      return config.outputSpec ? `produce: ${config.outputSpec}.` : 'produce the result.'
    case 'parallel':
      return 'fan out.'
    case 'merge':
      return mergeText(config.mergeStrategy)
    case 'retry':
      return `retry the previous step up to ${config.maxAttempts ?? 3} times.`
    case 'synthesis':
      return 'combine the branch results into one answer, resolving disagreements explicitly.'
  }
}

function verificationText(node: WorkflowNode): string {
  const verification = node.config.verification
  if (!verification) return 'verify the result.'
  switch (verification.method) {
    case 'tests':
    case 'command':
      return verification.command
        ? `verify by running ${code(verification.command)} and reading its output.`
        : 'verify by running the project checks and reading their output.'
    case 'review':
      return 'verify by reviewing the result against the requirements.'
    case 'manual':
      return 'verify manually and state what was checked.'
  }
}

function mergeText(strategy: WorkflowNodeConfig['mergeStrategy']): string {
  switch (strategy) {
    case 'any':
      return 'continue as soon as any branch finishes.'
    case 'first':
      return 'take the first branch that finishes and stop the others.'
    case 'synthesize':
      return 'combine every branch result into one answer.'
    case 'all':
    case undefined:
      return 'wait for every branch to finish before continuing.'
  }
}

function failureText(onFailure: NonNullable<WorkflowNodeConfig['onFailure']>): string {
  switch (onFailure) {
    case 'continue':
      return 'note the problem and continue'
    case 'fallback':
      return 'take the fallback step'
    case 'retry':
      return 'fix the cause and try again'
    case 'stop':
      return 'stop and report what failed'
  }
}

function gateDetails(node: WorkflowNode, ctx: RenderContext): string[] {
  const gate = ctx.blueprint.gates.find((g) => g.id === node.config.gateId)
  if (!gate) return ['No gate is assigned to this checkpoint yet.']
  const details = gate.criteria.map((criterion) => {
    const text = criterion.description ?? criterionLabel(criterion.kind)
    return criterion.command ? `${text} (run ${code(criterion.command)})` : text
  })
  details.push(`If it fails: ${gateFailureText(gate.onFail)}.`)
  return details
}

function criterionLabel(kind: string): string {
  switch (kind) {
    case 'tests-pass':
      return 'All tests pass'
    case 'lint':
      return 'The linter reports no errors'
    case 'security-scan':
      return 'The security scan is clean'
    case 'requirements-check':
      return 'Every requirement is met'
    case 'review':
      return 'The result has been reviewed'
    case 'human-approval':
      return 'A human has approved'
    default:
      return 'The check passes'
  }
}

function gateFailureText(onFail: string): string {
  switch (onFail) {
    case 'allow':
      return 'note it and continue'
    case 'warn':
      return 'warn the user and continue'
    case 'request-approval':
      return 'stop and ask the user whether to continue'
    default:
      return 'stop; the task is not complete'
  }
}

function deferredText(edge: WorkflowEdge, node: WorkflowNode, ctx: RenderContext): string {
  const target = ctx.workflow.nodes.find((n) => n.id === edge.to)
  const number = ctx.numbers.get(edge.to)
  const where = number !== undefined ? `step ${number}` : `"${target?.label ?? edge.to}"`
  const attempts = node.config.maxAttempts
  const limit = attempts === undefined ? '' : ` (at most ${attempts} times)`
  const condition = edge.condition ?? edge.label ?? 'this fails'

  return edge.kind === 'retry'
    ? `If ${condition}, go back to ${where} and try again${limit}.`
    : `If ${condition}, do ${where} instead.`
}

/** Step count, used by tests and by the instruction file's workflow index. */
export function workflowStepCount(workflow: Workflow): number {
  return flattenSteps(walkWorkflow(workflow).items).length
}
