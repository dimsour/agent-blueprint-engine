/**
 * The inspector's contract: it explains the selected artifact's place in the Blueprint, and
 * its actions are refactors that say what they will touch before they touch it.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Inspector } from '@/components/inspector/inspector'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

async function load() {
  const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
  useWorkspace.getState().load('test', blueprint)
  return blueprint
}

const xunit = { kind: 'skill', id: 'xunit' } as const

function select(ref: { kind: 'skill' | 'agent' | 'workflow'; id: string }) {
  useWorkspace.getState().select(ref)
}

describe('Inspector', () => {
  beforeEach(() => {
    useWorkspace.getState().close()
  })

  it('shows every finding when nothing is selected', async () => {
    await load()
    render(<Inspector />)

    expect(screen.getByText('All findings')).toBeInTheDocument()
  })

  it('identifies the selected artifact by kind, name and id', async () => {
    await load()
    select(xunit)
    render(<Inspector />)

    expect(screen.getByRole('heading', { name: 'xUnit' })).toBeInTheDocument()
    expect(screen.getByText('xunit')).toBeInTheDocument()
    expect(screen.getByText('Skill')).toBeInTheDocument()
  })

  it('lists the agent and the workflow that use a skill', async () => {
    await load()
    select(xunit)
    render(<Inspector />)

    const usedBy = screen.getByRole('list', { name: 'Used by' })
    expect(within(usedBy).getByText('Testing Expert')).toBeInTheDocument()
    expect(within(usedBy).getByText('Write Unit Tests')).toBeInTheDocument()
  })

  it('lists what an agent depends on', async () => {
    await load()
    select({ kind: 'agent', id: 'testing-expert' })
    render(<Inspector />)

    const dependsOn = screen.getByRole('list', { name: 'Depends on' })
    expect(within(dependsOn).getByText('xUnit')).toBeInTheDocument()
  })

  it('navigates to a related artifact when it is clicked', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    const usedBy = screen.getByRole('list', { name: 'Used by' })
    await user.click(within(usedBy).getByText('Testing Expert'))

    expect(useWorkspace.getState().selection).toEqual({ kind: 'agent', id: 'testing-expert' })
    expect(screen.getByRole('heading', { name: 'Testing Expert' })).toBeInTheDocument()
  })

  it('marks the primary agent', async () => {
    await load()
    select({ kind: 'agent', id: 'testing-expert' })
    render(<Inspector />)

    expect(screen.getByText('Primary')).toBeInTheDocument()
  })

  it('duplicates an artifact under a free id and selects the copy', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Duplicate' }))

    const copy = useWorkspace
      .getState()
      .blueprint?.skills.find((skill) => skill.id === 'xunit-copy')
    expect(copy?.name).toBe('xUnit (copy)')
    expect(useWorkspace.getState().selection).toEqual({ kind: 'skill', id: 'xunit-copy' })
  })

  it('renames through the store so references follow', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Rename…' }))
    const field = screen.getByLabelText('New id')
    await user.clear(field)
    await user.type(field, 'xunit-v3')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Rename' }))

    const state = useWorkspace.getState()
    expect(state.blueprint?.skills.some((skill) => skill.id === 'xunit-v3')).toBe(true)
    expect(state.blueprint?.agents[0]?.skillIds).toContain('xunit-v3')
  })

  it('shows what a typed id will actually become', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Rename…' }))
    const field = screen.getByLabelText('New id')
    await user.clear(field)
    await user.type(field, 'Not A Slug')

    // An id is kebab-case, so the dialog says so before the button is pressed.
    expect(screen.getByText(/Saved as/)).toHaveTextContent('not-a-slug')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Rename' }))

    expect(
      useWorkspace.getState().blueprint?.skills.some((skill) => skill.id === 'not-a-slug'),
    ).toBe(true)
  })

  it('refuses an id another artifact already has, and says which', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Rename…' }))
    const field = screen.getByLabelText('New id')
    await user.clear(field)
    await user.type(field, 'test-design')

    expect(screen.getByRole('alert')).toHaveTextContent(/already has the id/)
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Rename' }),
    ).toBeDisabled()
    expect(useWorkspace.getState().blueprint?.skills.some((skill) => skill.id === 'xunit')).toBe(
      true,
    )
  })

  it('refuses an empty id rather than guessing', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Rename…' }))
    await user.clear(screen.getByLabelText('New id'))

    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be empty/)
  })

  it('names what a delete would affect before it happens', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const affected = screen.getByRole('list', { name: 'Affected artifacts' })
    expect(within(affected).getByText('Testing Expert')).toBeInTheDocument()
    // Still there: the dialog is a warning, not the deletion.
    expect(useWorkspace.getState().blueprint?.skills.some((skill) => skill.id === 'xunit')).toBe(
      true,
    )
  })

  it('reaches past the artifacts that point at it, to the ones that point at those', async () => {
    await load()
    // Deleting a skill affects the agent that uses it, and whatever uses that agent.
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByRole('list', { name: 'Affected artifacts' })).toBeInTheDocument()
    // And the compiled output it would change.
    expect(within(dialog).getByText(/Compiled output changes for/)).toHaveTextContent('Claude Code')
  })

  it('deletes on confirmation and clears the selection', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(useWorkspace.getState().blueprint?.skills.some((skill) => skill.id === 'xunit')).toBe(
      false,
    )
    expect(useWorkspace.getState().selection).toBeUndefined()
  })

  it('warns that deleting the primary agent leaves the Blueprint without one', async () => {
    await load()
    select({ kind: 'agent', id: 'testing-expert' })
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/primary agent/i)
  })

  it('adds an artifact from a template only after showing the change', async () => {
    await load()
    select(xunit)
    const user = userEvent.setup()
    render(<Inspector />)

    await user.click(screen.getByRole('button', { name: 'New from template' }))
    await user.type(screen.getByLabelText('Name'), 'Property Based Testing')

    // The change is described before it is applied, and the id comes from the name.
    expect(screen.getByText('property-based-testing')).toBeInTheDocument()
    expect(screen.getByText(/^Create skill/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add' }))

    const added = useWorkspace
      .getState()
      .blueprint?.skills.find((skill) => skill.id === 'property-based-testing')
    expect(added?.name).toBe('Property Based Testing')
    expect(useWorkspace.getState().selection).toEqual({
      kind: 'skill',
      id: 'property-based-testing',
    })
  })

  it('reports an artifact that has gone away rather than rendering nothing', async () => {
    await load()
    // A selection can outlive its artifact: undo, a change-set, or a second tab.
    useWorkspace.getState().remove(xunit)
    select(xunit)
    render(<Inspector />)

    expect(screen.getByText('That artifact no longer exists.')).toBeInTheDocument()
  })
})
