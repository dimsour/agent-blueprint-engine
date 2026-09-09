import {
  countEntities,
  evaluateBlueprint,
  MemoryFs,
  readProject,
  renderProjectFiles,
  validateBlueprint,
} from '@agent-blueprint/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { starterBlueprints } from '../src/index'

/** Load every starter once; each test then asserts against the loaded result. */
const loaded = new Map<
  string,
  {
    files: Record<string, string>
    blueprint: Awaited<ReturnType<typeof readProject>>['blueprint']
    diagnostics: unknown[]
  }
>()

beforeAll(async () => {
  for (const starter of starterBlueprints) {
    const files = starter.files
    const result = await readProject(new MemoryFs(files))
    loaded.set(starter.id, {
      files,
      blueprint: result.blueprint,
      diagnostics: result.diagnostics,
    })
  }
})

describe('starter blueprints', () => {
  it('has a distinct id, label and description for each', () => {
    expect(starterBlueprints.length).toBeGreaterThanOrEqual(5)
    const ids = starterBlueprints.map((starter) => starter.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const starter of starterBlueprints) {
      expect(starter.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(starter.description.length).toBeGreaterThan(30)
    }
  })

  it.each(starterBlueprints.map((starter) => [starter.id] as const))(
    '%s loads with no read diagnostics',
    (id) => {
      expect(loaded.get(id)?.diagnostics).toEqual([])
    },
  )

  it.each(starterBlueprints.map((starter) => [starter.id] as const))(
    '%s validates with no errors',
    (id) => {
      const blueprint = loaded.get(id)?.blueprint
      expect(blueprint).toBeDefined()
      const errors = validateBlueprint(blueprint!).filter(
        (diagnostic) => diagnostic.severity === 'error',
      )
      expect(errors.map((error) => `${error.code} ${error.message}`)).toEqual([])
    },
  )

  it.each(starterBlueprints.map((starter) => [starter.id] as const))(
    '%s is stored in canonical form',
    (id) => {
      const entry = loaded.get(id)
      expect(renderProjectFiles(entry!.blueprint)).toEqual(entry!.files)
    },
  )

  it.each(starterBlueprints.map((starter) => [starter.id] as const))(
    '%s is substantial and scores well',
    (id) => {
      const blueprint = loaded.get(id)!.blueprint
      expect(countEntities(blueprint)).toBeGreaterThanOrEqual(10)
      expect(blueprint.agents.length).toBeGreaterThanOrEqual(1)
      expect(blueprint.skills.length).toBeGreaterThanOrEqual(3)
      expect(blueprint.workflows.length).toBeGreaterThanOrEqual(1)
      expect(blueprint.ironLaws.length).toBeGreaterThanOrEqual(2)
      expect(blueprint.targets.filter((target) => target.enabled).length).toBeGreaterThan(0)

      const report = evaluateBlueprint(blueprint)
      expect(report.overall, `${id} scored ${report.overall}`).toBeGreaterThanOrEqual(85)
    },
  )

  it.each(starterBlueprints.map((starter) => [starter.id] as const))(
    '%s wires every workflow step it declares',
    (id) => {
      const blueprint = loaded.get(id)!.blueprint
      const unassigned = validateBlueprint(blueprint).filter(
        (diagnostic) => diagnostic.code === 'BP-WF-005',
      )
      expect(unassigned.map((diagnostic) => diagnostic.message)).toEqual([])
    },
  )
})
