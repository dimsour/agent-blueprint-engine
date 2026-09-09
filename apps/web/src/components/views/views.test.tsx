/**
 * The trust surfaces: the report the app gives about a Blueprint, and what it will write.
 *
 * These are the screens that make the product's claims checkable, so what matters is that
 * they agree with the functions behind them rather than paraphrasing them.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { evaluateBlueprint, validateBlueprint } from '@agent-blueprint/core'
import { compileBlueprint, portabilityOf } from '@agent-blueprint/exporters'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CompatibilityView } from '@/components/views/compatibility-view'
import { EvaluationView } from '@/components/views/evaluation-view'
import { ExportView } from '@/components/views/export-view'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

async function load() {
  const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
  useWorkspace.getState().load('test', blueprint)
  return blueprint
}

describe('EvaluationView', () => {
  beforeEach(() => useWorkspace.getState().close())

  it('shows the same score the evaluator computes', async () => {
    const blueprint = await load()
    const expected = evaluateBlueprint(blueprint, { diagnostics: validateBlueprint(blueprint) })
    render(<EvaluationView />)

    // The portability provider shifts the overall score, so the dimensions are the firm
    // comparison: every one the evaluator reports is on screen, with its weight.
    const list = screen.getByRole('list', { name: 'Dimension scores' })
    for (const dimension of expected.dimensions) {
      expect(within(list).getByText(dimension.label)).toBeInTheDocument()
    }
    expect(within(list).getAllByText(/^×/)).toHaveLength(expected.dimensions.length)
  })

  it('reports every requirement with the checks behind it', async () => {
    const blueprint = await load()
    render(<EvaluationView />)

    const list = screen.getByRole('list', { name: 'Requirement results' })
    expect(within(list).getAllByRole('listitem', { name: '' }).length).toBeGreaterThan(0)
    for (const requirement of blueprint.requirements) {
      expect(within(list).getByText(requirement.statement)).toBeInTheDocument()
    }
  })

  it('navigates to the artifact a finding is about', async () => {
    const blueprint = await load()
    // Clearing a description is the simplest way to make the fixture produce a finding.
    useWorkspace.getState().upsert('skill', { ...blueprint.skills[0]!, description: undefined })
    await useWorkspace.getState().flushPending()

    const user = userEvent.setup()
    render(<EvaluationView />)

    const finding = screen.getAllByRole('button', { name: /BP-/ })[0]
    expect(finding).toBeDefined()
    await user.click(finding!)

    expect(useWorkspace.getState().selection).toBeDefined()
  })

  it('says so when there is nothing to evaluate against', async () => {
    const blueprint = await load()
    useWorkspace.getState().load('test', { ...blueprint, requirements: [] })
    render(<EvaluationView />)

    expect(screen.getByText(/No requirements yet/)).toBeInTheDocument()
  })
})

describe('CompatibilityView', () => {
  beforeEach(() => useWorkspace.getState().close())

  it('lists only the concepts this Blueprint uses', async () => {
    const blueprint = await load()
    const expected = portabilityOf(blueprint).matrix.filter((row) => row.used)
    render(<CompatibilityView />)

    const rows = within(screen.getByRole('table')).getAllByRole('row')
    // One header row plus one per used concept.
    expect(rows).toHaveLength(expected.length + 1)
  })

  it('turning a harness on shows what it cannot do', async () => {
    await load()
    const user = userEvent.setup()
    render(<CompatibilityView />)

    await user.click(screen.getByRole('button', { name: 'Pi', pressed: false }))

    expect(useWorkspace.getState().blueprint?.targets.map((t) => t.harnessId)).toContain('pi')
    const notes = screen.getByRole('list', { name: 'Compatibility notes' })
    expect(within(notes).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('turning every harness off leaves nothing to be compatible with', async () => {
    const blueprint = await load()
    useWorkspace.getState().load('test', { ...blueprint, targets: [] })
    render(<CompatibilityView />)

    expect(screen.getByText(/No target is chosen/)).toBeInTheDocument()
  })
})

describe('ExportView', () => {
  beforeEach(() => useWorkspace.getState().close())

  it('lists the source and every target the compiler produced', async () => {
    const blueprint = await load()
    const compiled = compileBlueprint(blueprint)
    render(<ExportView />)

    const source = screen.getByRole('list', { name: 'Source files' })
    expect(within(source).getByText('blueprint/blueprint.yaml')).toBeInTheDocument()

    // One group per compiled target, named for the harness rather than its id.
    expect(compiled.targets.length).toBeGreaterThan(0)
    expect(screen.getByRole('list', { name: 'Claude Code files' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'OpenAI Codex files' })).toBeInTheDocument()
  })

  it('counts the files it is showing, and shows each of them once', async () => {
    await load()
    render(<ExportView />)

    const rows = screen
      .getAllByRole('list')
      .filter((list) => /files$/.test(list.getAttribute('aria-label') ?? ''))
      .flatMap((list) => within(list).getAllByRole('listitem'))

    // The badge used to count the compiler's files while the tree listed shared files under
    // every harness that reads them, so the number and the list disagreed by ten rows.
    expect(screen.getByText(`${rows.length} files`)).toBeInTheDocument()

    const paths = rows.map((row) => row.textContent)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('shows a file exactly as it would be written', async () => {
    const blueprint = await load()
    const compiled = compileBlueprint(blueprint)
    const file = compiled.files.find((candidate) => candidate.path === 'CLAUDE.md')!
    const user = userEvent.setup()
    render(<ExportView />)

    await user.click(screen.getByRole('button', { name: /CLAUDE\.md/ }))

    // The preview is the content, not a rendering of it.
    expect(screen.getByText(file.content.slice(0, 40), { exact: false })).toBeInTheDocument()
  })

  it('blocks the download while an error stands, and links to it', async () => {
    const blueprint = await load()
    // A workflow with no nodes is a structural error the compiler must not paper over.
    useWorkspace.getState().load('test', {
      ...blueprint,
      workflows: blueprint.workflows.map((workflow, index) =>
        index === 0 ? { ...workflow, nodes: [], edges: [], entryNodeId: undefined } : workflow,
      ),
    })
    render(<ExportView />)

    expect(screen.getByRole('button', { name: /Download/ })).toBeDisabled()
    expect(screen.getByRole('list', { name: 'Errors blocking export' })).toBeInTheDocument()
  })

  it('says nothing is blocking when nothing is', async () => {
    await load()
    render(<ExportView />)

    expect(screen.getByText(/Nothing is blocking this export/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download/ })).toBeEnabled()
  })
})
