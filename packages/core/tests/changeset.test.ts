import { describe, expect, it } from 'vitest'

import { applyChangeSet, type ChangeSet, diffBlueprints, ruleSchema } from '../src/index'
import { loadFixture } from './helpers'

describe('diffBlueprints', () => {
  it('is empty for equal blueprints and ignores cosmetic differences', async () => {
    const bp = await loadFixture()
    const copy = structuredClone(bp)
    copy.agents[0]!.body = `${copy.agents[0]!.body}\n\n`
    expect(diffBlueprints(bp, copy).ops).toEqual([])
  })

  it('produces create, update, delete and header ops with stable ids', async () => {
    const bp = await loadFixture()
    const next = structuredClone(bp)
    next.name = 'Renamed'
    next.skills[0]!.description = 'Updated.'
    next.gates = []
    next.rules.push(ruleSchema.parse({ id: 'new-rule', name: 'New', guidance: 'Do it.' }))

    const cs = diffBlueprints(bp, next)
    // ops follow ENTITY_KINDS order (rules come before gates), then before/after order within a kind
    expect(cs.ops.map((op) => op.id)).toEqual([
      'update-blueprint',
      'update:skill:xunit',
      'create:rule:new-rule',
      'delete:gate:tests-pass',
    ])
    const header = cs.ops[0]
    expect(header?.type === 'update-blueprint' && header.after).toEqual({ name: 'Renamed' })
  })
})

describe('applyChangeSet', () => {
  it('applies accepted ops only and reports rejected ones', async () => {
    const bp = await loadFixture()
    const next = structuredClone(bp)
    next.description = 'New description'
    next.skills[0]!.description = 'Updated.'
    next.gates = []
    // keep `next` self-consistent: deleting the gate also detaches the workflow node
    delete next.workflows[0]!.nodes.find((n) => n.id === 'gate')!.config.gateId
    const cs = diffBlueprints(bp, next)

    const partial = applyChangeSet(bp, cs, { accept: ['update:skill:xunit'] })
    expect(partial.applied).toEqual(['update:skill:xunit'])
    expect(partial.blueprint.skills[0]?.description).toBe('Updated.')
    expect(partial.blueprint.gates).toHaveLength(1)
    expect(partial.blueprint.description).toBe(bp.description)

    const full = applyChangeSet(bp, cs)
    expect(full.rejected).toEqual([])
    expect(diffBlueprints(full.blueprint, next).ops).toEqual([])
  })

  it('rejects ops that no longer apply without dropping the rest', async () => {
    const bp = await loadFixture()
    const cs: ChangeSet = {
      id: 'test',
      source: 'user',
      summary: 'mixed',
      ops: [
        {
          id: 'delete:gate:missing',
          type: 'delete',
          kind: 'gate',
          entityId: 'missing',
          before: bp.gates[0]!,
        },
        {
          id: 'create:skill:xunit',
          type: 'create',
          kind: 'skill',
          entityId: 'xunit',
          after: bp.skills[0]!,
        },
        {
          id: 'create:rule:ok',
          type: 'create',
          kind: 'rule',
          entityId: 'ok',
          after: ruleSchema.parse({ id: 'ok', name: 'Ok', guidance: 'Fine.' }),
        },
      ],
    }
    const result = applyChangeSet(bp, cs)
    expect(result.applied).toEqual(['create:rule:ok'])
    expect(result.rejected.map((r) => r.opId)).toEqual([
      'delete:gate:missing',
      'create:skill:xunit',
    ])
    expect(result.blueprint.rules.map((r) => r.id)).toContain('ok')
  })

  it('deleting through a change-set cleans references', async () => {
    const bp = await loadFixture()
    const cs: ChangeSet = {
      id: 'del',
      source: 'user',
      summary: 'delete skill',
      ops: [
        {
          id: 'delete:skill:xunit',
          type: 'delete',
          kind: 'skill',
          entityId: 'xunit',
          before: bp.skills[0]!,
        },
      ],
    }
    const { blueprint } = applyChangeSet(bp, cs)
    expect(blueprint.agents[0]?.skillIds).toEqual(['test-design', 'fluent-assertions'])
  })
})
