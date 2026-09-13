/**
 * Putting the whole Blueprint right (P9-40).
 *
 * What the tests hold to is the split the operation is built on: the model decides, the code
 * checks. A deletion is honoured only when the graph agrees nothing refers to the artifact; an
 * agent returned half empty gets its half back; a decision the model wrote reaches the notes
 * in its own words; and a Blueprint with nothing above a suggestion never costs a request.
 */
import { applyChangeSet, type Blueprint, findEntity } from '@agent-blueprint/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { fixBlueprint } from '../src/index'
import { loadFixture, replayClient } from './helpers'

let fixture: Blueprint

beforeAll(async () => {
  fixture = await loadFixture()
})

/** The fixture with one Iron Law no agent holds any more. */
function withOrphanLaw(): Blueprint {
  return {
    ...fixture,
    agents: fixture.agents.map((agent) => ({
      ...agent,
      ironLawIds: agent.ironLawIds.filter((id) => id !== 'deterministic-tests'),
    })),
  }
}

const userMessage = (sent: { messages: { role: string; content: string }[] }[]) =>
  sent.at(-1)!.messages.find((message) => message.role === 'user')!.content

describe('fixBlueprint', () => {
  it('costs no request when nothing above a suggestion is raised', async () => {
    const { client, sent } = replayClient([])
    const result = await fixBlueprint({ client }, { blueprint: fixture })
    expect(sent).toHaveLength(0)
    expect(result.changeSet.ops).toHaveLength(0)
    expect(result.changeSet.summary).toBe(
      'Nothing above a suggestion is raised against this Blueprint.',
    )
    expect(result.notes.join('\n')).toContain('left for the artifact they are about')
  })

  it('tells the model how the orphan is connected, and who holds its kind', async () => {
    const { client, sent } = replayClient([
      JSON.stringify({ decisions: [], artifacts: [], deletions: [] }),
    ])
    await fixBlueprint({ client }, { blueprint: withOrphanLaw() })
    const asked = userMessage(sent)
    expect(asked).toContain('BP-ORPHAN-003')
    expect(asked).toContain('the iron law "deterministic-tests":')
    expect(asked).toContain('used by nothing')
    expect(asked).toContain(
      'the agent "testing-expert" holds the iron laws: never-fake-verification, no-implementation-details',
    )
    // The law itself, as its file, so the decision is made on what it says.
    expect(asked).toContain('Keep Tests Deterministic')
  })

  it('deletes an orphan the model decides nothing needs, and carries the reason', async () => {
    const blueprint = withOrphanLaw()
    const reason =
      'Nothing in this Blueprint runs tests against time or the network; the law forbids what nothing does.'
    const { client } = replayClient([
      JSON.stringify({
        decisions: [
          {
            code: 'BP-ORPHAN-003',
            ref: { kind: 'iron-law', id: 'deterministic-tests' },
            action: 'delete',
            reason,
          },
        ],
        artifacts: [],
        deletions: [{ kind: 'iron-law', id: 'deterministic-tests', reason }],
        note: 'One law fewer, and every remaining law bound to the agent.',
      }),
    ])
    const result = await fixBlueprint({ client }, { blueprint })

    expect(result.changeSet.ops).toHaveLength(1)
    const [op] = result.changeSet.ops
    expect(op).toMatchObject({ type: 'delete', kind: 'iron-law', entityId: 'deterministic-tests' })
    expect(op!.note).toBe(reason)
    expect(result.changeSet.summary).toBe(
      'One law fewer, and every remaining law bound to the agent.',
    )

    // The decision, in the model's words, ahead of everything else in the notes.
    expect(result.notes[0]).toBe(
      `BP-ORPHAN-003 on the iron law "deterministic-tests" — delete: ${reason}`,
    )
    // And the validator's word that it worked.
    expect(result.notes.join('\n')).toContain(
      'Checked: applying this clears BP-ORPHAN-003 on "deterministic-tests".',
    )
    const applied = applyChangeSet(blueprint, result.changeSet).blueprint
    expect(findEntity(applied, 'iron-law', 'deterministic-tests')).toBeUndefined()
  })

  it('wires an orphan into the agent instead, and gives back what the agent lost on the way', async () => {
    const blueprint = withOrphanLaw()
    const agent = blueprint.agents[0]!
    const { client } = replayClient([
      JSON.stringify({
        decisions: [
          {
            code: 'BP-ORPHAN-003',
            ref: { kind: 'iron-law', id: 'deterministic-tests' },
            action: 'change',
            reason: 'The agent writes tests, so the law binds it; it was never listed.',
          },
        ],
        artifacts: [
          {
            kind: 'agent',
            artifact: {
              ...agent,
              ironLawIds: [...agent.ironLawIds, 'deterministic-tests'],
              // The classic half-empty answer: the wiring done, the skills dropped.
              skillIds: [],
            },
          },
        ],
        deletions: [],
      }),
    ])
    const result = await fixBlueprint({ client }, { blueprint })

    expect(result.changeSet.ops).toHaveLength(1)
    expect(result.changeSet.ops[0]).toMatchObject({ type: 'update', kind: 'agent' })
    const applied = applyChangeSet(blueprint, result.changeSet).blueprint
    const after = findEntity(applied, 'agent', agent.id)!
    expect(after.ironLawIds).toContain('deterministic-tests')
    expect(after.skillIds).toEqual(agent.skillIds)
    expect(result.notes.join('\n')).toContain(`Put back skillIds on "${agent.id}"`)
    expect(result.notes.join('\n')).toContain('Checked: applying this clears BP-ORPHAN-003')
  })

  it('refuses to delete what something still refers to, and says who', async () => {
    const blueprint = withOrphanLaw()
    const answer = JSON.stringify({
      decisions: [
        {
          code: 'BP-ORPHAN-003',
          ref: { kind: 'iron-law', id: 'deterministic-tests' },
          action: 'keep',
          reason: 'Worth keeping; the author should decide which agent it binds.',
        },
      ],
      artifacts: [],
      deletions: [
        { kind: 'skill', id: 'xunit', reason: 'Seems unused.' },
        { kind: 'agent', id: 'testing-expert', reason: 'Start over.' },
        { kind: 'gadget', id: 'x', reason: 'No such thing.' },
        { kind: 'iron-law', id: 'no-such-law', reason: 'Gone already.' },
      ],
    })
    // The same answer twice: the orphan is still standing after the first, and the model did
    // answer, so the operation asks once more before giving up on it.
    const { client, sent } = replayClient([answer, answer])
    const result = await fixBlueprint({ client }, { blueprint })

    expect(sent).toHaveLength(2)
    expect(result.changeSet.ops).toHaveLength(0)
    const notes = result.notes.join('\n')
    expect(notes).toContain(
      'Kept the skill "xunit": 2 artifacts still refer to it — the agent "testing-expert", the workflow "write-tests".',
    )
    expect(notes).toContain(
      'Kept the agent "testing-expert": an agent is not something this fix deletes. Remove it from the inspector if you mean to.',
    )
    expect(notes).toContain('"gadget" is not a kind of artifact')
    expect(notes).toContain(
      'Ignored a deletion of the iron law "no-such-law": there is no such artifact.',
    )
    // Nothing survived the checks, so the verdict is the one for an empty answer.
    expect(notes).toContain('The model proposed no change.')
  })

  it('leaves alone what no artifact edit can clear, and says why', async () => {
    const { client, sent } = replayClient([])
    const result = await fixBlueprint(
      { client },
      {
        blueprint: fixture,
        diagnostics: [
          {
            code: 'BP-TARGET-001',
            severity: 'warning',
            message: 'No compile target is enabled.',
          },
        ],
      },
    )
    expect(sent).toHaveLength(0)
    expect(result.changeSet.summary).toBe('Nothing here can be cleared by writing artifacts.')
    expect(result.notes[0]).toBe(
      'BP-TARGET-001 was left alone: Enable a target in the Compatibility view.',
    )
  })
})
