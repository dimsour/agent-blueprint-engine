import { blueprintSchema } from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import { enabledTargetIds } from '@/lib/targets'
import {
  blockingReason,
  DRAFT_PLACEHOLDER_NAME,
  emptyDraft,
  setIdentity,
  setTargets,
} from '@/lib/wizard/draft'

describe('the new-project draft', () => {
  it('starts as a valid Blueprint', () => {
    expect(blueprintSchema.safeParse(emptyDraft()).success).toBe(true)
  })

  it('starts on the two harnesses that have a complete adapter', () => {
    expect(enabledTargetIds(emptyDraft())).toEqual(['claude-code', 'codex'])
  })

  it('derives the id from the name', () => {
    const draft = setIdentity(emptyDraft(), { name: 'Rust Review Crew' })
    expect(draft.id).toBe('rust-review-crew')
  })

  it('keeps an id the author typed', () => {
    const draft = setIdentity(emptyDraft(), { name: 'Rust Review Crew', id: 'rrc' })
    expect(draft.id).toBe('rrc')
  })

  it('stops following the name once the id has been edited', () => {
    let draft = setIdentity(emptyDraft(), { name: 'Rust Review Crew' })
    draft = setIdentity(draft, { id: 'rrc' })
    draft = setIdentity(draft, { name: 'Rust Review Crew v2' })
    draft = setIdentity(draft, { description: 'Reviews Rust.' })

    expect(draft.id).toBe('rrc')
  })

  it('keeps following the name until then', () => {
    let draft = setIdentity(emptyDraft(), { name: 'Rust Review Crew' })
    expect(draft.id).toBe('rust-review-crew')
    draft = setIdentity(draft, { name: 'Rust Review Crew v2' })
    expect(draft.id).toBe('rust-review-crew-v2')
  })

  it('will not write an id that is not a slug', () => {
    const named = setIdentity(emptyDraft(), { name: 'Ok' })
    // Mid-typing, capitals, and cleared: the draft keeps its last good id in every case.
    expect(setIdentity(named, { id: '' }).id).toBe('ok')
    expect(setIdentity(named, { id: 'Rust Crew' }).id).toBe('ok')
    expect(setIdentity(named, { id: 'rust-' }).id).toBe('ok')
    expect(setIdentity(named, { id: 'rust-crew' }).id).toBe('rust-crew')
  })

  it('never lets the name or the id go empty mid-edit', () => {
    const draft = setIdentity(emptyDraft(), { name: '' })
    expect(draft.name).toBe(DRAFT_PLACEHOLDER_NAME)
    expect(blueprintSchema.safeParse(draft).success).toBe(true)
  })

  it('turns on a target that arrived disabled', () => {
    const imported = {
      ...emptyDraft(),
      targets: [{ harnessId: 'pi' as const, enabled: false, options: {} }],
    }
    expect(enabledTargetIds(setTargets(imported, ['pi']))).toEqual(['pi'])
  })

  it('records only the chosen harnesses, in the order the model lists them', () => {
    const draft = setTargets(emptyDraft(), ['pi', 'claude-code'])
    expect(draft.targets.map((target) => target.harnessId)).toEqual(['claude-code', 'pi'])
  })

  it('can turn every target off', () => {
    expect(setTargets(emptyDraft(), []).targets).toEqual([])
  })

  it('will not create anything without a name', () => {
    expect(blockingReason(emptyDraft())).toMatch(/name/i)
    expect(blockingReason(setIdentity(emptyDraft(), { name: 'Docs Bot' }))).toBeUndefined()
  })

  /**
   * The draft is the whole of what `/new` produces now, so what matters is that a project
   * made from one keystroke of it is something the workspace can open and go on editing —
   * not that it is finished. It is not: it has no agent yet, which the health bar says the
   * moment the workspace opens.
   */
  it('produces a Blueprint the schema accepts, with nothing in it yet', () => {
    const draft = setIdentity(emptyDraft(), {
      name: 'Rust Review Crew',
      description: 'Reviews Rust changes before they merge.',
    })

    expect(blueprintSchema.safeParse(draft).success).toBe(true)
    expect(draft.agents).toEqual([])
    expect(draft.skills).toEqual([])
  })
})
