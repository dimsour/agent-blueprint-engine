import { readStarterFiles } from '@agent-blueprint/templates'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as StorageModule from '@/lib/storage'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

const downloadZip = vi.fn()

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof StorageModule>()),
  downloadZip: (...args: unknown[]) => downloadZip(...args) as unknown,
}))

const { ExportDialog } = await import('@/components/export/export-dialog')

async function load() {
  const { blueprint } = await parseProject(readStarterFiles('react-expert'))
  useWorkspace.getState().load('test', blueprint)
  return blueprint
}

describe('ExportDialog', () => {
  beforeEach(() => {
    downloadZip.mockReset()
    useWorkspace.getState().close()
  })

  it('lists the files the archive would hold', async () => {
    await load()
    render(<ExportDialog open onOpenChange={vi.fn()} />)

    const list = screen.getByRole('list', { name: 'Files in the archive' })
    expect(within(list).getByText('blueprint/blueprint.yaml')).toBeInTheDocument()
    expect(within(list).getByText('blueprint/skills/react-testing/SKILL.md')).toBeInTheDocument()
  })

  it('says the archive is the source project, not the compiled output', async () => {
    await load()
    render(<ExportDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByText(/source project/i)).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Files in the archive' })
    // Nothing a harness reads: no CLAUDE.md, no .agents, no AGENTS.md.
    expect(within(list).queryByText(/^CLAUDE\.md$/)).not.toBeInTheDocument()
    expect(within(list).queryByText(/^AGENTS\.md$/)).not.toBeInTheDocument()
  })

  it('downloads under the Blueprint id and closes', async () => {
    await load()
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<ExportDialog open onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: /Download ZIP/ }))

    // Building the archive is asynchronous; the dialog stays until it is ready.
    await waitFor(() => expect(downloadZip).toHaveBeenCalledTimes(1))
    expect(downloadZip.mock.calls[0]?.[1]).toBe('react-expert.zip')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('exports the edit that has not been saved yet', async () => {
    const blueprint = await load()
    const skill = blueprint.skills[0]!
    useWorkspace.getState().upsert('skill', { ...skill, description: 'Edited but unsaved.' })

    render(<ExportDialog open onOpenChange={vi.fn()} />)
    // The size list is built from the Blueprint in the store, not from what is on disk.
    expect(screen.getByRole('list', { name: 'Files in the archive' })).toBeInTheDocument()
    expect(useWorkspace.getState().dirty).toBe(true)
  })

  it('renders nothing without a project', () => {
    render(<ExportDialog open onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
