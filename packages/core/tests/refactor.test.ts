import { describe, expect, it } from 'vitest'

import {
  buildDependencyGraph,
  collectRefs,
  deleteEntity,
  findOrphans,
  impactOf,
  renameEntity,
  RenameError,
  validateBlueprint,
} from '../src/index'
import { loadFixture } from './helpers'

describe('references', () => {
  it('collects every reference in the fixture', async () => {
    const bp = await loadFixture()
    const refs = collectRefs(bp)
    const relations = new Set(refs.map((r) => r.relation))
    expect(relations).toEqual(
      new Set([
        'primary-agent',
        'uses-skill',
        'runs-workflow',
        'bound-by-law',
        'follows-rule',
        'uses-tool',
        'reads-reference',
        'has-memory',
        'activates-in-workflow',
        'allowed-tool',
        'node-agent',
        'node-skill',
        'node-gate',
        'tests-agent',
        'checks-workflow',
      ]),
    )
    expect(buildDependencyGraph(bp).dangling).toEqual([])
  })
})

describe('renameEntity', () => {
  it('rewrites every reference to the renamed entity', async () => {
    const bp = await loadFixture()
    const { blueprint, updatedRefs } = renameEntity(bp, 'skill', 'xunit', 'xunit-testing')
    expect(updatedRefs).toBe(2) // agent.skillIds + workflow node skillId
    expect(blueprint.skills.map((s) => s.id)).toContain('xunit-testing')
    expect(blueprint.skills.map((s) => s.id)).not.toContain('xunit')
    expect(blueprint.agents[0]?.skillIds).toEqual([
      'xunit-testing',
      'test-design',
      'fluent-assertions',
    ])
    expect(blueprint.workflows[0]?.nodes.find((n) => n.id === 'implement')?.config.skillId).toBe(
      'xunit-testing',
    )
    expect(buildDependencyGraph(blueprint).dangling).toEqual([])
    // the original is untouched
    expect(bp.agents[0]?.skillIds[0]).toBe('xunit')
  })

  it('renames the primary agent everywhere, including settings', async () => {
    const bp = await loadFixture()
    const { blueprint } = renameEntity(bp, 'agent', 'testing-expert', 'qa-expert')
    expect(blueprint.settings.primaryAgentId).toBe('qa-expert')
    expect(blueprint.scenarios[0]?.agentId).toBe('qa-expert')
    expect(validateBlueprint(blueprint).filter((d) => d.severity === 'error')).toEqual([])
  })

  it('refuses invalid, missing, unchanged and colliding ids', async () => {
    const bp = await loadFixture()
    expect(() => renameEntity(bp, 'skill', 'nope', 'x')).toThrow(RenameError)
    expect(() => renameEntity(bp, 'skill', 'xunit', 'Bad Id')).toThrow(RenameError)
    expect(() => renameEntity(bp, 'skill', 'xunit', 'xunit')).toThrow(RenameError)
    expect(() => renameEntity(bp, 'skill', 'xunit', 'test-design')).toThrow(RenameError)
  })
})

describe('dependency graph', () => {
  it('reports impact before deletion', async () => {
    const bp = await loadFixture()
    const graph = buildDependencyGraph(bp)
    const impact = impactOf(graph, { kind: 'skill', id: 'test-design' })
    expect(impact.direct).toEqual([
      { kind: 'agent', id: 'testing-expert' },
      { kind: 'workflow', id: 'write-tests' },
      { kind: 'workflow', id: 'review-tests' },
    ])
    expect(impact.transitive.map((r) => `${r.kind}:${r.id}`)).toEqual(
      expect.arrayContaining([
        'agent:testing-expert',
        'workflow:write-tests',
        'scenario:payment-service-tests',
      ]),
    )
    expect(impactOf(graph, { kind: 'agent', id: 'testing-expert' }).isPrimaryAgent).toBe(true)
  })

  it('finds orphans', async () => {
    const bp = await loadFixture()
    expect(findOrphans(buildDependencyGraph(bp))).toEqual([])
    const withOrphan = structuredClone(bp)
    withOrphan.references.push({ ...bp.references[0]!, id: 'unused-reference', name: 'Unused' })
    expect(findOrphans(buildDependencyGraph(withOrphan))).toEqual([
      { kind: 'reference', id: 'unused-reference' },
    ])
  })
})

describe('deleteEntity', () => {
  it('removes the entity and every reference to it', async () => {
    const bp = await loadFixture()
    const { blueprint, impact, removedRefs } = deleteEntity(bp, { kind: 'gate', id: 'tests-pass' })
    expect(impact.direct).toEqual([{ kind: 'workflow', id: 'write-tests' }])
    expect(removedRefs).toBe(1)
    expect(blueprint.gates).toEqual([])
    const gateNode = blueprint.workflows[0]?.nodes.find((n) => n.id === 'gate')
    expect(gateNode?.config.gateId).toBeUndefined()
    expect(buildDependencyGraph(blueprint).dangling).toEqual([])
    // gate node now warns that nothing is assigned, but the blueprint is still valid
    const diagnostics = validateBlueprint(blueprint)
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(diagnostics.some((d) => d.code === 'BP-WF-005')).toBe(true)
  })

  it('clears the primary agent setting when the primary agent is deleted', async () => {
    const bp = await loadFixture()
    const { blueprint } = deleteEntity(bp, { kind: 'agent', id: 'testing-expert' })
    expect(blueprint.settings.primaryAgentId).toBeUndefined()
    expect(blueprint.scenarios[0]?.agentId).toBeUndefined()
    expect(buildDependencyGraph(blueprint).dangling).toEqual([])
  })
})
