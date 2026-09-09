import { readStarterFiles } from '@agent-blueprint/templates'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

import { EntityForm } from './entity-form'

async function load(id = 'react-expert') {
  const { blueprint } = await parseProject(readStarterFiles(id))
  useWorkspace.getState().load('test', blueprint)
}

describe('EntityForm', () => {
  beforeEach(() => {
    useWorkspace.getState().close()
  })

  it('edits a skill description straight into the Blueprint', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

    const description = screen.getByLabelText('Description')
    await user.clear(description)
    await user.type(description, 'Testing components by role and label.')

    const skill = useWorkspace.getState().blueprint?.skills.find((s) => s.id === 'react-testing')
    expect(skill?.description).toBe('Testing components by role and label.')
    expect(useWorkspace.getState().dirty).toBe(true)
  })

  it('renames an artifact and rewrites every reference to it', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'skill', id: 'accessibility' }} />)

    const id = screen.getByLabelText('Id')
    await user.clear(id)
    await user.type(id, 'a11y')
    await user.click(screen.getByRole('button', { name: 'Rename' }))

    const blueprint = useWorkspace.getState().blueprint
    expect(blueprint?.skills.map((skill) => skill.id)).toContain('a11y')
    expect(blueprint?.agents[0]?.skillIds).toContain('a11y')
    expect(blueprint?.agents[0]?.skillIds).not.toContain('accessibility')
  })

  it('keeps an invalid id out of the Blueprint', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'skill', id: 'accessibility' }} />)

    await user.clear(screen.getByLabelText('Id'))
    await user.type(screen.getByLabelText('Id'), 'Not A Slug')
    await user.click(screen.getByRole('button', { name: 'Rename' }))

    expect(useWorkspace.getState().blueprint?.skills.map((skill) => skill.id)).toContain(
      'accessibility',
    )
  })

  it('adds and removes a responsibility on an agent', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

    const before = useWorkspace.getState().blueprint?.agents[0]?.responsibilities.length ?? 0

    await user.type(screen.getByLabelText('New Responsibilities'), 'Review pull requests{Enter}')
    expect(useWorkspace.getState().blueprint?.agents[0]?.responsibilities).toContain(
      'Review pull requests',
    )

    await user.click(screen.getByRole('button', { name: `Remove Responsibilities ${before + 1}` }))
    expect(useWorkspace.getState().blueprint?.agents[0]?.responsibilities).toHaveLength(before)
  })

  it('toggles a skill on an agent through the reference picker', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

    const toggle = screen.getByRole('button', { name: 'Accessibility', pressed: true })
    await user.click(toggle)
    expect(useWorkspace.getState().blueprint?.agents[0]?.skillIds).not.toContain('accessibility')

    await user.click(screen.getByRole('button', { name: 'Accessibility', pressed: false }))
    expect(useWorkspace.getState().blueprint?.agents[0]?.skillIds).toContain('accessibility')
  })

  it('sets a permission decision from the grid', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

    await user.click(screen.getByRole('button', { name: 'Delete files: deny', pressed: false }))
    expect(useWorkspace.getState().blueprint?.agents[0]?.permissions.operations['fs.delete']).toBe(
      'deny',
    )

    // Clicking the same decision again clears it back to the harness default.
    await user.click(screen.getByRole('button', { name: 'Delete files: deny', pressed: true }))
    expect(
      useWorkspace.getState().blueprint?.agents[0]?.permissions.operations['fs.delete'],
    ).toBeUndefined()
  })

  it('edits an Iron Law without losing its severity', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'iron-law', id: 'never-fake-verification' }} />)

    const rule = screen.getByLabelText('Rule')
    await user.clear(rule)
    await user.type(rule, 'Never claim a test passed without running it.')

    const law = useWorkspace
      .getState()
      .blueprint?.ironLaws.find((l) => l.id === 'never-fake-verification')
    expect(law?.rule).toBe('Never claim a test passed without running it.')
    expect(law?.severity).toBe('critical')
  })

  it('renders a form for every kind in the team starter without throwing', async () => {
    await load('software-engineering-team')
    const blueprint = useWorkspace.getState().blueprint
    expect(blueprint).toBeDefined()

    for (const [kind, entities] of [
      ['agent', blueprint?.agents],
      ['skill', blueprint?.skills],
      ['workflow', blueprint?.workflows],
      ['iron-law', blueprint?.ironLaws],
      ['rule', blueprint?.rules],
      ['hook', blueprint?.hooks],
      ['gate', blueprint?.gates],
      ['tool', blueprint?.tools],
      ['memory', blueprint?.memories],
      ['requirement', blueprint?.requirements],
    ] as const) {
      const first = entities?.[0]
      if (!first) continue
      const { unmount } = render(<EntityForm selection={{ kind, id: first.id }} />)
      expect(screen.getByLabelText('Name')).toHaveValue(first.name)
      unmount()
    }
  })
})
