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

import {
  decodeUtf8,
  type HarnessId,
  type JsonValue,
  HARNESS_IDS,
  type ProjectFile,
  sameFile,
} from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import { compileBlueprint } from '../src/index'
import { loadFixture } from './helpers'

const GOLDEN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '__golden__')
const UPDATE = process.env.UPDATE_GOLDENS === '1'

interface GoldenCase {
  name: string
  targets?: HarnessId[]
  /** Target options to set before compiling, for layouts the fixture does not ask for. */
  options?: Partial<Record<HarnessId, Record<string, JsonValue>>>
}

const CASES: GoldenCase[] = [
  // The fixture's own targets: what a user of this Blueprint actually gets.
  { name: 'dotnet-testing-expert' },
  // Every target at once, which is also the strongest test that shared files stay shared.
  { name: 'dotnet-testing-expert.all', targets: [...HARNESS_IDS] },
  { name: 'dotnet-testing-expert.copilot', targets: ['copilot'] },
  { name: 'dotnet-testing-expert.opencode', targets: ['opencode'] },
  { name: 'dotnet-testing-expert.pi', targets: ['pi'] },
  // The same Blueprint as an installable plugin (P9-27).
  {
    name: 'dotnet-testing-expert.plugin',
    targets: ['claude-code'],
    options: { 'claude-code': { layout: 'plugin' } },
  },
  {
    name: 'dotnet-testing-expert.codex-plugin',
    targets: ['codex'],
    options: { codex: { layout: 'plugin' } },
  },
  {
    name: 'dotnet-testing-expert.copilot-plugin',
    targets: ['copilot'],
    options: { copilot: { layout: 'plugin' } },
  },
]

function readTree(root: string): Record<string, ProjectFile> {
  const files: Record<string, ProjectFile> = {}
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else {
        // Read as bytes and decode only if it is text, so a binary asset compares byte for byte.
        const bytes = new Uint8Array(readFileSync(full))
        const text = decodeUtf8(bytes)
        files[relative(root, full).split(sep).join('/')] = text ?? bytes
      }
    }
  }
  try {
    walk(root)
  } catch {
    return {}
  }
  return files
}

function writeTree(root: string, files: Record<string, ProjectFile>): void {
  rmSync(root, { recursive: true, force: true })
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    if (typeof content === 'string') writeFileSync(full, content, 'utf8')
    else writeFileSync(full, content)
  }
}

describe('golden files', () => {
  for (const testCase of CASES) {
    it(`compiles ${testCase.name} to the recorded output`, async () => {
      const blueprint = structuredClone(await loadFixture())
      for (const [harnessId, options] of Object.entries(testCase.options ?? {})) {
        const target = blueprint.targets.find((config) => config.harnessId === harnessId)
        if (target) target.options = { ...target.options, ...options }
        else blueprint.targets.push({ harnessId: harnessId as HarnessId, enabled: true, options })
      }
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
        // Strings compare as strings so a diff is readable; bytes compare byte for byte.
        if (typeof content === 'string') expect(produced[path], path).toBe(content)
        else expect(sameFile(produced[path], content), path).toBe(true)
      }
    })
  }
})
