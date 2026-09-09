/**
 * The review.
 *
 * The point of this screen is that a proposal can be read, not just trusted, so the tests are
 * about what it shows and what it lets through: the changed field rather than two copies of a
 * page, an op you rejected staying out of what gets applied, and an edit here surviving into
 * what is actually applied.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import {
  type Blueprint,
  type ChangeOp,
  type ChangeSet,
  applyChangeSet,
  findEntity,
} from '@agent-blueprint/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ChangeSetReview } from '@/components/ai/changeset-review'
import { parseProject } from '@/lib/storage'
import { diffRecords, show } from '@/lib/ai/review'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let blueprint: Blueprint

beforeAll(async () => {
  ;({ blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert')))
})

/** Three ops of three kinds, which is the shape a real answer takes. */
function proposal(): ChangeSet {
  const skill = findEntity(blueprint, 'skill', 'xunit')!
  const agent = findEntity(blueprint, 'agent', 'testing-expert')!
  return {
    id: 'ai:test',
    source: 'ai',
    summary: 'Three things.',
    ops: [
      {
        id: 'create:rule:small-commits',
        type: 'create',
        kind: 'rule',
        entityId: 'small-commits',
        after: {
          id: 'small-commits',
          name: 'Keep commits small',
          guidance: 'One behaviour per commit.',
          category: 'process',
          priority: 'normal',
          paths: [],
          tags: [],
          metadata: {},
          scope: { all: true, agentIds: [], workflowIds: [] },
          body: '',
        },
        note: 'From the notes about review time.',
      },
      {
        id: 'update:skill:xunit',
        type: 'update',
        kind: 'skill',
        entityId: 'xunit',
        before: skill,
        after: { ...skill, whenToUse: 'When writing xUnit tests for changed .NET code.' },
      },
      {
        id: 'update:agent:testing-expert',
        type: 'update',
        kind: 'agent',
        entityId: 'testing-expert',
        before: agent,
        after: { ...agent, ruleIds: [...agent.ruleIds, 'small-commits'] },
      },
    ] satisfies ChangeOp[],
  }
}

describe('ChangeSetReview', () => {
  it('shows the field that changed, not the artifact that contains it', () => {
    render(<ChangeSetReview changeSet={proposal()} blueprint={blueprint} onApply={() => {}} />)

    const rows = within(screen.getByRole('list', { name: 'Proposed changes' })).getAllByRole(
      'listitem',
    )
    expect(rows).toHaveLength(3)

    // The skill's body did not change, so it is not in the diff; whenToUse did.
    const skillRow = rows[1]!
    expect(within(skillRow).getByText('whenToUse')).toBeInTheDocument()
    expect(within(skillRow).queryByText('body')).not.toBeInTheDocument()
    // And only the words that moved are marked, rather than the whole sentence.
    const added = [...skillRow.querySelectorAll('ins')].map((node) => node.textContent).join('')
    expect(added).toContain('changed')
    expect(added).not.toContain('When writing')
  })

  it('applies what is accepted and nothing else', async () => {
    const applied: ChangeOp[][] = []
    const user = userEvent.setup()
    render(
      <ChangeSetReview
        changeSet={proposal()}
        blueprint={blueprint}
        onApply={(ops) => applied.push(ops)}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Reject Keep commits small' }))
    expect(screen.getByText('2 of 3 accepted')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply 2 changes' }))
    expect(applied[0]!.map((op) => op.id)).toEqual([
      'update:skill:xunit',
      'update:agent:testing-expert',
    ])
  })

  it('takes them all back, and gives them all back', async () => {
    const user = userEvent.setup()
    render(<ChangeSetReview changeSet={proposal()} blueprint={blueprint} onApply={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Reject all' }))
    expect(screen.getByText('0 of 3 accepted')).toBeInTheDocument()
    // Nothing accepted means nothing to apply, and the button says so rather than lying.
    expect(screen.getByRole('button', { name: /^Apply/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Accept all' }))
    expect(screen.getByText('3 of 3 accepted')).toBeInTheDocument()
  })

  it('lets a proposal be edited as its file, and applies what was edited', async () => {
    const applied: ChangeOp[][] = []
    const user = userEvent.setup()
    render(
      <ChangeSetReview
        changeSet={proposal()}
        blueprint={blueprint}
        onApply={(ops) => applied.push(ops)}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Edit Keep commits small' }))
    const source = screen.getByRole('textbox', { name: 'Source of Keep commits small' })
    await user.clear(source)
    await user.type(
      source,
      '---\nname: Keep commits small\nguidance: One behaviour per commit, always.\ncategory: process\n---\n',
    )

    // The edit is checked as you type and the diff follows it.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply 3 changes' }))

    const edited = applied[0]!.find((op) => op.id === 'create:rule:small-commits')!
    expect((edited as { after: { guidance: string } }).after.guidance).toBe(
      'One behaviour per commit, always.',
    )
    // What was applied still parses as a Blueprint, because the same schema checked it.
    expect(applyChangeSet(blueprint, { ...proposal(), ops: applied[0]! }).rejected).toEqual([])
  })

  it('refuses an edit the project could not hold, and says why', async () => {
    const user = userEvent.setup()
    render(<ChangeSetReview changeSet={proposal()} blueprint={blueprint} onApply={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Edit Keep commits small' }))
    const source = screen.getByRole('textbox', { name: 'Source of Keep commits small' })
    await user.clear(source)
    await user.type(source, '---\nname: Keep commits small\n---\n')

    expect(await screen.findByRole('alert')).toHaveTextContent('guidance')
  })

  it('says what the operation could not do, above the list', () => {
    render(
      <ChangeSetReview
        changeSet={proposal()}
        blueprint={blueprint}
        notes={['Removed a reference to skill:security-audit, which does not exist.']}
        contextTrimmed
        onApply={() => {}}
      />,
    )

    const notes = screen.getByRole('list', { name: 'Notes' })
    expect(notes).toHaveTextContent('security-audit')
    expect(notes).toHaveTextContent('did not fit')
  })

  it('does not offer an Apply button for an answer that proposes nothing', async () => {
    const user = userEvent.setup()
    const regenerate = vi.fn()
    render(
      <ChangeSetReview
        changeSet={{ id: 'ai:test', source: 'ai', summary: 'Nothing to add.', ops: [] }}
        blueprint={blueprint}
        onApply={() => {}}
        onRegenerate={regenerate}
      />,
    )

    expect(screen.queryByRole('button', { name: /^Apply/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(regenerate).toHaveBeenCalled()
  })
})

describe('diffRecords', () => {
  it('ignores identity and bookkeeping, and reports the rest', () => {
    const fields = diffRecords(
      { id: 'a', metadata: { x: 1 }, name: 'One', tags: ['a'] },
      { id: 'a', metadata: { x: 2 }, name: 'Two', tags: ['a', 'b'] },
    )
    expect(fields.map((field) => field.field)).toEqual(['name', 'tags'])
    expect(fields[1]!.change).toBe('changed')
  })

  it('shows a list as lines, so a change points at the item', () => {
    expect(show(['a', 'b'])).toBe('a\nb')
    expect(show({ method: 'command', command: 'dotnet test' })).toBe(
      'method: command\ncommand: dotnet test',
    )
    expect(show(undefined)).toBe('')
  })
})
