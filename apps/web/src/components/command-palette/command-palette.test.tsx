/**
 * The palette's contract: everything enabled here goes through the store, and everything
 * that is not built yet is visible and disabled rather than missing.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CommandPalette } from '@/components/command-palette/command-palette'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

async function load() {
  const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
  useWorkspace.getState().load('test', blueprint)
  return blueprint
}

function open(onOpenAssistant = vi.fn()) {
  const onOpenChange = vi.fn()
  render(<CommandPalette open onOpenChange={onOpenChange} onOpenAssistant={onOpenAssistant} />)
  return { onOpenChange, onOpenAssistant }
}

describe('CommandPalette', () => {
  beforeEach(() => {
    useWorkspace.getState().close()
  })

  it('offers a create action for every artifact kind', async () => {
    await load()
    open()

    expect(screen.getByRole('option', { name: /Create Skill/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Create Iron Law/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Create Scenario/ })).toBeInTheDocument()
  })

  it('creates the artifact, selects it and closes', async () => {
    await load()
    const user = userEvent.setup()
    const { onOpenChange } = open()

    await user.click(screen.getByRole('option', { name: /Create Skill/ }))

    const state = useWorkspace.getState()
    const created = state.blueprint?.skills.find((skill) => skill.id === 'new-skill')
    expect(created?.name).toBe('New skill')
    expect(state.selection).toEqual({ kind: 'skill', id: 'new-skill' })
    expect(state.artifactTab).toBe('visual')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('finds an artifact by name and selects it', async () => {
    await load()
    const user = userEvent.setup()
    open()

    await user.type(screen.getByLabelText('Command'), 'xUnit')
    await user.click(screen.getByRole('option', { name: /xUnit/ }))

    expect(useWorkspace.getState().selection).toEqual({ kind: 'skill', id: 'xunit' })
  })

  it('finds an artifact by its id too', async () => {
    await load()
    const user = userEvent.setup()
    open()

    await user.type(screen.getByLabelText('Command'), 'write-tests')
    expect(screen.getByRole('option', { name: /Write Unit Tests/ })).toBeInTheDocument()
  })

  it('switches the canvas tab for the selected artifact', async () => {
    await load()
    useWorkspace.getState().select({ kind: 'skill', id: 'xunit' })
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('option', { name: /Show the project file/ }))
    expect(useWorkspace.getState().artifactTab).toBe('source')
  })

  it('offers no preview for an artifact stored as YAML', async () => {
    await load()
    useWorkspace.getState().select({ kind: 'gate', id: 'tests-pass' })
    open()

    expect(screen.getByRole('option', { name: /Show the project file/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Show the preview/ })).not.toBeInTheDocument()
  })

  it('turns a compile target off, without listing it twice', async () => {
    const blueprint = await load()
    const first = blueprint.targets[0]!
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('option', { name: new RegExp(`Disable ${first.harnessId}`) }))

    const targets = useWorkspace.getState().blueprint?.targets ?? []
    expect(targets.map((target) => target.harnessId)).not.toContain(first.harnessId)
    // A harness listed twice is a validation error that blocks export.
    expect(new Set(targets.map((t) => t.harnessId)).size).toBe(targets.length)
  })

  it('disables Save until there is something to save', async () => {
    await load()
    open()

    expect(screen.getByRole('option', { name: /Save/ })).toHaveAttribute('data-disabled', 'true')
  })

  it('names what is not built yet instead of hiding it', async () => {
    await load()
    open()

    const push = screen.getByRole('option', { name: /Push to GitHub/ })
    expect(push).toHaveAttribute('data-disabled', 'true')
    expect(within(push).getByText('not built yet')).toBeInTheDocument()
  })

  it('opens a report and closes, like every other action', async () => {
    await load()
    const user = userEvent.setup()
    const { onOpenChange } = open()

    await user.click(screen.getByRole('option', { name: /Show compatibility/ }))

    expect(useWorkspace.getState().view).toBe('compatibility')
    // A report is about the whole Blueprint, so it leaves no artifact selected.
    expect(useWorkspace.getState().selection).toBeUndefined()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('lists every AI action, and says which one needs a selection', async () => {
    await load()
    const user = userEvent.setup()
    const { onOpenChange, onOpenAssistant } = open()

    // Nothing is selected, so the actions that act on one artifact say so rather than vanish.
    const improve = screen.getByRole('option', { name: /Add verification/ })
    expect(improve).toHaveAttribute('data-disabled', 'true')
    expect(within(improve).getByText('Select an artifact first')).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: /Draft the whole Blueprint/ }))
    expect(onOpenAssistant).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens the export view, which is the one place an archive is built', async () => {
    await load()
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('option', { name: /^Export/ }))
    expect(useWorkspace.getState().view).toBe('export')
  })

  it('says so when nothing matches', async () => {
    await load()
    const user = userEvent.setup()
    open()

    await user.type(screen.getByLabelText('Command'), 'zzzzzz')
    expect(screen.getByText('Nothing matches that.')).toBeInTheDocument()
  })
})
