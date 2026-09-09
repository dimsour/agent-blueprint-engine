/**
 * The documentation is part of the product: a diagnostic the user cannot look up is a
 * diagnostic they cannot act on. These tests fail when code and documentation drift apart.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  ALL_RULES,
  DIAGNOSTIC_CODES,
  isKnownDiagnosticCode,
  ORPHAN_CODES,
  validateBlueprint,
} from '../src/index'
import { loadFixture } from './helpers'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const CATALOGUE = readFileSync(join(REPO_ROOT, 'docs/05-validation-evaluation.md'), 'utf8')

describe('diagnostic code catalogue', () => {
  it('documents every code the core can emit', () => {
    const undocumented = DIAGNOSTIC_CODES.filter((entry) => !CATALOGUE.includes(entry.code))
    expect(undocumented.map((entry) => entry.code)).toEqual([])
  })

  it('has no duplicate codes', () => {
    const codes = DIAGNOSTIC_CODES.map((entry) => entry.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('covers every registered rule and orphan code', () => {
    for (const rule of ALL_RULES) {
      expect(isKnownDiagnosticCode(rule.code), `rule ${rule.code}`).toBe(true)
    }
    for (const code of Object.values(ORPHAN_CODES)) {
      expect(isKnownDiagnosticCode(code), `orphan ${code}`).toBe(true)
    }
  })

  it('only emits codes that are in the catalogue', async () => {
    const blueprint = structuredClone(await loadFixture())
    // Break several things at once so a wide set of rules fires.
    blueprint.agents[0]?.skillIds.push('missing-skill')
    blueprint.agents[0]?.responsibilities.push('Negotiate vendor contracts')
    blueprint.workflows[0]!.nodes.push({
      id: 'lost',
      type: 'review',
      label: 'Lost',
      position: { x: 0, y: 0 },
      config: { contextInputs: [] },
    })
    blueprint.gates = []

    const emitted = validateBlueprint(blueprint).map((diagnostic) => diagnostic.code)
    expect(emitted.length).toBeGreaterThan(4)
    for (const code of emitted) expect(isKnownDiagnosticCode(code), code).toBe(true)
  })

  it('gives every code a summary a user can read', () => {
    for (const entry of DIAGNOSTIC_CODES) {
      expect(entry.summary.length, entry.code).toBeGreaterThan(15)
      expect(entry.summary.endsWith('.'), entry.code).toBe(true)
    }
  })
})
