/**
 * Starter blueprints: complete projects a user can open, run and edit on the first day.
 *
 * Each one is a real source project under `src/blueprints/<id>/blueprint/`, in the canonical
 * form the core writer produces, so a starter is loaded by exactly the same code path as a
 * user's own project. They were first written by `scripts/seed-starters.ts`; the files are
 * the source of truth from then on.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { StarterBlueprint } from '../types'

const HERE = dirname(fileURLToPath(import.meta.url))

interface StarterEntry {
  id: string
  label: string
  description: string
}

const index = JSON.parse(readFileSync(join(HERE, 'index.json'), 'utf8')) as StarterEntry[]

/** All files of a starter, keyed by repository-relative POSIX path. */
export function readStarterFiles(id: string): Record<string, string> {
  const root = join(HERE, id)
  const files: Record<string, string> = {}
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8')
    }
  }
  walk(root)
  return files
}

export const starterBlueprints: StarterBlueprint[] = index.map((entry) => ({
  ...entry,
  get files() {
    return readStarterFiles(entry.id)
  },
}))

export const starterIds: string[] = index.map((entry) => entry.id)

export function starterById(id: string): StarterBlueprint | undefined {
  return starterBlueprints.find((starter) => starter.id === id)
}
