import { blueprintSchema, validateBlueprint } from '@agent-blueprint/core'
import { templatesForKind } from '@agent-blueprint/templates/artifacts'
import { describe, expect, it } from 'vitest'

import {
  addBlank,
  addFromTemplate,
  blockingReason,
  DRAFT_PLACEHOLDER_NAME,
  emptyDraft,
  enabledTargetIds,
  primaryAgent,
  removeArtifact,
  setAgent,
  setIdentity,
  setTargets,
  WIZARD_STEPS,
} from '@/lib/wizard/draft'

const firstSkillTemplate = () => templatesForKind('skill')[0]?.id ?? ''

describe('the wizard draft', () => {
  it('starts as a valid Blueprint', () => {
    expect(blueprintSchema.safeParse(emptyDraft()).success).toBe(true)
  })

  it('asks the ten questions in docs/07', () => {
    expect(WIZARD_STEPS).toHaveLength(10)
    expect(WIZARD_STEPS[0]?.prompt).toBe('What are you building?')
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

  it('never lets the name or the id go empty mid-edit', () => {
    const draft = setIdentity(emptyDraft(), { name: '' })
    expect(draft.name).toBe(DRAFT_PLACEHOLDER_NAME)
    expect(blueprintSchema.safeParse(draft).success).toBe(true)
  })

  it('creates the agent on first edit and makes it primary', () => {
    const draft = setAgent(setIdentity(emptyDraft(), { name: 'Docs Bot' }), {
      name: 'Docs Writer',
      role: 'worker',
    })

    expect(draft.agents).toHaveLength(1)
    expect(primaryAgent(draft)?.name).toBe('Docs Writer')
    expect(draft.settings.primaryAgentId).toBe(draft.agents[0]?.id)
  })

  it('edits the same agent rather than adding another', () => {
    let draft = setAgent(emptyDraft(), { name: 'Reviewer' })
    draft = setAgent(draft, { role: 'reviewer', expertise: ['rust'] })

    expect(draft.agents).toHaveLength(1)
    expect(primaryAgent(draft)?.role).toBe('reviewer')
    expect(primaryAgent(draft)?.name).toBe('Reviewer')
  })

  it('adds a skill from a template and links it to the agent', () => {
    const base = setAgent(emptyDraft(), { name: 'Reviewer' })
    const added = addFromTemplate(base, firstSkillTemplate())

    expect(added).toBeDefined()
    expect(added?.draft.skills).toHaveLength(1)
    expect(primaryAgent(added!.draft)?.skillIds).toEqual([added?.ref.id])
  })

  it('gives a second copy of a template its own id', () => {
    const base = setAgent(emptyDraft(), { name: 'Reviewer' })
    const once = addFromTemplate(base, firstSkillTemplate())!
    const twice = addFromTemplate(once.draft, firstSkillTemplate())!

    expect(twice.ref.id).not.toBe(once.ref.id)
    expect(twice.draft.skills).toHaveLength(2)
    expect(primaryAgent(twice.draft)?.skillIds).toHaveLength(2)
  })

  it('ignores a template id that does not exist', () => {
    expect(addFromTemplate(emptyDraft(), 'no-such-template')).toBeUndefined()
  })

  it('adds a blank artifact and links the kinds an agent can reach', () => {
    const base = setAgent(emptyDraft(), { name: 'Reviewer' })
    const { draft, ref } = addBlank(base, 'tool', 'Ripgrep')

    expect(ref).toEqual({ kind: 'tool', id: 'ripgrep' })
    expect(primaryAgent(draft)?.toolIds).toEqual(['ripgrep'])
  })

  it('adds an artifact even when no agent exists to link it to', () => {
    const { draft } = addBlank(emptyDraft(), 'skill', 'Anything')
    expect(draft.skills).toHaveLength(1)
  })

  it('removes the artifact and the reference to it together', () => {
    const base = setAgent(emptyDraft(), { name: 'Reviewer' })
    const { draft, ref } = addBlank(base, 'skill', 'Testing')
    const after = removeArtifact(draft, ref)

    expect(after.skills).toHaveLength(0)
    expect(primaryAgent(after)?.skillIds).toEqual([])
  })

  it('records only the chosen harnesses, in the order the model lists them', () => {
    const draft = setTargets(emptyDraft(), ['pi', 'claude-code'])
    expect(draft.targets.map((target) => target.harnessId)).toEqual(['claude-code', 'pi'])
  })

  it('can turn every target off', () => {
    expect(setTargets(emptyDraft(), []).targets).toEqual([])
  })

  it('will not leave step one without a name, or step two without an agent', () => {
    const blank = emptyDraft()
    expect(blockingReason(blank, 'about')).toMatch(/name/i)
    expect(blockingReason(blank, 'agent')).toMatch(/agent/i)

    const named = setAgent(setIdentity(blank, { name: 'Docs Bot' }), { name: 'Writer' })
    expect(blockingReason(named, 'about')).toBeUndefined()
    expect(blockingReason(named, 'agent')).toBeUndefined()
  })

  it('produces a Blueprint the validator accepts, end to end', () => {
    let draft = setIdentity(emptyDraft(), {
      name: 'Rust Review Crew',
      description: 'Reviews Rust changes before they merge.',
    })
    draft = setAgent(draft, { name: 'Rust Reviewer', role: 'reviewer', expertise: ['rust'] })
    draft = addFromTemplate(draft, firstSkillTemplate())!.draft
    draft = addFromTemplate(draft, templatesForKind('workflow')[0]!.id)!.draft
    draft = addFromTemplate(draft, templatesForKind('iron-law')[0]!.id)!.draft
    draft = setTargets(draft, ['claude-code'])

    expect(blueprintSchema.safeParse(draft).success).toBe(true)
    expect(validateBlueprint(draft).filter((d) => d.severity === 'error')).toEqual([])
    expect(draft.agents).toHaveLength(1)
    expect(draft.skills.length).toBeGreaterThan(0)
    expect(draft.workflows.length).toBeGreaterThan(0)
    expect(draft.ironLaws.length).toBeGreaterThan(0)
  })
})
