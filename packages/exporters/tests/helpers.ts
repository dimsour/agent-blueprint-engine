import { type Blueprint, MemoryFs, readProject } from '@agent-blueprint/core'
import { readFixtureFiles } from '@agent-blueprint/fixtures'

export function fixtureFs(): MemoryFs {
  return new MemoryFs(readFixtureFiles('dotnet-testing-expert'))
}

export async function loadFixture(): Promise<Blueprint> {
  const { blueprint, diagnostics } = await readProject(fixtureFs())
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) throw new Error(`fixture has errors: ${errors[0]?.message ?? ''}`)
  return blueprint
}
