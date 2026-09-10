/**
 * What `/new` promises: one screen, it will not create something with no name, and Create
 * writes exactly the draft that was on the screen and opens the workspace on it.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as StorageModule from '@/lib/storage'
import { clearDraft, readDraft, resetDbForTests, writeDraft } from '@/lib/storage'
import { emptyDraft, setIdentity } from '@/lib/wizard/draft'

const push = vi.fn()
const createProject = vi.fn()

// `PageHeader` reads the pathname to decide whether to link to the tutorial it might be on.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => '/new',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/storage', async (importOriginal) => ({
  // The real module is kept: the screen also reads StorageError from it.
  ...(await importOriginal<typeof StorageModule>()),
  createProject: (...args: unknown[]) => createProject(...args) as unknown,
}))

const { Wizard } = await import('@/components/wizard/wizard')

/** The field, not the info button beside it, which is also named after the field. */
const field = (label: string) => screen.getByLabelText(label, { exact: true })

describe('New Blueprint', () => {
  beforeEach(async () => {
    push.mockReset()
    createProject.mockReset()
    createProject.mockResolvedValue({ id: 'project-1', name: 'Rust Review Crew' })
    await resetDbForTests()
    await clearDraft('wizard')
  })

  it('offers to pick up a draft left behind', async () => {
    // A typed brief is worth more than the keystrokes it took; a stray reload should not cost it.
    await writeDraft('wizard', setIdentity(emptyDraft(), { name: 'Half Finished' }))
    const user = userEvent.setup()
    render(<Wizard />)

    await screen.findByText(/part way through/i)
    await user.click(screen.getByRole('button', { name: /Pick it up/ }))

    expect(field('Name')).toHaveValue('Half Finished')
  })

  it('can be told to start fresh instead', async () => {
    await writeDraft('wizard', setIdentity(emptyDraft(), { name: 'Half Finished' }))
    const user = userEvent.setup()
    render(<Wizard />)

    await screen.findByText(/part way through/i)
    await user.click(screen.getByRole('button', { name: /Start fresh/ }))

    expect(screen.queryByText(/part way through/i)).not.toBeInTheDocument()
    expect(field('Name')).toHaveValue('')
    expect(await readDraft('wizard')).toBeUndefined()
  })

  it('is one screen, and asks one question', () => {
    render(<Wizard />)

    expect(screen.getByRole('heading', { name: 'What are you building?' })).toBeInTheDocument()
    // The ten-step stepper is gone, and with it every step body behind it.
    expect(screen.queryByRole('navigation', { name: 'Wizard steps' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Next/ })).not.toBeInTheDocument()
  })

  it('will not create anything until the Blueprint has a name', async () => {
    const user = userEvent.setup()
    render(<Wizard />)

    expect(screen.getByRole('button', { name: /Create project/ })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/name/i)

    await user.type(field('Name'), 'Rust Review Crew')
    expect(screen.getByRole('button', { name: /Create project/ })).toBeEnabled()
  })

  it('derives the id from the name and lets it be overridden', async () => {
    const user = userEvent.setup()
    render(<Wizard />)

    await user.type(field('Name'), 'Rust Review Crew')
    expect(field('Id')).toHaveValue('rust-review-crew')

    await user.clear(field('Id'))
    await user.type(field('Id'), 'rrc')
    expect(field('Id')).toHaveValue('rrc')
  })

  it('creates the project from the draft it showed, and opens it', async () => {
    const user = userEvent.setup()
    render(<Wizard />)

    await user.type(field('Name'), 'Rust Review Crew')
    await user.type(field('Description'), 'Reviews Rust changes before they merge.')
    await user.click(screen.getByRole('button', { name: /Create project/ }))

    expect(createProject).toHaveBeenCalledTimes(1)
    const created = createProject.mock.calls[0]?.[0] as {
      id: string
      name: string
      description?: string
    }
    expect(created.name).toBe('Rust Review Crew')
    expect(created.id).toBe('rust-review-crew')
    expect(created.description).toBe('Reviews Rust changes before they merge.')
    expect(push).toHaveBeenCalledWith('/p/project-1')
  })

  it('offers a way back out, like every route that is not the dashboard', () => {
    render(<Wizard />)
    expect(screen.getByRole('link', { name: /Back/ })).toBeInTheDocument()
  })
})
