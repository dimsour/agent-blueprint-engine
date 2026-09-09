import {
  applyChangeSet,
  createEmptyBlueprint,
  ENTITY_KINDS,
  findEntity,
  validateBlueprint,
} from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import {
  agentTemplates,
  artifactTemplates,
  gateTemplates,
  hookTemplates,
  ironLawTemplates,
  skillTemplates,
  templatesForKind,
  workflowTemplates,
} from '../src/index'

const blank = () => createEmptyBlueprint({ id: 'scratch', name: 'Scratch' })

describe('artifact templates', () => {
  it('are unique, kebab-case and of a known kind', () => {
    const ids = artifactTemplates.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of artifactTemplates) {
      expect(template.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(ENTITY_KINDS).toContain(template.kind)
      expect(template.label.length).toBeGreaterThan(2)
      expect(template.description.length).toBeGreaterThan(20)
    }
  })

  it('cover skills and agents', () => {
    expect(skillTemplates.length).toBeGreaterThanOrEqual(7)
    expect(agentTemplates.length).toBeGreaterThanOrEqual(7)
    expect(templatesForKind('skill')).toEqual(skillTemplates)
  })

  it.each(artifactTemplates.map((template) => [template.id, template] as const))(
    'applies %s to an empty blueprint with no rejected ops',
    (_id, template) => {
      const changeSet = template.build({ id: 'my-artifact', name: 'My Artifact' })
      expect(changeSet.source).toBe('template')
      expect(changeSet.ops).toHaveLength(1)

      const { blueprint, applied, rejected } = applyChangeSet(blank(), changeSet)
      expect(rejected).toEqual([])
      expect(applied).toHaveLength(1)

      const created = findEntity(blueprint, template.kind, 'my-artifact')
      expect(created).toBeDefined()
      expect(created?.name).toBe('My Artifact')
      expect(created?.description ?? '').not.toBe('')

      const errors = validateBlueprint(blueprint).filter(
        (diagnostic) => diagnostic.severity === 'error',
      )
      expect(errors).toEqual([])
    },
  )

  it('produces the same change-set every time', () => {
    for (const template of artifactTemplates) {
      const first = template.build({ id: 'a', name: 'A' })
      const second = template.build({ id: 'a', name: 'A' })
      expect(second).toEqual(first)
    }
  })

  it.each(workflowTemplates.map((template) => [template.id, template] as const))(
    'gives %s a graph that starts, verifies and ends',
    (_id, template) => {
      const { blueprint } = applyChangeSet(blank(), template.build({ id: 'flow', name: 'Flow' }))
      const workflow = blueprint.workflows[0]
      expect(workflow).toBeDefined()

      const entry = workflow?.nodes.find((node) => node.id === workflow.entryNodeId)
      expect(entry?.type).toBe('start')
      expect(workflow?.nodes.some((node) => node.type === 'end')).toBe(true)
      expect(workflow?.triggers.intents.length).toBeGreaterThan(0)

      // Nothing unreachable, no dead end, and something checks the work before the end.
      const codes = validateBlueprint(blueprint).map((diagnostic) => diagnostic.code)
      expect(codes).not.toContain('BP-WF-010')
      expect(codes).not.toContain('BP-WF-011')
      expect(codes).not.toContain('BP-WF-012')
      expect(codes).not.toContain('BP-WF-013')
    },
  )

  it.each(ironLawTemplates.map((template) => [template.id, template] as const))(
    'gives %s a rationale, an escape hatch and examples',
    (_id, template) => {
      const { blueprint } = applyChangeSet(blank(), template.build({ id: 'law', name: 'Law' }))
      const law = blueprint.ironLaws[0]
      expect(law?.rule.length).toBeGreaterThan(40)
      expect(law?.rationale?.length ?? 0).toBeGreaterThan(40)
      expect(law?.violationBehavior?.length ?? 0).toBeGreaterThan(20)
      expect(law?.examples.length).toBeGreaterThan(0)
      expect(law?.counterexamples.length).toBeGreaterThan(0)
    },
  )

  it('gives every runnable hook and gate an actual command', () => {
    for (const template of hookTemplates) {
      const { blueprint } = applyChangeSet(blank(), template.build({ id: 'h', name: 'H' }))
      const hook = blueprint.hooks[0]
      expect(hook?.action.command, template.id).toBeTruthy()
    }
    const { blueprint } = applyChangeSet(blank(), gateTemplates[0]!.build({ id: 'g', name: 'G' }))
    expect(blueprint.gates[0]?.criteria[0]?.command).toBeTruthy()
  })

  it.each(skillTemplates.map((template) => [template.id, template] as const))(
    'gives %s a body an agent can act on',
    (_id, template) => {
      const changeSet = template.build({ id: 'my-skill', name: 'My Skill' })
      const op = changeSet.ops[0]
      const body = op && 'after' in op ? ((op.after as { body?: string }).body ?? '') : ''
      expect(body.length).toBeGreaterThan(200)
      expect(body).toMatch(/^#{1,6}\s*Instructions\b/im)
      expect(body).toMatch(/^#{1,6}\s*Verification\b/im)
    },
  )
})
