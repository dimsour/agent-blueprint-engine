import { describe, expect, it } from 'vitest'

import {
  ALL_RULES,
  createEmptyBlueprint,
  findContradictions,
  ironLawSchema,
  ruleSchema,
  skillSchema,
  upsertEntity,
  validateBlueprint,
  workflowSchema,
} from '../src/index'
import { loadFixture } from './helpers'

const node = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  label: id,
  position: { x: 0, y: 0 },
  ...extra,
})
const edge = (id: string, from: string, to: string, extra: Record<string, unknown> = {}) => ({
  id,
  from,
  to,
  ...extra,
})

/** A blueprint with one workflow, for the workflow rules. */
function withWorkflow(nodes: unknown[], edges: unknown[]) {
  const blueprint = createEmptyBlueprint({ id: 'wf-test', name: 'WF' })
  return upsertEntity(
    blueprint,
    'workflow',
    workflowSchema.parse({
      id: 'flow',
      name: 'Flow',
      description: 'A workflow',
      entryNodeId: 'start',
      nodes,
      edges,
    }),
  )
}

const codesOf = (blueprint: Parameters<typeof validateBlueprint>[0]) =>
  validateBlueprint(blueprint).map((diagnostic) => diagnostic.code)

describe('workflow semantic rules', () => {
  it('finds nothing wrong with the fixture', async () => {
    expect(validateBlueprint(await loadFixture())).toEqual([])
  })

  it('reports unreachable nodes', () => {
    const blueprint = withWorkflow(
      [node('start', 'start'), node('end', 'end'), node('lost', 'review')],
      [edge('e1', 'start', 'end')],
    )
    const found = validateBlueprint(blueprint).filter((d) => d.code === 'BP-WF-010')
    expect(found).toHaveLength(1)
    expect(found[0]?.data).toEqual({ nodeId: 'lost' })
    expect(found[0]?.severity).toBe('warning')
  })

  it('reports a workflow that never verifies anything', () => {
    const withoutCheck = withWorkflow(
      [node('start', 'start'), node('work', 'agent'), node('end', 'end')],
      [edge('e1', 'start', 'work'), edge('e2', 'work', 'end')],
    )
    expect(codesOf(withoutCheck)).toContain('BP-WF-011')

    const withCheck = withWorkflow(
      [node('start', 'start'), node('check', 'verification'), node('end', 'end')],
      [edge('e1', 'start', 'check'), edge('e2', 'check', 'end')],
    )
    expect(codesOf(withCheck)).not.toContain('BP-WF-011')
  })

  it('reports parallel and merge nodes with too few branches', () => {
    const blueprint = withWorkflow(
      [
        node('start', 'start'),
        node('split', 'parallel'),
        node('one', 'review'),
        node('join', 'merge'),
        node('end', 'end'),
      ],
      [
        edge('e1', 'start', 'split'),
        edge('e2', 'split', 'one', { kind: 'parallel' }),
        edge('e3', 'one', 'join', { kind: 'aggregation' }),
        edge('e4', 'join', 'end'),
      ],
    )
    const found = validateBlueprint(blueprint).filter((d) => d.code === 'BP-WF-012')
    expect(found.map((d) => d.data?.nodeId).sort()).toEqual(['join', 'split'])
  })

  it('reports dead ends but not end nodes', () => {
    const blueprint = withWorkflow(
      [node('start', 'start'), node('stuck', 'review'), node('end', 'end')],
      [edge('e1', 'start', 'stuck'), edge('e2', 'start', 'end')],
    )
    const found = validateBlueprint(blueprint).filter((d) => d.code === 'BP-WF-013')
    expect(found).toHaveLength(1)
    expect(found[0]?.data).toEqual({ nodeId: 'stuck' })
  })

  it('reports a loop with no retry edge and accepts one with a retry edge', () => {
    const unbounded = withWorkflow(
      [node('start', 'start'), node('a', 'agent'), node('b', 'agent'), node('end', 'end')],
      [
        edge('e1', 'start', 'a'),
        edge('e2', 'a', 'b'),
        edge('e3', 'b', 'a'),
        edge('e4', 'b', 'end'),
      ],
    )
    expect(codesOf(unbounded)).toContain('BP-WF-014')

    const bounded = withWorkflow(
      [node('start', 'start'), node('a', 'agent'), node('b', 'agent'), node('end', 'end')],
      [
        edge('e1', 'start', 'a'),
        edge('e2', 'a', 'b'),
        edge('e3', 'b', 'a', { kind: 'retry' }),
        edge('e4', 'b', 'end'),
      ],
    )
    expect(codesOf(bounded)).not.toContain('BP-WF-014')
  })
})

