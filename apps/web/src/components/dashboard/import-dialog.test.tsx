import { readStarterFiles } from '@agent-blueprint/templates'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ImportDialog } from '@/components/dashboard/import-dialog'
import { type ImportPreview, previewImport } from '@/lib/storage'

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

/**
 * What the first save would do, said before anything is stored.
 *
 * There are no schema migrations yet — `MIGRATIONS` is empty and every project is written at
 * 1.0 — so the migration list has nothing to show today and is driven here directly. The
 * rewrite list is reachable now: any project not written by this app arrives in a shape the
 * writer states differently.
 */
describe('ImportDialog: what saving would change', () => {
  /** A project the app wrote, with one file hand-edited into an equivalent but different shape. */
  const handEdited = async () => {
    const files = { ...readStarterFiles('react-expert') }
    const manifest = String(files['blueprint/blueprint.yaml'] ?? '')
    // A default spelled out in full: the same project, stated differently. The writer strips
    // `enabled: true` because it is the default, so the file that comes back is not this one.
    const edited = manifest.replace(
      '  - harnessId: claude-code',
      '  - harnessId: claude-code\n    enabled: true',
    )
    expect(edited).not.toBe(manifest)
    files['blueprint/blueprint.yaml'] = edited
    return previewImport(files, 'hand-edited.zip')
  }

  it('says nothing when the project round-trips', async () => {
    render(<ImportDialog preview={await clean()} onCancel={vi.fn()} onOpen={vi.fn()} />)

    expect(
      screen.queryByRole('list', { name: 'Files saving would change' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Migrations' })).not.toBeInTheDocument()
  })

  it('lists the source files the first save would rewrite', async () => {
    const preview = await handEdited()
    expect(preview.rewrites).toEqual([
      { path: 'blueprint/blueprint.yaml', kind: 'update' as const },
    ])

    render(<ImportDialog preview={preview} onCancel={vi.fn()} onOpen={vi.fn()} />)
    const list = screen.getByRole('list', { name: 'Files saving would change' })

    expect(within(list).getByText('blueprint/blueprint.yaml')).toBeInTheDocument()
    expect(screen.getByText(/Saving rewrites 1 source file/)).toBeInTheDocument()
    // Opening is still safe: the rewrite happens on save, not on open.
    expect(screen.getByText(/Opening changes nothing/)).toBeInTheDocument()
  })

  it('shows the migration path when one ran', async () => {
    const preview = {
      ...(await clean()),
      sourceSchemaVersion: '0.9',
      migrations: [
        { from: '0.9', to: '1.0', description: 'Gate criteria moved into a list.' },
      ] as ImportPreview['migrations'],
    }
    render(<ImportDialog preview={preview} onCancel={vi.fn()} onOpen={vi.fn()} />)

    expect(screen.getByText(/Written at schema 0\.9/)).toBeInTheDocument()
    const steps = screen.getByRole('list', { name: 'Migrations' })
    expect(within(steps).getByText(/Gate criteria moved into a list/)).toBeInTheDocument()
  })
})
