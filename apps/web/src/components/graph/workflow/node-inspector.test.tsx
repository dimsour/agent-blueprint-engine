/**
 * The step panel.
 *
 * The canvas needs a browser; this panel does not, and it is where the editing actually
 * happens. It is also the only keyboard path to a connection, so these tests stand in for
 * every gesture a mouse user gets for free.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import type { Blueprint, Workflow } from '@agent-blueprint/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { NodePanel } from '@/components/graph/workflow/node-inspector'
import { parseProject } from '@/lib/storage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let blueprint: Blueprint

beforeAll(async () => {
  ;({ blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert')))
})

/** Renders the panel over a workflow, and hands back whatever the last edit produced. */
function panelFor(workflow: Workflow, nodeId: string) {
  const changes: Workflow[] = []
  const rerender = (current: Workflow) =>
    view.rerender(
      <NodePanel
        node={current.nodes.find((node) => node.id === nodeId)!}
        workflow={current}
        blueprint={blueprint}
        onChange={(next) => {
          changes.push(next)
          rerender(next)
        }}
        onClearSelection={() => undefined}
      />,
    )

  const view = render(
    <NodePanel
      node={workflow.nodes.find((node) => node.id === nodeId)!}
      workflow={workflow}
      blueprint={blueprint}
      onChange={(next) => {
        changes.push(next)
        rerender(next)
      }}
      onClearSelection={() => undefined}
    />,
  )

  return { changes, latest: () => changes.at(-1) }
}

describe('NodePanel', () => {
  it('connects two steps, with the kind chosen at the time', async () => {
    const workflow = blueprint.workflows[0]!
    const from = workflow.nodes[0]!
    const user = userEvent.setup()
    const { latest } = panelFor(workflow, from.id)

    // Every step this one does not already lead to is offered.
    const target = workflow.nodes.find(
      (node) => node.id !== from.id && !workflow.edges.some((edge) => edge.to === node.id),
    )
    expect(target).toBeDefined()
    await user.click(screen.getByRole('button', { name: target!.label, pressed: false }))

    const edge = latest()?.edges.find((candidate) => candidate.to === target!.id)
    expect(edge).toBeDefined()
    expect(edge?.from).toBe(from.id)
    expect(edge?.kind).toBe('sequential')
  })

  it('lists what this step leads to, and lets one go', async () => {
    const workflow = blueprint.workflows[0]!
    const outgoing = workflow.edges.find((edge) => edge.from === workflow.entryNodeId)
    expect(outgoing).toBeDefined()
    const user = userEvent.setup()
    const { latest } = panelFor(workflow, workflow.entryNodeId!)

    const to = workflow.nodes.find((node) => node.id === outgoing!.to)!
    expect(screen.getByRole('button', { name: `Disconnect ${to.label}` })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `Disconnect ${to.label}` }))
    expect(latest()?.edges.some((edge) => edge.id === outgoing!.id)).toBe(false)
  })

  it('does not offer a connection that already exists', () => {
    const workflow = blueprint.workflows[0]!
    const outgoing = workflow.edges.find((edge) => edge.from === workflow.entryNodeId)!
    const to = workflow.nodes.find((node) => node.id === outgoing.to)!
    panelFor(workflow, workflow.entryNodeId!)

    // The label appears in "Leads to"; what must not appear is a second way to draw the
    // same edge, which `connect` would refuse anyway and which reads as a broken button.
    expect(screen.queryByRole('button', { name: to.label, pressed: false })).not.toBeInTheDocument()
  })

  it('writes the verification method the picker is showing', async () => {
    const workflow = blueprint.workflows[0]!
    const step = workflow.nodes.find((node) => node.type === 'verification')
    expect(step).toBeDefined()
    const user = userEvent.setup()
    const { latest } = panelFor(
      // Cleared, so the panel is showing its default rather than a stored value.
      {
        ...workflow,
        nodes: workflow.nodes.map((n) =>
          n.id === step!.id ? { ...n, config: { contextInputs: [] } } : n,
        ),
      },
      step!.id,
    )

    const shown = within(screen.getByRole('combobox', { name: 'How it is verified' })).getByText(
      /command|tests|review|manual/,
    ).textContent

    await user.type(screen.getByLabelText('Command'), 'x')

    // Typing a command used to write "command" while the picker showed "tests", so the step
    // was saved as something the panel had never displayed.
    expect(
      (
        latest()?.nodes.find((n) => n.id === step!.id)?.config as {
          verification?: { method?: string }
        }
      )?.verification?.method,
    ).toBe(shown)
  })
})