describe('agent and skill semantic rules', () => {
  it('reports an agent nothing can invoke', async () => {
    const blueprint = structuredClone(await loadFixture())
    const extra = upsertEntity(blueprint, 'agent', {
      id: 'stray',
      name: 'Stray',
      description: 'Never invoked',
      role: 'reviewer',
      responsibilities: ['Review things'],
      skillIds: ['test-design'],
    })
    const found = validateBlueprint(extra).filter((d) => d.code === 'BP-AGENT-010')
    expect(found).toHaveLength(1)
    expect(found[0]?.ref).toEqual({ kind: 'agent', id: 'stray' })
  })

  it('reports a responsibility no skill covers, and accepts one that is covered', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.agents[0]?.responsibilities.push('Negotiate vendor contracts')
    const found = validateBlueprint(blueprint).filter((d) => d.code === 'BP-AGENT-011')
    expect(found).toHaveLength(1)
    expect(found[0]?.data).toEqual({ responsibility: 'Negotiate vendor contracts' })
  })

  it('reports a skill nothing activates', () => {
    let blueprint = createEmptyBlueprint({ id: 'x', name: 'X' })
    blueprint = upsertEntity(blueprint, 'skill', {
      id: 'floating',
      name: 'Floating',
      description: 'No activation and no owner',
      body: '## Instructions\n\nDo something.\n\n## Verification\n\nCheck it.',
    })
    const codes = codesOf(blueprint)
    expect(codes).toContain('BP-SKILL-010')
    expect(codes).toContain('BP-ORPHAN-001')
  })

  it('reports a skill with no verification section', () => {
    let blueprint = createEmptyBlueprint({ id: 'x', name: 'X' })
    blueprint = upsertEntity(blueprint, 'skill', {
      id: 'no-verify',
      name: 'No verify',
      description: 'Missing verification',
      activation: { intents: ['do something'] },
      body: '## Instructions\n\nDo something.',
    })
    const found = validateBlueprint(blueprint).filter((d) => d.code === 'BP-SKILL-011')
    expect(found).toHaveLength(1)
    expect(found[0]?.severity).toBe('info')
  })

  it('reports a hook with no command and a gate with no criteria', async () => {
    let blueprint = structuredClone(await loadFixture())
    blueprint = upsertEntity(blueprint, 'hook', {
      id: 'empty-hook',
      name: 'Empty hook',
      description: 'Runs nothing',
      trigger: 'before-stop',
      action: { type: 'run-tests' },
    })
    blueprint = upsertEntity(blueprint, 'gate', {
      id: 'tests-pass',
      name: 'Tests must pass',
      description: 'No criteria any more',
      criteria: [],
    })
    const codes = codesOf(blueprint)
    expect(codes).toContain('BP-HOOK-010')
    expect(codes).toContain('BP-GATE-010')
  })

  it('reports a law that asks for gate enforcement with no matching gate', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.ironLaws[0]!.enforcement = ['instruction', 'gate']
    const found = validateBlueprint(blueprint).filter((d) => d.code === 'BP-LAW-011')
    expect(found).toHaveLength(1)
    expect(found[0]?.ref).toEqual({ kind: 'iron-law', id: 'never-fake-verification' })
  })
})

describe('orphan rules', () => {
  it('reports one code per kind and leaves the fixture clean', async () => {
    const blueprint = structuredClone(await loadFixture())
    expect(validateBlueprint(blueprint).filter((d) => d.code.startsWith('BP-ORPHAN-'))).toEqual([])

    blueprint.references.push({ ...blueprint.references[0]!, id: 'unused-ref', name: 'Unused' })
    const found = validateBlueprint(blueprint).filter((d) => d.code.startsWith('BP-ORPHAN-'))
    expect(found).toHaveLength(1)
    expect(found[0]?.code).toBe('BP-ORPHAN-007')
    expect(found[0]?.ref).toEqual({ kind: 'reference', id: 'unused-ref' })
  })
})

