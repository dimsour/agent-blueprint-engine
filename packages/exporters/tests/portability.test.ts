import { describe, expect, it } from 'vitest'

import { portabilityOf, portabilityProvider, usedConcepts } from '../src/index'
import { loadFixture } from './helpers'

describe('usedConcepts', () => {
  it('counts only what the Blueprint actually uses', async () => {
    const blueprint = await loadFixture()
    const used = usedConcepts(blueprint)
    expect(used).toContain('skills')
    expect(used).toContain('workflows')
    expect(used).toContain('hooks')
    expect(used).toContain('gates')
    expect(used).toContain('memory')
    expect(used).toContain('permissions')
    expect(used).toContain('pathScopedRules')
    // One agent and no parallel edges, so neither counts against portability.
    expect(used).not.toContain('agents')
    expect(used).not.toContain('parallelAgents')
  })
})

describe('portabilityOf', () => {
  it('scores the fixture highly on its own targets', async () => {
    const blueprint = await loadFixture()
    const result = portabilityOf(blueprint)
    expect(result.score).toBeGreaterThanOrEqual(85)
    expect(result.issues.filter((issue) => issue.code === 'BP-PORT-001')).toEqual([])
  })

  it('drops when a target cannot represent a feature the Blueprint uses', async () => {
    const blueprint = await loadFixture()
    const withPi = portabilityOf(blueprint, { targets: ['claude-code', 'codex', 'pi'] })
    expect(withPi.score).toBeLessThan(portabilityOf(blueprint).score)

    const unsupported = withPi.issues.filter((issue) => issue.code === 'BP-PORT-001')
    expect(unsupported.length).toBeGreaterThan(0)
    expect(unsupported.some((issue) => issue.message.includes('Memory'))).toBe(true)
    expect(unsupported.every((issue) => issue.severity === 'warning')).toBe(true)
  })

  it('explains adapted support as information rather than a warning', async () => {
    const blueprint = await loadFixture()
    const adapted = portabilityOf(blueprint).issues.filter((issue) => issue.code === 'BP-PORT-002')
    expect(adapted.length).toBeGreaterThan(0)
    expect(adapted.every((issue) => issue.severity === 'info')).toBe(true)
    expect(adapted.some((issue) => issue.message.includes('Workflows are adapted'))).toBe(true)
  })

  it('returns a full matrix for the compatibility view', async () => {
    const blueprint = await loadFixture()
    const { matrix } = portabilityOf(blueprint)
    expect(matrix).toHaveLength(12)
    const memory = matrix.find((row) => row.concept === 'memory')
    expect(memory?.used).toBe(true)
    expect(memory?.byTarget).toEqual({ 'claude-code': 'native', codex: 'native' })
  })

  it('scores 100 with an explanation when nothing is enabled', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.targets = []
    const result = portabilityOf(blueprint)
    expect(result.score).toBe(100)
    expect(result.issues[0]?.code).toBe('BP-TARGET-001')
  })

  it('exposes a provider shaped for the evaluator in core', async () => {
    const blueprint = await loadFixture()
    const provider = portabilityProvider()
    const { score, issues } = provider(blueprint)
    expect(score).toBe(portabilityOf(blueprint).score)
    expect(Array.isArray(issues)).toBe(true)
  })
})
