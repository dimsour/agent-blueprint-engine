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
  ENTITY_KINDS,
  entitySchemaFor,
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

  /**
   * A finding says what is wrong. Only the remedy says what to do, and a code without one
   * leaves the reader exactly where they were — which is the complaint this was written for.
   */
  it('tells the user how to fix every code', () => {
    for (const entry of DIAGNOSTIC_CODES) {
      expect(entry.remedy.length, entry.code).toBeGreaterThan(40)
      expect(entry.remedy.endsWith('.'), entry.code).toBe(true)
      // The remedy has a job the summary does not: it must say what to do, not restate the
      // problem in other words.
      expect(entry.remedy, entry.code).not.toBe(entry.summary)
    }
  })
})

/**
 * Documentation that describes finished work as planned.
 *
 * This is the drift that costs the most, because it is invisible: nothing breaks, and the next
 * person to read the specification builds something that already exists or avoids an API they
 * were told was a stub. The roadmap's own status table is the source of truth for what is
 * done, so this stays correct on its own as phases land.
 */
describe('phase claims', () => {
  const ROADMAP = readFileSync(join(REPO_ROOT, 'docs/09-roadmap.md'), 'utf8')

  /** Phases the roadmap's status table marks `done`. */
  const donePhases = new Set(
    [...ROADMAP.matchAll(/^\|\s*(P\d)[^|]*\|\s*done\s*\|/gm)].map((match) => match[1]),
  )

  const DOCS = [
    '00-vision.md',
    '01-architecture.md',
    '02-domain-model.md',
    '03-project-format.md',
    '04-compiler.md',
    '05-validation-evaluation.md',
    '06-ai-layer.md',
    '07-web-app.md',
    '08-security.md',
    '10-decisions.md',
    'harness/claude-code.md',
    'harness/codex.md',
    'harness/copilot.md',
    'harness/opencode.md',
    'harness/pi.md',
  ]

  it('the roadmap marks at least the early phases done, or this test proves nothing', () => {
    expect(donePhases.size).toBeGreaterThanOrEqual(7)
  })

  it('does not call a finished phase planned', () => {
    const stale: string[] = []
    for (const name of DOCS) {
      const text = readFileSync(join(REPO_ROOT, 'docs', name), 'utf8')
      text.split('\n').forEach((line, index) => {
        // "planned" and a phase number close together: "planned, roadmap P2", "planned P6".
        for (const match of line.matchAll(/planned[^.\n]{0,30}?\b(P\d)\b/gi)) {
          if (donePhases.has(match[1] ?? '')) stale.push(`${name}:${index + 1} ${line.trim()}`)
        }
      })
    }
    expect(stale).toEqual([])
  })

  it('does not describe built work as not yet built', () => {
    const stale: string[] = []
    for (const name of DOCS) {
      const text = readFileSync(join(REPO_ROOT, 'docs', name), 'utf8')
      text.split('\n').forEach((line, index) => {
        if (/not yet implemented|MVP scope/i.test(line)) {
          stale.push(`${name}:${index + 1} ${line.trim()}`)
        }
      })
    }
    expect(stale).toEqual([])
  })
})

/**
 * Every finding points at something (P9-21).
 *
 * A code names the fields it is about so the form can mark them and the fix can change them.
 * A field that no schema has is a pointer to nothing — the hint never appears and the fix is
 * allowed to change nothing — and nothing would notice. The codes about the Blueprint as a
 * whole are the ones that legitimately name no field, and they are listed so a new code cannot
 * join them by omission.
 */
describe('where a finding points', () => {
  const WHOLE_BLUEPRINT = new Set([
    'BP-PROJECT-002',
    'BP-PROJECT-003',
    'BP-PROJECT-004',
    'BP-PROJECT-005',
    'BP-PROJECT-006',
    'BP-AGENT-002',
    'BP-AGENT-010',
    'BP-TARGET-001',
    'BP-TARGET-002',
    'BP-TARGET-003',
    'BP-CONTRA-001',
    'BP-COMPILE-001',
    'BP-PORT-001',
    'BP-PORT-002',
    'BP-EVAL-LAW-003',
    'BP-EVAL-PORT-001',
    'BP-EVAL-VERIFY-001',
    'BP-EVAL-VERIFY-002',
    'BP-EVAL-VERIFY-003',
    'BP-SAFETY-003',
    'BP-SAFETY-004',
  ])

  it('names the fields it is about, or is about the whole Blueprint', () => {
    const silent = DIAGNOSTIC_CODES.filter(
      (entry) => !entry.fields?.length && !WHOLE_BLUEPRINT.has(entry.code),
    )
    expect(silent.map((entry) => entry.code)).toEqual([])
  })

  it('names fields that exist on some artifact', () => {
    const known = new Set<string>()
    for (const kind of ENTITY_KINDS) {
      const shape = (entitySchemaFor(kind) as unknown as { shape: Record<string, unknown> }).shape
      for (const key of Object.keys(shape)) known.add(key)
    }
    const unknown: string[] = []
    for (const entry of DIAGNOSTIC_CODES) {
      for (const field of entry.fields ?? []) {
        const head = field.split('.')[0]!
        if (!known.has(head)) unknown.push(`${entry.code}.${field}`)
      }
    }
    expect(unknown).toEqual([])
  })
})
