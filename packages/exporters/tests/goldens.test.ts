/**
 * Golden-file tests: the compiled output of every fixture, byte for byte.
 *
 * These are the tests that make "same Blueprint in, same bytes out" real. A deliberate
 * change to an emitter shows up as a reviewable diff in `tests/__golden__/`; regenerate with
 *
 *   UPDATE_GOLDENS=1 pnpm --filter @agent-blueprint/exporters test
 *
 * and read the diff before committing it.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type HarnessId, HARNESS_IDS } from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import { compileBlueprint } from '../src/index'
import { loadFixture } from './helpers'

const GOLDEN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '__golden__')
const UPDATE = process.env.UPDATE_GOLDENS === '1'

interface GoldenCase {
  name: string
  targets?: HarnessId[]
}

const CASES: GoldenCase[] = [
  // The fixture's own targets: what a user of this Blueprint actually gets.
  { name: 'dotnet-testing-expert' },
  // Every target at once, which is also the strongest test that shared files stay shared.
  { name: 'dotnet-testing-expert.all', targets: [...HARNESS_IDS] },
  { name: 'dotnet-testing-expert.copilot', targets: ['copilot'] },
]

function readTree(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8')
    }
  }
  try {
    walk(root)
  } catch {
    return {}
  }
  return files
}

function writeTree(root: string, files: Record<string, string>): void {
  rmSync(root, { recursive: true, force: true })
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, 'utf8')
  }
}

describe('golden files', () => {
  for (const testCase of CASES) {
    it(`compiles ${testCase.name} to the recorded output`, async () => {
      const blueprint = await loadFixture()
      const result = compileBlueprint(
        blueprint,
        testCase.targets ? { targets: testCase.targets } : {},
      )
      expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])

      const produced = Object.fromEntries(result.files.map((file) => [file.path, file.content]))
      const root = join(GOLDEN_ROOT, testCase.name)

      if (UPDATE) {
        writeTree(root, produced)
        return
      }

      const expected = readTree(root)
      expect(
        Object.keys(expected).length,
        `no goldens for ${testCase.name}; run UPDATE_GOLDENS=1`,
      ).toBeGreaterThan(0)
      expect(Object.keys(produced).sort()).toEqual(Object.keys(expected).sort())
      for (const [path, content] of Object.entries(expected)) {
        expect(produced[path], path).toBe(content)
      }
    })
  }
})
