/**
 * Fixing one finding with a model (P9-12).
 *
 * The two things worth holding still: what comes back reaches the review rather than the
 * Blueprint, and the instructions the model was given are the same ones the user is shown —
 * because a proposal you cannot judge against the ask is a proposal you have to take on faith.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FixFindingDialog } from '@/components/ai/fix-finding-dialog'
import { AI_SETTINGS_KEY } from '@/lib/ai/settings'
import { answerFor, stubEndpoint } from '@/lib/ai/stub-endpoint'
import { CREDENTIAL_KEYS } from '@/lib/credentials'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const realFetch = globalThis.fetch

const MISSING_DESCRIPTION = {
  code: 'BP-DESC-001',
  severity: 'warning' as const,
  message: 'Skill "xunit" has no description.',
  ref: { kind: 'skill' as const, id: 'xunit' },
}

/** The model's answer: the artifact back with the description filled in. */
const ANSWER = {
  artifacts: [
    {
      kind: 'skill',
      artifact: {
        id: 'xunit',
        name: 'xUnit',
        description: 'Write idiomatic xUnit tests - facts, theories, fixtures and async patterns.',
        whenToUse: 'When writing or changing tests in a .NET project.',
        body: '## Instructions\n\nOne assertion per behaviour.',
      },
      note: 'Restored the description the finding said was missing.',
    },
  ],
  note: 'Added a one-line description so the harness can choose this skill.',
}

function configure() {
  localStorage.setItem(
    AI_SETTINGS_KEY,
    JSON.stringify({
      presetId: 'custom',
      baseUrl: 'https://stub.test/v1',
      model: 'stub',
      jsonSchema: true,
      viaProxy: false,
      extraHeaders: {},
    }),
  )
  sessionStorage.setItem(CREDENTIAL_KEYS.ai, 'sk-stub-abcdefghijklmnop')
}

async function loadFixture() {
  const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
  useWorkspace.getState().load('test', blueprint)
  return blueprint
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useWorkspace.getState().close()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('FixFindingDialog', () => {
  it('sends you to Settings rather than to an endpoint that does not exist', async () => {
    await loadFixture()
    render(<FixFindingDialog diagnostic={MISSING_DESCRIPTION} open onOpenChange={() => {}} />)

    expect(screen.getByText('No AI endpoint yet')).toBeVisible()
    expect(screen.getByRole('link', { name: /Set one up/ })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('button', { name: 'Fix it' })).toBeNull()
  })

  it('shows the instructions the model is given, so the answer can be judged', async () => {
    configure()
    await loadFixture()
    render(<FixFindingDialog diagnostic={MISSING_DESCRIPTION} open onOpenChange={() => {}} />)

    // Verbatim from the catalogue's `remedy` — the same sentence the "How to fix" note shows.
    expect(
      screen.getByText(/every harness chooses which skill to activate/, { exact: false }),
    ).toBeVisible()
  })

  it('puts what came back through the review instead of applying it', async () => {
    const user = userEvent.setup()
    configure()
    const blueprint = await loadFixture()
    stubEndpoint(ANSWER)

    render(<FixFindingDialog diagnostic={MISSING_DESCRIPTION} open onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Fix it' }))

    // The review is open and the Blueprint is untouched until something is accepted.
    expect(await screen.findByRole('button', { name: /Apply/ })).toBeVisible()
    expect(useWorkspace.getState().blueprint).toBe(blueprint)

    await user.click(screen.getByRole('button', { name: /Apply/ }))
    const applied = useWorkspace.getState().blueprint
    expect(applied).not.toBe(blueprint)
    expect(applied?.skills.find((skill) => skill.id === 'xunit')?.description).toContain('xUnit')
    // And it edited the artifact rather than adding a second one.
    expect(applied?.skills).toHaveLength(blueprint.skills.length)
  })

  it('says what failed instead of leaving a spinner behind', async () => {
    const user = userEvent.setup()
    configure()
    await loadFixture()
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Invalid API key.' } }), { status: 401 }),
      )) as unknown as typeof globalThis.fetch

    render(<FixFindingDialog diagnostic={MISSING_DESCRIPTION} open onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Fix it' }))

    expect(await screen.findByRole('alert')).toBeVisible()
    // A 401 is an auth failure, and the hint names the control that fixes it rather than
    // the generic reassurance every failure used to get (P9-16).
    expect(screen.getByText('Check the key in Settings.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Fix it' })).toBeEnabled()
  })
})

describe('feeding the model more than the catalogue knows (P9-13)', () => {
  it('sends what the user adds, so a finding it read wrong can be corrected', async () => {
    const user = userEvent.setup()
    configure()
    await loadFixture()
    const sent: string[] = []
    // Through the same stub the other tests use, so the request is answered in the shape it
    // was asked for; this one only keeps a copy of what went out.
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      sent.push(String(init?.body ?? ''))
      return Promise.resolve(answerFor(ANSWER, init))
    }) as unknown as typeof globalThis.fetch

    render(<FixFindingDialog diagnostic={MISSING_DESCRIPTION} open onOpenChange={() => {}} />)
    await user.type(
      screen.getByLabelText('Anything else it should know'),
      'It is about xUnit v3 specifically.',
    )
    await user.click(screen.getByRole('button', { name: 'Fix it' }))
    await screen.findByRole('button', { name: /Apply/ })

    expect(sent.join('\n')).toContain('xUnit v3 specifically')
  })

  it('says whether the fix actually clears the finding', async () => {
    const user = userEvent.setup()
    configure()
    await loadFixture()
    stubEndpoint(ANSWER)

    render(<FixFindingDialog diagnostic={MISSING_DESCRIPTION} open onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Fix it' }))
    await screen.findByRole('button', { name: /Apply/ })

    // Checked against the validator before the user is shown it, not asserted.
    expect(screen.getByText(/clears BP-DESC-001/)).toBeVisible()
  })
})
