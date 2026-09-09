/**
 * What the model is shown.
 *
 * Two properties matter and neither is about wording. The context must fit a modest budget for
 * a real project, or every operation fails on the endpoint the user actually configured; and
 * when it does not fit, the thing being edited must be the last casualty, not the first.
 */
import { validateBlueprint, type Blueprint } from '@agent-blueprint/core'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  buildContext,
  estimateTokens,
  renderEntity,
  renderSummary,
  renderWorkflows,
} from '../src/index'
import { loadFixture } from './helpers'

let blueprint: Blueprint

beforeAll(async () => {
  blueprint = await loadFixture()
})

describe('buildContext', () => {
  it('describes the whole fixture well inside the budget', () => {
    const context = buildContext({ blueprint })
    // The acceptance figure from the roadmap: a real project must leave room for an answer.
    expect(context.tokens).toBeLessThan(6_000)
    expect(context.omitted).toEqual([])
    expect(context.trimmed).toBe(false)

    // Everything the model needs to name an artifact is present.
    for (const agent of blueprint.agents) expect(context.text).toContain(agent.id)
    for (const skill of blueprint.skills) expect(context.text).toContain(skill.id)
  })

  it('puts the selected artifact first, in full, with what touches it', () => {
    const skill = blueprint.skills[0]!
    const context = buildContext({ blueprint, selection: { kind: 'skill', id: skill.id } })

    expect(context.text.indexOf('# Selected artifact')).toBeLessThan(
      context.text.indexOf('# Blueprint'),
    )
    expect(context.text).toContain('# What the selected artifact touches')
    // The agent that holds the skill is one hop away and should be there by name.
    const holder = blueprint.agents.find((agent) => agent.skillIds.includes(skill.id))
    expect(holder).toBeDefined()
    expect(context.text).toContain(`used by agent:${holder!.id}`)
  })

  it('keeps the selection and drops the bodies when the budget is small', () => {
    const skill = blueprint.skills[0]!
    const context = buildContext({
      blueprint,
      selection: { kind: 'skill', id: skill.id },
      budget: { maxInputTokens: 1_200, reserveForOutput: 400 },
    })

    expect(context.text).toContain('# Selected artifact')
    expect(context.omitted).toContain('bodies')
    expect(context.tokens).toBeLessThanOrEqual(800)
  })

  it('says so when something the answer depends on was cut', () => {
    const skill = blueprint.skills[0]!
    const roomy = buildContext({ blueprint, selection: { kind: 'skill', id: skill.id } })
    expect(roomy.trimmed).toBe(false)

    const cramped = buildContext({
      blueprint,
      selection: { kind: 'skill', id: skill.id },
      budget: { maxInputTokens: 500, reserveForOutput: 200 },
    })
    expect(cramped.trimmed).toBe(true)
  })

  it('never drops the preamble, whatever the budget', () => {
    const context = buildContext({
      blueprint,
      preamble: 'GLOSSARY MARKER',
      budget: { maxInputTokens: 100, reserveForOutput: 90 },
    })
    expect(context.text).toContain('GLOSSARY MARKER')
  })

  it('hands the model the findings rather than asking it to re-derive them', () => {
    const diagnostics = validateBlueprint(blueprint)
    const context = buildContext({ blueprint, diagnostics })
    if (diagnostics.length === 0) {
      expect(context.text).not.toContain('# Findings already computed')
      return
    }
    expect(context.text).toContain('# Findings already computed')
    expect(context.text).toContain(diagnostics[0]!.code)
  })
})

describe('rendering', () => {
  it('shows an artifact as the file it is stored as', () => {
    const skill = blueprint.skills[0]!
    const rendered = renderEntity('skill', skill)
    expect(rendered).toContain(`# Skill: ${skill.id}`)
    expect(rendered).toContain(`id: ${skill.id}`)
    // Frontmatter, then the body: the same two halves as the file on disk.
    expect(rendered.split('---')).toHaveLength(3)
    if (skill.body) expect(rendered).toContain(skill.body.split('\n')[0]!)
  })

  it('truncates a neighbour body, and says that it did', () => {
    const long = { ...blueprint.skills[0]!, body: 'x'.repeat(5_000) }
    const rendered = renderEntity('skill', long, { bodyChars: 100 })
    expect(rendered).toContain('[… truncated …]')
    expect(estimateTokens(rendered)).toBeLessThan(400)
  })

  it('summarises a workflow as its steps in the order they run', () => {
    const workflow = blueprint.workflows[0]!
    const rendered = renderWorkflows([workflow])
    const first = rendered.indexOf(workflow.entryNodeId!)
    for (const node of workflow.nodes) expect(rendered).toContain(node.id)
    // The entry step is named before any other step's line.
    const otherIds = workflow.nodes
      .filter((node) => node.id !== workflow.entryNodeId)
      .map((node) => rendered.indexOf(`- ${node.id} `))
      .filter((at) => at >= 0)
    expect(Math.min(...otherIds)).toBeGreaterThan(first)
  })

  it('summarises every kind the Blueprint has, by name only', () => {
    const summary = renderSummary(blueprint)
    expect(summary).toContain(`name: ${blueprint.name}`)
    expect(summary).toContain(`primary agent: ${blueprint.settings.primaryAgentId!}`)
    // A summary is a listing: no artifact body belongs in it.
    const body = blueprint.skills[0]!.body
    if (body && body.length > 200) expect(summary).not.toContain(body.slice(0, 200))
  })
})
