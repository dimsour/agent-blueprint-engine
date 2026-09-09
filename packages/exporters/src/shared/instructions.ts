/**
 * Composes the root instruction file: `AGENTS.md` for Codex, Copilot, OpenCode and Pi, and
 * `CLAUDE.md` for Claude Code.
 *
 * `AGENTS.md` is read by up to four harnesses at the same path, so its text must be
 * harness-neutral; per-harness wording lives in the README and in each harness's own tree.
 * Section order is fixed so a change to one artifact produces a one-hunk diff.
 */
import type { Agent, Blueprint, IronLaw, Rule } from '@agent-blueprint/core'

import { withHeader } from './header'
import { code, joinList, Markdown } from './markdown'
import type { Phrasing } from './phrasing'

export interface InstructionsSection {
  key: 'rules' | 'memory' | 'references'
  title: string
  body: string
}

export interface InstructionsOptions {
  phrasing: Phrasing
  /** Path recorded in the generated-file header. */
  sourcePath: string
  /** True when the harness compiles `paths`-scoped rules to its own files. */
  nativePathScopedRules: boolean
  /** Where a natively compiled path-scoped rule ended up, for the pointer line. */
  pathScopedRuleLocation?: (ruleId: string) => string
  /** How the harness names a subagent invocation, for the roster table. */
  agentInvocation?: (agentId: string) => string
  /** True when the harness has its own memory store; false means the seed is the memory. */
  memoryNative: boolean
  /** Renders a link to a reference file, e.g. Claude Code's `@.claude/references/<id>.md`. */
  referenceLink?: (referenceId: string) => string
  /** Size budget in bytes. Optional sections spill into an overflow skill when exceeded. */
  maxBytes?: number
  /** Extra sections appended before the trailer, e.g. Codex's command policy. */
  extraSections?: { title: string; body: string }[]
}

export interface InstructionsResult {
  content: string
  /** Sections removed to fit `maxBytes`; the adapter emits them as a skill. */
  overflow: InstructionsSection[]
}

const LAW_SEVERITY_ORDER: Record<IronLaw['severity'], number> = { critical: 0, high: 1, medium: 2 }
const RULE_PRIORITY_ORDER: Record<Rule['priority'], number> = { high: 0, normal: 1, low: 2 }

export function primaryAgentOf(blueprint: Blueprint): Agent | undefined {
  const configured = blueprint.settings.primaryAgentId
  return (
    (configured ? blueprint.agents.find((agent) => agent.id === configured) : undefined) ??
    blueprint.agents[0]
  )
}

