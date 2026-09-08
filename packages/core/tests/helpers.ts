import { readFixtureFiles } from '@agent-blueprint/fixtures'

import { type Blueprint, MemoryFs, readProject } from '../src/index'

export function fixtureFs(): MemoryFs {
  return new MemoryFs(readFixtureFiles('dotnet-testing-expert'))
}

export async function loadFixture(): Promise<Blueprint> {
  const result = await readProject(fixtureFs())
  const errors = result.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length > 0) {
    throw new Error(
      `Fixture has errors:\n${errors.map((d) => `${d.code} ${d.message}`).join('\n')}`,
    )
  }
  return result.blueprint
}
