import { readStarterFiles } from '@agent-blueprint/templates'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ImportDialog } from '@/components/dashboard/import-dialog'
import { previewImport } from '@/lib/storage'

const clean = () => previewImport(readStarterFiles('react-expert'), 'react-expert.zip')

/** A manifest with no artifact files: the shape a half-copied project arrives in. */
const broken = () =>
  previewImport(
    {
      'blueprint/blueprint.yaml':
        readStarterFiles('react-expert')['blueprint/blueprint.yaml'] ?? '',
    },
    'blueprint.yaml',
  )

describe('ImportDialog', () => {
  it('names the project, where it came from, and what is in it', async () => {
    render(<ImportDialog preview={await clean()} onCancel={vi.fn()} onOpen={vi.fn()} />)

    expect(screen.getByRole('heading', { name: /React Expert/ })).toBeInTheDocument()
    expect(screen.getByText(/react-expert\.zip/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'What was found' })).getByText(/skills/),
    ).toBeInTheDocument()
  })

  it('says so when a project reads cleanly', async () => {
    render(<ImportDialog preview={await clean()} onCancel={vi.fn()} onOpen={vi.fn()} />)

    expect(screen.getByText(/read cleanly/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Problems found while reading' }),
    ).not.toBeInTheDocument()
  })

  it('shows the problems before anything is stored', async () => {
    render(<ImportDialog preview={await broken()} onCancel={vi.fn()} onOpen={vi.fn()} />)

    const problems = screen.getByRole('list', { name: 'Problems found while reading' })
    expect(within(problems).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('still lets a broken project be opened, since that is where it gets fixed', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<ImportDialog preview={await broken()} onCancel={vi.fn()} onOpen={onOpen} />)

    const open = screen.getByRole('button', { name: /Open project/ })
    expect(open).toBeEnabled()
    await user.click(open)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('cancels without opening', async () => {
    const onCancel = vi.fn()
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<ImportDialog preview={await clean()} onCancel={onCancel} onOpen={onOpen} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
