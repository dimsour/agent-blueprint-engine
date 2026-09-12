/**
 * Findings, by the field they are about (P9-20).
 */
import type { Diagnostic } from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import { fieldFindingsFor, hintsFor } from '@/lib/field-findings'

const ON_THE_SKILL: Diagnostic = {
  code: 'BP-DESC-001',
  severity: 'warning',
  message: 'Skill "xUnit" has no description.',
  ref: { kind: 'skill', id: 'xunit' },
}

/** The finding from the report: filed against the requirement, pointing at the hook. */
const ON_THE_REQUIREMENT: Diagnostic = {
  code: 'BP-REQ-001',
  severity: 'error',
  message: 'Requirement "Security enforcement" is not satisfied.',
  ref: { kind: 'requirement', id: 'security-enforcement' },
  related: [{ kind: 'hook', id: 'secret-scan-before-stop' }],
  data: {
    failed: ['hook-exists'],
    nearMisses: [
      {
        kind: 'hook',
        id: 'secret-scan-before-stop',
        because: 'its action is command, not secret-scan',
        field: 'action.type',
      },
    ],
  },
}

describe('fieldFindingsFor', () => {
  it('marks the fields a finding on the artifact is about', () => {
    const hints = fieldFindingsFor([ON_THE_SKILL], { kind: 'skill', id: 'xunit' })
    expect(hints.get('description')).toEqual([
      { code: 'BP-DESC-001', severity: 'warning', text: 'Skill "xUnit" has no description.' },
    ])
    expect(hints.get('body')).toBeUndefined()
  })

  it('marks the field a finding elsewhere points at, and says where from', () => {
    // On the hook's form, not the requirement's: that is the whole point.
    const hints = fieldFindingsFor([ON_THE_REQUIREMENT], {
      kind: 'hook',
      id: 'secret-scan-before-stop',
    })
    expect(hints.get('action.type')).toEqual([
      {
        code: 'BP-REQ-001',
        severity: 'error',
        text: 'its action is command, not secret-scan',
        from: { kind: 'requirement', id: 'security-enforcement' },
      },
    ])
    // And on the requirement's own form it lands on the checks, with no "from".
    const own = fieldFindingsFor([ON_THE_REQUIREMENT], {
      kind: 'requirement',
      id: 'security-enforcement',
    })
    expect(own.get('checks')?.[0]).toMatchObject({ code: 'BP-REQ-001' })
    expect(own.get('checks')?.[0]?.from).toBeUndefined()
  })

  it('ignores a near miss that names no field, and findings about other artifacts', () => {
    const vague: Diagnostic = {
      ...ON_THE_REQUIREMENT,
      data: { nearMisses: [{ kind: 'hook', id: 'secret-scan-before-stop', because: 'nearly' }] },
    }
    expect(fieldFindingsFor([vague], { kind: 'hook', id: 'secret-scan-before-stop' }).size).toBe(0)
    expect(fieldFindingsFor([ON_THE_SKILL], { kind: 'skill', id: 'other' }).size).toBe(0)
  })

  it('spreads as nothing when a field has no hints, so a form can pass it blindly', () => {
    const hints = fieldFindingsFor([ON_THE_SKILL], { kind: 'skill', id: 'xunit' })
    expect(hintsFor(hints, 'body')).toEqual({})
    expect(hintsFor(hints, 'description').hints).toHaveLength(1)
  })
})
