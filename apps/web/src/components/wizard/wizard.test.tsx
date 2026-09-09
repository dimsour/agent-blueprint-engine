/**
 * The wizard's contract: it will not let you past the two steps that matter, it builds one
 * agent that owns what you add, and Create writes exactly the draft you were shown.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as StorageModule from '@/lib/storage'
import { clearDraft, readDraft, resetDbForTests, writeDraft } from '@/lib/storage'
import { emptyDraft, setIdentity } from '@/lib/wizard/draft'

const push = vi.fn()
const createProject = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/storage', async (importOriginal) => ({
  // The real module is kept: the wizard also reads StorageError from it.
  ...(await importOriginal<typeof StorageModule>()),
  createProject: (...args: unknown[]) => createProject(...args) as unknown,
}))

const { Wizard } = await import('@/components/wizard/wizard')

/** Fills in the two required steps and stops on step 3. */
async function startProject(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'Rust Review Crew')
  await user.click(screen.getByRole('button', { name: /Next/ }))
  await user.type(screen.getByLabelText('Agent name'), 'Rust Reviewer')
  await user.click(screen.getByRole('button', { name: /Next/ }))
}

async function goTo(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(label) }))
}

describe('Wizard', () => {
  beforeEach(async () => {
    push.mockReset()
    createProject.mockReset()
    createProject.mockResolvedValue({ id: 'project-1', name: 'Rust Review Crew' })
    await resetDbForTests()
    await clearDraft('wizard')
  })

  it('offers to pick up a draft left behind', async () => {
    // Ten questions is long enough that a closed tab should not mean starting again.
    await writeDraft('wizard', setIdentity(emptyDraft(), { name: 'Half Finished' }))
    const user = userEvent.setup()
    render(<Wizard />)

    await screen.findByText(/part way through/i)
    await user.click(screen.getByRole('button', { name: /Pick it up/ }))

    expect(screen.getByLabelText('Name')).toHaveValue('Half Finished')
  })

  it('can be told to start fresh instead', async () => {
    await writeDraft('wizard', setIdentity(emptyDraft(), { name: 'Half Finished' }))
    const user = userEvent.setup()
    render(<Wizard />)

    await screen.findByText(/part way through/i)
    await user.click(screen.getByRole('button', { name: /Start fresh/ }))

    expect(screen.queryByText(/part way through/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(await readDraft('wizard')).toBeUndefined()
  })

  it('opens on the first question with the steps listed', () => {
    render(<Wizard />)

    expect(screen.getByRole('heading', { name: 'What are you building?' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Wizard steps' })).getAllByRole('button'),
    ).toHaveLength(10)
  })

  it('will not move on until the Blueprint has a name', async () => {
    const user = userEvent.setup()
    render(<Wizard />)

    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/name/i)

    await user.type(screen.getByLabelText('Name'), 'Rust Review Crew')
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled()
  })

  it('derives the id from the name and lets it be overridden', async () => {
    const user = userEvent.setup()
    render(<Wizard />)

    await user.type(screen.getByLabelText('Name'), 'Rust Review Crew')
    expect(screen.getByLabelText('Id')).toHaveValue('rust-review-crew')

    await user.clear(screen.getByLabelText('Id'))
    await user.type(screen.getByLabelText('Id'), 'rrc')
    expect(screen.getByLabelText('Id')).toHaveValue('rrc')
  })

  it('will not move past the agent step until the agent is named', async () => {
    const user = userEvent.setup()
    render(<Wizard />)

    await user.type(screen.getByLabelText('Name'), 'Rust Review Crew')
    await user.click(screen.getByRole('button', { name: /Next/ }))

    expect(screen.getByRole('heading', { name: 'Who is the agent?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled()

    await user.type(screen.getByLabelText('Agent name'), 'Rust Reviewer')
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled()
    expect(screen.getByLabelText('Role')).toBeInTheDocument()
  })

  it('adds a skill from a template and lists it', async () => {
    const user = userEvent.setup()
    render(<Wizard />)
    await startProject(user)

    expect(screen.getByRole('heading', { name: 'What should it know?' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /^Add / })[0] as HTMLElement)

    expect(screen.getByRole('list', { name: 'Added Skills' })).toBeInTheDocument()
  })

  it('adds an artifact of your own and removes it again', async () => {
    const user = userEvent.setup()
    render(<Wizard />)
    await startProject(user)

    await user.type(screen.getByLabelText('Add your own'), 'Property testing')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const added = screen.getByRole('list', { name: 'Added Skills' })
    expect(within(added).getByText('Property testing')).toBeInTheDocument()
    expect(within(added).getByText('property-testing')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Property testing' }))
    expect(screen.queryByRole('list', { name: 'Added Skills' })).not.toBeInTheDocument()
  })

  it('lets a later step be revisited but not skipped to', async () => {
    const user = userEvent.setup()
    render(<Wizard />)
    await startProject(user)

    const steps = screen.getByRole('navigation', { name: 'Wizard steps' })
    expect(within(steps).getByRole('button', { name: /Finish/ })).toBeDisabled()

    await user.click(within(steps).getByRole('button', { name: /Project/ }))
    expect(screen.getByRole('heading', { name: 'What are you building?' })).toBeInTheDocument()
  })

  it('chooses the compile targets and scores portability', async () => {
    const user = userEvent.setup()
    render(<Wizard />)
    await startProject(user)
    for (const _ of [1, 2, 3, 4, 5]) await goTo(user, 'Next')

    expect(screen.getByRole('heading', { name: 'Where should it run?' })).toBeInTheDocument()
    const claude = screen.getByRole('checkbox', { name: /Claude Code/ })
    expect(claude).toBeChecked()

    await user.click(claude)
    expect(claude).not.toBeChecked()
  })

  it('scores the draft before it is created', async () => {
    const user = userEvent.setup()
    render(<Wizard />)
    await startProject(user)
    for (const _ of [1, 2, 3, 4, 5, 6]) await goTo(user, 'Next')

    expect(screen.getByRole('heading', { name: 'Is it any good?' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Scores by dimension' })).toBeInTheDocument()
  })

  it('creates the project from the draft it showed', async () => {
    const user = userEvent.setup()
    render(<Wizard />)
    await startProject(user)
    await user.click(screen.getAllByRole('button', { name: /^Add / })[0] as HTMLElement)
    for (const _ of [1, 2, 3, 4, 5, 6, 7]) await goTo(user, 'Next')

    expect(screen.getByRole('heading', { name: 'Rust Review Crew' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Create project/ }))

    expect(createProject).toHaveBeenCalledTimes(1)
    const created = createProject.mock.calls[0]?.[0] as {
      name: string
      agents: unknown[]
      skills: unknown[]
    }
    expect(created.name).toBe('Rust Review Crew')
    expect(created.agents).toHaveLength(1)
    expect(created.skills.length).toBeGreaterThan(0)
    expect(push).toHaveBeenCalledWith('/p/project-1')
  })
})
