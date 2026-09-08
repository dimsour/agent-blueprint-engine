import { describe, expect, it } from 'vitest'

import {
  agentSchema,
  BLUEPRINT_SCHEMA_VERSION,
  blueprintSchema,
  createEmptyBlueprint,
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  ENTITY_SCHEMAS,
  skillSchema,
  workflowSchema,
} from '../src/index'

describe('schemas', () => {
  it('creates an empty blueprint with defaults', () => {
    const bp = createEmptyBlueprint({ id: 'demo', name: 'Demo' })
    expect(bp.schemaVersion).toBe(BLUEPRINT_SCHEMA_VERSION)
    expect(bp.version).toBe('0.1.0')
    expect(bp.settings.sourceDir).toBe('blueprint')
    for (const kind of ENTITY_KINDS) expect(bp[ENTITY_KIND_INFO[kind].collection]).toEqual([])
  })

  it('applies nested defaults through prefault', () => {
    const agent = agentSchema.parse({ id: 'a', name: 'A', role: 'worker' })
    expect(agent.permissions).toEqual({ operations: {}, patterns: [] })
    expect(agent.skillIds).toEqual([])
    const skill = skillSchema.parse({ id: 's', name: 'S' })
    expect(skill.activation.filePatterns).toEqual([])
    const workflow = workflowSchema.parse({ id: 'w', name: 'W' })
    expect(workflow.triggers).toEqual({ intents: [], agentIds: [] })
  })

  it('rejects invalid ids, roles and versions', () => {
    expect(agentSchema.safeParse({ id: 'Bad Id', name: 'A', role: 'worker' }).success).toBe(false)
    expect(agentSchema.safeParse({ id: 'a', name: 'A', role: 'wizard' }).success).toBe(false)
    expect(
      blueprintSchema.safeParse({ schemaVersion: '1.0', id: 'x', name: 'X', version: 'v1' })
        .success,
    ).toBe(false)
    expect(blueprintSchema.safeParse({ schemaVersion: '2.0', id: 'x', name: 'X' }).success).toBe(
      false,
    )
  })

  it('has a schema for every entity kind', () => {
    for (const kind of ENTITY_KINDS) expect(ENTITY_SCHEMAS[kind]).toBeDefined()
  })

  it('rejects skill resources that escape the skill directory', () => {
    const result = skillSchema.safeParse({
      id: 's',
      name: 'S',
      resources: [{ path: '../secrets.md', kind: 'reference', content: '' }],
    })
    expect(result.success).toBe(false)
  })
})