describe('contradiction detection', () => {
  const law = (id: string, name: string, rule: string, category = 'architecture') =>
    ironLawSchema.parse({ id, name, description: name, rule, category })

  it('finds two laws that oblige opposite things about the same subject', () => {
    let blueprint = createEmptyBlueprint({ id: 'x', name: 'X' })
    blueprint = upsertEntity(
      blueprint,
      'iron-law',
      law('use-library', 'Use Library X', 'Always use Library X for serialization.'),
    )
    blueprint = upsertEntity(
      blueprint,
      'iron-law',
      law('avoid-library', 'Avoid Library X', 'Never use Library X for serialization.'),
    )

    const found = findContradictions(blueprint)
    expect(found).toHaveLength(1)
    expect(found[0]?.code).toBe('BP-LAW-010')
    expect(found[0]?.ref).toEqual({ kind: 'iron-law', id: 'avoid-library' })
    expect(found[0]?.related).toEqual([{ kind: 'iron-law', id: 'use-library' }])
    expect(found[0]?.data?.sentences).toHaveLength(2)
  })

  it('uses BP-CONTRA-001 when the artifacts are of different kinds', () => {
    let blueprint = createEmptyBlueprint({ id: 'x', name: 'X' })
    blueprint = upsertEntity(
      blueprint,
      'iron-law',
      law('no-mocks', 'No mocking frameworks', 'Never use a mocking framework for domain logic.'),
    )
    blueprint = upsertEntity(
      blueprint,
      'rule',
      ruleSchema.parse({
        id: 'prefer-mocks',
        name: 'Prefer mocks',
        guidance: 'Always use a mocking framework for domain logic.',
      }),
    )
    expect(findContradictions(blueprint).map((d) => d.code)).toEqual(['BP-CONTRA-001'])
  })

  it('ignores opposite statements whose scopes cannot both apply', () => {
    let blueprint = createEmptyBlueprint({ id: 'x', name: 'X' })
    blueprint = upsertEntity(
      blueprint,
      'iron-law',
      ironLawSchema.parse({
        id: 'a',
        name: 'A',
        rule: 'Always use Library X for serialization.',
        category: 'architecture',
        scope: { all: false, agentIds: ['writer'] },
      }),
    )
    blueprint = upsertEntity(
      blueprint,
      'iron-law',
      ironLawSchema.parse({
        id: 'b',
        name: 'B',
        rule: 'Never use Library X for serialization.',
        category: 'architecture',
        scope: { all: false, agentIds: ['reviewer'] },
      }),
    )
    expect(findContradictions(blueprint)).toEqual([])
  })

  it('ignores pairs that only share generic words', () => {
    let blueprint = createEmptyBlueprint({ id: 'x', name: 'X' })
    blueprint = upsertEntity(
      blueprint,
      'iron-law',
      law('a', 'A', 'Always write a test for every public behaviour.'),
    )
    blueprint = upsertEntity(
      blueprint,
      'iron-law',
      law('b', 'B', 'Never write a test that touches the network.'),
    )
    expect(findContradictions(blueprint)).toEqual([])
  })

  it('does not flag a law against its own counterexample', async () => {
    expect(findContradictions(await loadFixture())).toEqual([])
  })

  it('stays fast on a large blueprint', () => {
    let blueprint = createEmptyBlueprint({ id: 'big', name: 'Big' })
    for (let i = 0; i < 50; i += 1) {
      blueprint = upsertEntity(
        blueprint,
        'skill',
        skillSchema.parse({
          id: `skill-${i}`,
          name: `Skill ${i}`,
          description: `Skill number ${i}`,
          body: `## Instructions\n\nAlways prefer approach ${i} when handling subject ${i}.\n\n## Verification\n\nCheck ${i}.`,
        }),
      )
    }
    const started = performance.now()
    findContradictions(blueprint)
    expect(performance.now() - started).toBeLessThan(250)
  })
})

describe('rule registry', () => {
  it('gives every rule a unique documented code', () => {
    const codes = ALL_RULES.map((rule) => rule.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const rule of ALL_RULES) expect(rule.code).toMatch(/^BP-[A-Z]+-\d{3}$/)
  })
})
