import {
  applyChangeSet,
  createEmptyBlueprint,
  ENTITY_KINDS,
  findEntity,
  validateBlueprint,
} from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import { agentTemplates, artifactTemplates, skillTemplates, templatesForKind } from '../src/index'

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
