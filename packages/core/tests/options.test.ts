/**
 * Every option a form can offer has a meaning beside it (P9-21).
 *
 * The enums are the schema's; the descriptions are the catalogue's; the type system holds them
 * together at compile time. This holds the parts a type cannot: that no entry is an empty
 * string, that the label is not just the value with a capital letter, and that docs/02 lists
 * every value — so a new option cannot ship as a bare word in a dropdown.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { OPTION_TABLES, describeOption, renderOptionsDoc, withOptionsDoc } from '../src/index'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const DOMAIN = readFileSync(join(REPO_ROOT, 'docs/02-domain-model.md'), 'utf8')

describe('option descriptions', () => {
  it('cover every value of every enum, with a real sentence', () => {
    for (const [name, [values, info]] of Object.entries(OPTION_TABLES)) {
      for (const value of values) {
        const entry = describeOption(info, value)
        expect(entry, `${name}.${value}`).toBeDefined()
        expect(entry!.label.length, `${name}.${value} label`).toBeGreaterThan(1)
        expect(entry!.description.length, `${name}.${value} description`).toBeGreaterThan(15)
        expect(entry!.description.endsWith('.'), `${name}.${value} ends the sentence`).toBe(true)
      }
      // And nothing described that the enum does not offer.
      for (const key of Object.keys(info)) {
        expect((values as readonly string[]).includes(key), `${name} has no value ${key}`).toBe(
          true,
        )
      }
    }
  })

  it('are listed in docs/02, every value of every enum', () => {
    const missing: string[] = []
    for (const [name, [values]] of Object.entries(OPTION_TABLES)) {
      for (const value of values) {
        if (!DOMAIN.includes(`\`${value}\``)) missing.push(`${name}.${value}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('match the reference in docs/02 exactly, so the doc cannot go stale', () => {
    // If this fails, run `pnpm --filter @agent-blueprint/core options:doc`.
    expect(DOMAIN).toContain(renderOptionsDoc())
    expect(withOptionsDoc(DOMAIN)).toBe(DOMAIN)
  })

  it('say nothing for a value that is not one', () => {
    const [, info] = OPTION_TABLES.AGENT_ROLES
    expect(describeOption(info, 'wizard')).toBeUndefined()
    expect(describeOption(info, 'toString')).toBeUndefined()
  })
})
