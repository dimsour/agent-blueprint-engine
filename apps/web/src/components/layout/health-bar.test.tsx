/**
 * The health bar.
 *
 * Every number on the bar opens the findings behind it, so the test that matters is that
 * the numbers and the findings come from one report: a bar showing three zeroes beside a
 * score of 97 is worse than no bar, because it is read as an all-clear.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { evaluateBlueprint, healthSummary, validateBlueprint } from '@agent-blueprint/core'
import { portabilityProvider } from '@agent-blueprint/exporters'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HealthBar } from '@/components/layout/health-bar'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

async function load() {
  const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
  useWorkspace.getState().load('test', blueprint)
  await useWorkspace.getState().flushPending()
  return blueprint
}

function expected(blueprint: Parameters<typeof healthSummary>[0]) {
  const report = evaluateBlueprint(blueprint, {
    diagnostics: validateBlueprint(blueprint),
    portability: portabilityProvider(),
  })
  return healthSummary(blueprint, report)
}

describe('HealthBar', () => {
  beforeEach(() => useWorkspace.getState().close())

  it('shows the counts and the score the evaluator computes', async () => {
    const blueprint = await load()
    const summary = expected(blueprint)
    render(<HealthBar />)

    expect(screen.getByText(`${summary.artifacts} artifacts`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${summary.errors} errors` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${summary.warnings} warnings` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${summary.infos} suggestions` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Health ${summary.overall}` })).toBeInTheDocument()
  })

  it('opens exactly the findings a count stands for', async () => {
    const blueprint = await load()
    const summary = expected(blueprint)
    const user = userEvent.setup()
    render(<HealthBar />)

    const severity = summary.warnings > 0 ? 'warning' : 'info'
    const count = severity === 'warning' ? summary.warnings : summary.infos
    expect(count).toBeGreaterThan(0)

    await user.click(
      screen.getByRole('button', {
        name: `${count} ${severity === 'warning' ? 'warnings' : 'suggestions'}`,
      }),
    )

    const list = screen.getByRole('list', { name: `${severity} findings` })
    expect(within(list).getAllByRole('listitem')).toHaveLength(count)
  })

  it('says what each target does with this Blueprint, in words', async () => {
    const blueprint = await load()
    const summary = expected(blueprint)
    render(<HealthBar />)

    expect(summary.targets.length).toBeGreaterThan(0)
    for (const target of summary.targets) {
      // The status is part of the accessible name, so it does not live only in a colour.
      expect(
        screen.getByRole('button', { name: new RegExp(`^${target.harnessId}: `) }),
      ).toBeInTheDocument()
    }
  })

  it('scores nothing when no harness is chosen', async () => {
    const blueprint = await load()
    useWorkspace.getState().load('test', { ...blueprint, targets: [] })
    await useWorkspace.getState().flushPending()
    render(<HealthBar />)

    // A Blueprint that compiles nowhere used to score 100 for portability, which is the one
    // number that cannot be earned by having no targets at all.
    expect(screen.queryByRole('button', { name: /^claude-code: / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Health \d+$/ })).toBeInTheDocument()
  })
})