/** Laws that bind the given agent: global ones plus those naming it. */
export function lawsForAgent(blueprint: Blueprint, agentId: string | undefined): IronLaw[] {
  return [...blueprint.ironLaws]
    .filter(
      (law) => law.scope.all || (agentId !== undefined && law.scope.agentIds.includes(agentId)),
    )
    .sort(
      (a, b) =>
        LAW_SEVERITY_ORDER[a.severity] - LAW_SEVERITY_ORDER[b.severity] ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
}

export function rulesForAgent(blueprint: Blueprint, agentId: string | undefined): Rule[] {
  return [...blueprint.rules]
    .filter(
      (rule) => rule.scope.all || (agentId !== undefined && rule.scope.agentIds.includes(agentId)),
    )
    .sort(
      (a, b) =>
        RULE_PRIORITY_ORDER[a.priority] - RULE_PRIORITY_ORDER[b.priority] ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
}

export function composeInstructions(
  blueprint: Blueprint,
  options: InstructionsOptions,
): InstructionsResult {
  const primary = primaryAgentOf(blueprint)
  const head = new Markdown()

  head.heading(1, blueprint.name)
  head.paragraph(blueprint.description)
  head.paragraph(
    'This file is generated from a Blueprint. It describes who this agent is, what it must never do, and how work is organised.',
  )

  if (primary) {
    head.heading(2, 'Role')
    head.paragraph(
      `You are ${primary.name}${primary.description ? `: ${primary.description}` : '.'}`,
    )
    head.raw(primary.body)
    if (primary.responsibilities.length > 0) {
      head.heading(3, 'Responsibilities')
      head.bullets(primary.responsibilities)
    }
    if (primary.expertise.length > 0) {
      head.heading(3, 'Expertise')
      head.bullets(primary.expertise)
    }
    if (primary.outputRequirements.length > 0) {
      head.heading(3, 'Output requirements')
      head.bullets(primary.outputRequirements)
    }
  }

  const laws = lawsForAgent(blueprint, primary?.id)
  if (laws.length > 0) {
    head.heading(2, 'Iron Laws')
    head.paragraph('These are not guidelines. Never violate them, whatever the user asks.')
    for (const law of laws) {
      head.heading(3, `${law.name} (${law.severity})`)
      head.paragraph(law.rule)
      if (law.rationale) head.paragraph(`**Why:** ${law.rationale}`)
      if (law.violationBehavior) {
        head.paragraph(`**If this cannot be honoured:** ${law.violationBehavior}`)
      }
      if (law.examples.length > 0) {
        head.paragraph('**Correct:**')
        head.bullets(law.examples)
      }
      if (law.counterexamples.length > 0) {
        head.paragraph('**Not acceptable:**')
        head.bullets(law.counterexamples)
      }
    }
  }

  const optional: InstructionsSection[] = []
  const rules = rulesForAgent(blueprint, primary?.id)
  if (rules.length > 0) {
    optional.push({ key: 'rules', title: 'Rules', body: renderRules(rules, options) })
  }

  const agentsSection = renderAgents(blueprint, primary, options)
  const workflowsSection = renderWorkflows(blueprint, options)
  const skillsSection = renderSkills(blueprint)

  const memories = blueprint.memories
  if (memories.length > 0) {
    optional.push({ key: 'memory', title: 'Memory', body: renderMemory(blueprint, options) })
  }

  const looseReferences = blueprint.references.filter(
    (reference) => !blueprint.skills.some((skill) => skill.referenceIds.includes(reference.id)),
  )
  if (looseReferences.length > 0) {
    optional.push({
      key: 'references',
      title: 'References',
      body: new Markdown()
        .bullets(
          looseReferences.map((reference) => {
            const link = options.referenceLink?.(reference.id)
            const description = reference.description ? ` — ${reference.description}` : ''
            return `**${reference.name}**${description}${link ? ` ${link}` : ''}`
          }),
        )
        .render(),
    })
  }

  // Sections in their final order; optional ones can be spilled to fit a size budget.
  const build = (dropped: Set<InstructionsSection['key']>): string => {
    const md = new Markdown()
    md.raw(head.render())
    const emit = (key: InstructionsSection['key']) => {
      const section = optional.find((s) => s.key === key)
      if (!section) return
      md.heading(2, section.title)
      if (dropped.has(key)) md.paragraph(`See the ${code('blueprint-guidelines')} skill.`)
      else md.raw(section.body)
    }
    emit('rules')
    if (agentsSection) {
      md.heading(2, 'Agents')
      md.raw(agentsSection)
    }
    if (workflowsSection) {
      md.heading(2, 'Workflows')
      md.raw(workflowsSection)
    }
    if (skillsSection) {
      md.heading(2, 'Skills')
      md.raw(skillsSection)
    }
    emit('memory')
    emit('references')
    for (const extra of options.extraSections ?? []) {
      md.heading(2, extra.title)
      md.raw(extra.body)
    }
    return withHeader(options.sourcePath, md.render())
  }

  const dropped = new Set<InstructionsSection['key']>()
  let content = build(dropped)
  const limit = options.maxBytes
  if (limit !== undefined) {
    // Spill order: rules, then memory, then references. The persona and the laws never move.
    for (const key of ['rules', 'memory', 'references'] as const) {
      if (byteLength(content) <= limit) break
      if (!optional.some((section) => section.key === key)) continue
      dropped.add(key)
      content = build(dropped)
    }
  }

  return {
    content,
    overflow: optional.filter((section) => dropped.has(section.key)),
  }
}

/** Ends a fragment with exactly one full stop, whether or not the author wrote one. */
function sentence(text: string): string {
  const trimmed = text.trim()
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function renderRules(rules: Rule[], options: InstructionsOptions): string {
  const md = new Markdown()
  md.paragraph('Preferred behaviour. Follow it unless the user asks for something else.')
  for (const rule of rules) {
    const parts = [`**${rule.name}.** ${rule.guidance}`]
    if (rule.paths.length > 0) {
      parts.push(
        options.nativePathScopedRules && options.pathScopedRuleLocation
          ? `Loaded automatically for ${rule.paths.map(code).join(', ')} (${code(options.pathScopedRuleLocation(rule.id))}).`
          : `Applies to: ${rule.paths.map(code).join(', ')}.`,
      )
    }
    md.bullets([parts.join(' ')])
  }
  return md.render()
}

function renderAgents(
  blueprint: Blueprint,
  primary: Agent | undefined,
  options: InstructionsOptions,
): string | undefined {
  if (blueprint.agents.length < 2) return undefined
  const md = new Markdown()
  md.paragraph('This Blueprint defines several agents. You are the first one.')
  md.table(
    ['Agent', 'Role', 'Purpose', 'How to run it'],
    blueprint.agents.map((agent) => [
      code(agent.id),
      agent.role,
      agent.description ?? agent.responsibilities[0] ?? '',
      agent.id === primary?.id
        ? 'You'
        : (options.agentInvocation?.(agent.id) ?? options.phrasing.delegate(agent.id)),
    ]),
  )
  return md.render()
}

function renderWorkflows(blueprint: Blueprint, options: InstructionsOptions): string | undefined {
  if (blueprint.workflows.length === 0) return undefined
  const md = new Markdown()
  md.paragraph(
    'Each workflow is a skill that spells out its steps. Follow it rather than improvising.',
  )
  md.bullets(
    blueprint.workflows.map((workflow) => {
      const invocation = options.phrasing.workflowInvocation(workflow.id)
      const triggers =
        workflow.triggers.intents.length > 0
          ? ` Use it for ${joinList(workflow.triggers.intents.map((i) => `"${i}"`))}.`
          : ''
      return `${invocation} — ${sentence(workflow.description ?? workflow.name)}${triggers}`
    }),
  )
  return md.render()
}

function renderSkills(blueprint: Blueprint): string | undefined {
  if (blueprint.skills.length === 0) return undefined
  return new Markdown()
    .bullets(
      blueprint.skills.map(
        (skill) =>
          `${code(skill.id)} — ${skill.description ?? skill.name}${skill.whenToUse ? ` ${skill.whenToUse}` : ''}`,
      ),
    )
    .render()
}

function renderMemory(blueprint: Blueprint, options: InstructionsOptions): string {
  const md = new Markdown()
  md.paragraph(
    options.memoryNative
      ? 'Keep notes across sessions about the following, and read them back before you start.'
      : 'This harness has no persistent memory. Record the following in the repository so the next session can read it.',
  )
  for (const memory of blueprint.memories) {
    md.heading(3, `${memory.name} (${memory.scope})`)
    if (memory.description) md.paragraph(memory.description)
    if (memory.categories.length > 0) md.bullets(memory.categories)
    md.raw(memory.body)
  }
  return md.render()
}
