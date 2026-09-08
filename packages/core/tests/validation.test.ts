import { describe, expect, it } from 'vitest'

import {
  ALL_RULES,
  createEmptyBlueprint,
  summarizeDiagnostics,
  upsertEntity,
  validateBlueprint,
} from '../src/index'
import { loadFixture } from './helpers'

describe('validateBlueprint', () => {
  it('finds nothing wrong with the fixture', async () => {
    const bp = await loadFixture()
    const diagnostics = validateBlueprint(bp)
    expect(diagnostics).toEqual([])
  })

  it('every rule has a unique, documented code', () => {
    const codes = ALL_RULES.map((r) => r.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const rule of ALL_RULES) {
      expect(rule.code).toMatch(/^BP-[A-Z]+-\d{3}$/)
      expect(rule.description.length).toBeGreaterThan(10)
    }
  })

  it('reports dangling references, missing descriptions and workflow problems', async () => {
    const bp = await loadFixture()
    let broken = structuredClone(bp)
    broken.agents[0]!.skillIds.push('ghost-skill')
    broken.settings.primaryAgentId = 'nobody'
    broken = upsertEntity(broken, 'workflow', {
      id: 'empty',
      name: 'Empty',
      description: 'No nodes',
    })
    broken = upsertEntity(broken, 'workflow', {
      id: 'broken',
      name: 'Broken',
      description: 'Bad edges',
      entryNodeId: 'missing',
      nodes: [
        { id: 'a', type: 'agent', label: 'A', position: { x: 0, y: 0 } },
        { id: 'a', type: 'agent', label: 'A again', position: { x: 0, y: 0 } },
      ],
      edges: [{ id: 'e', from: 'a', to: 'zzz' }],
    })
    broken = upsertEntity(broken, 'skill', { id: 'nameless', name: 'Nameless' })

    const diagnostics = validateBlueprint(broken)
    const codes = diagnostics.map((d) => d.code)
    expect(codes).toContain('BP-REF-001')
    expect(codes).toContain('BP-WF-001')
    expect(codes).toContain('BP-WF-002')
    expect(codes).toContain('BP-WF-003')
    expect(codes).toContain('BP-WF-004')
    expect(codes).toContain('BP-WF-005')
    expect(codes).toContain('BP-DESC-001')

    const dangling = diagnostics.filter((d) => d.code === 'BP-REF-001')
    // blueprint-level findings (no ref) sort before entity findings
    expect(dangling.map((d) => d.message)).toEqual([
      'Blueprint "dotnet-testing-expert" references unknown agent "nobody" (primary-agent).',
      'Agent "testing-expert" references unknown skill "ghost-skill" (uses-skill).',
    ])
    expect(dangling[0]?.ref).toBeUndefined()
    expect(dangling[1]?.ref).toEqual({ kind: 'agent', id: 'testing-expert' })

    const summary = summarizeDiagnostics(diagnostics)
    expect(summary.errors).toBeGreaterThanOrEqual(5)
    // sorted: errors first
    expect(diagnostics[0]?.severity).toBe('error')
  })

  it('warns about multiple agents without a primary and duplicate targets', () => {
    let bp = createEmptyBlueprint({ id: 'x', name: 'X' })
    bp = upsertEntity(bp, 'agent', {
      id: 'a',
      name: 'A',
      role: 'worker',
      description: 'a',
      responsibilities: ['x'],
    })
    bp = upsertEntity(bp, 'agent', {
      id: 'b',
      name: 'B',
      role: 'reviewer',
      description: 'b',
      responsibilities: ['y'],
    })
    bp = {
      ...bp,
      targets: [
        { harnessId: 'codex', enabled: true, options: {} },
        { harnessId: 'codex', enabled: false, options: {} },
      ],
    }
    const codes = validateBlueprint(bp).map((d) => d.code)
    expect(codes).toEqual(['BP-TARGET-002', 'BP-AGENT-002'])
  })

  it('emits an info when no target is enabled', () => {
    const codes = validateBlueprint(createEmptyBlueprint({ id: 'x', name: 'X' })).map((d) => d.code)
    expect(codes).toEqual(['BP-TARGET-001'])
  })
})
