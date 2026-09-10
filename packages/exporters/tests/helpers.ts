import { type Blueprint, MemoryFs, type ProjectFile, readProject } from '@agent-blueprint/core'
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

/**
 * The text of a generated file. Most of them are text; a skill asset that is not text is the
 * bytes themselves, and a test that asks for its text is asking the wrong question.
 */
export function textOf(file: { path: string; content: ProjectFile } | undefined): string {
  if (file === undefined) throw new Error('no such file')
  if (typeof file.content !== 'string') throw new Error(`${file.path} is binary`)
  return file.content
}
