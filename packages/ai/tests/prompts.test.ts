/**
 * The prompt catalogue.
 *
 * Prompts are the one part of this package with no compiler behind them, so the tests stand in
 * for one: every template says the same things about vocabulary, ids and credentials, because
 * an operation that forgets the glossary produces artifacts that are the wrong kind, and one
 * that forgets the credential rule produces output the validator will refuse.
 *
 * The snapshots exist to make a wording change visible in review. Changing one is fine —
 * updating it without bumping the template version is not, because the recorded fixtures for
 * the operations are recorded against a version.
 */
import { describe, expect, it } from 'vitest'

import {
  CONCEPT_GLOSSARY,
  PROMPTS,
  QUICK_ACTIONS,
  QUICK_ACTION_INSTRUCTIONS,
  improveArtifactV1,
  type PromptId,
} from '../src/index'

const ids = Object.keys(PROMPTS) as PromptId[]

describe('every prompt', () => {
  it('covers every operation, each named once', () => {
    expect(ids).toEqual([
      'add-capability',
      'generate-blueprint',
      'generate-artifact',
      'improve-artifact',
      'create-workflow',
      'create-iron-laws',
      'find-contradictions',
      'find-missing',
      'fix-finding',
      'evaluate',
      'compound',
      'judge-requirements',
    ])
    for (const id of ids) expect(PROMPTS[id].id).toBe(id)
    expect(new Set(ids.map((id) => PROMPTS[id].version)).size).toBeGreaterThan(0)
  })

  it('teaches the vocabulary and states the rules that cannot be negotiated', () => {
    for (const id of ids) {
      const system = PROMPTS[id].system
      expect(system, id).toContain('Iron Law: what must NEVER be violated')
      expect(system, id).toContain('kebab-case')
      expect(system, id).toContain('Never include an API key')
      expect(system, id).toContain('Output contract:')
    }
  })

  it('keeps the glossary and the vision document saying the same thing', () => {
    // Not a wording check: these are the distinctions a model collapses if they go unstated.
    for (const concept of [
      'Blueprint',
      'Agent',
      'Skill',
      'Workflow',
      'Iron Law',
      'Rule',
      'Hook',
      'Gate',
      'Tool',
      'Permission',
      'Reference',
      'Memory',
      'Requirement',
      'Scenario',
    ]) {
      expect(CONCEPT_GLOSSARY).toContain(`- ${concept}:`)
    }
  })
})

describe('improveArtifact', () => {
  it('has an instruction for every quick action', () => {
    for (const action of QUICK_ACTIONS) {
      expect(QUICK_ACTION_INSTRUCTIONS[action].length).toBeGreaterThan(20)
    }
  })

  it('composes the action onto the request, after the context', () => {
    const user = improveArtifactV1.user({
      context: 'CONTEXT BLOCK',
      kind: 'skill',
      id: 'xunit-testing',
      action: 'add-verification',
      instruction: 'keep it short',
    })
    expect(user.indexOf('CONTEXT BLOCK')).toBeLessThan(user.indexOf('Revise the skill'))
    expect(user).toContain(QUICK_ACTION_INSTRUCTIONS['add-verification'])
    expect(user).toContain('keep it short')
  })

  it('leaves the request bare when no quick action was chosen', () => {
    const user = improveArtifactV1.user({ context: 'C', kind: 'rule', id: 'small-commits' })
    expect(user).toContain('Revise the rule "small-commits".')
    expect(user).not.toContain('What the user asked for')
  })
})

describe('snapshots', () => {
  it('pins each system prompt', () => {
    for (const id of ids) expect(PROMPTS[id].system).toMatchSnapshot(id)
  })

  it('pins one rendered request per operation shape', () => {
    expect(
      PROMPTS['generate-blueprint'].user({
        context: '# Blueprint\nname: Example',
        brief: 'A team that reviews pull requests for a .NET codebase.',
      }),
    ).toMatchSnapshot()
    expect(
      PROMPTS.compound.user({
        context: '# Blueprint\nname: Example',
        notes: 'We shipped a migration without a rollback and had to hotfix at 2am.',
      }),
    ).toMatchSnapshot()
  })
})
