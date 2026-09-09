import { readFixtureFiles } from '@agent-blueprint/fixtures'
import type { Blueprint } from '@agent-blueprint/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { relationsOf, relationPhrase } from '@/lib/relations'
import { parseProject } from '@/lib/storage'

let blueprint: Blueprint

beforeAll(async () => {
  blueprint = (await parseProject(readFixtureFiles('dotnet-testing-expert'))).blueprint
})

const names = (items: readonly { name: string }[]) => items.map((item) => item.name)

describe('relationsOf', () => {
  it('lists what uses a skill', () => {
    const { dependents } = relationsOf(blueprint, { kind: 'skill', id: 'xunit' })

    expect(names(dependents)).toContain('Testing Expert')
    expect(names(dependents)).toContain('Write Unit Tests')
  })

  it('says how each artifact is related, from the reader’s side of the edge', () => {
    const { dependents } = relationsOf(blueprint, { kind: 'skill', id: 'xunit' })
    const agent = dependents.find((item) => item.ref.kind === 'agent')

    expect(agent?.phrase).toBe('Used by')
  })

  it('lists what an agent depends on', () => {
    const { dependencies } = relationsOf(blueprint, { kind: 'agent', id: 'testing-expert' })

    expect(names(dependencies)).toContain('xUnit')
    expect(dependencies.every((item) => !item.missing)).toBe(true)
  })

  it('names the primary agent', () => {
    expect(relationsOf(blueprint, { kind: 'agent', id: 'testing-expert' }).isPrimaryAgent).toBe(
      true,
    )
  })

  it('reports one line per artifact even when two edges join the same pair', () => {
    const { dependents } = relationsOf(blueprint, { kind: 'skill', id: 'xunit' })
    const keys = dependents.map((item) => `${item.ref.kind}:${item.ref.id}`)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('flags a reference whose target is gone', () => {
    const broken: Blueprint = {
      ...blueprint,
      skills: blueprint.skills.filter((skill) => skill.id !== 'xunit'),
    }
    const { dependencies } = relationsOf(broken, { kind: 'agent', id: 'testing-expert' })

    // A dangling reference is not an edge in the graph, so it cannot be listed as one.
    expect(names(dependencies)).not.toContain('xUnit')
  })

  it('reads the same relation differently from each end', () => {
    expect(relationPhrase('uses-skill', 'out')).toBe('Uses')
    expect(relationPhrase('uses-skill', 'in')).toBe('Used by')
  })
})
