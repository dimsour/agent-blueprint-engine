/**
 * @agent-blueprint/fixtures — sample Blueprint projects used by tests in every package.
 *
 * Each fixture under `projects/<name>/` is a complete source project (a `blueprint/`
 * directory) in canonical form: reading it and writing it back must be byte-identical.
 * Regenerate canonical form with `pnpm --filter @agent-blueprint/core fixtures:canonicalize`
 * after editing a fixture by hand.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURE_NAMES = ['dotnet-testing-expert'] as const
export type FixtureName = (typeof FIXTURE_NAMES)[number]

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Absolute path of the fixture's repository root (the directory containing `blueprint/`). */
export function fixtureRoot(name: FixtureName): string {
  return join(PACKAGE_ROOT, 'projects', name)
}

/** All files of the fixture as `{ 'blueprint/agents/x.md': '...' }` with POSIX paths, sorted. */
export function readFixtureFiles(name: FixtureName): Record<string, string> {
  const root = fixtureRoot(name)
  const files: Record<string, string> = {}
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8')
    }
  }
  walk(root)
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)))
}
