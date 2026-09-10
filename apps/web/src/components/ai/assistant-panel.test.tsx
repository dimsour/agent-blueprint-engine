/**
 * The assistant panel.
 *
 * Three things are worth holding still here: it offers what the current selection makes sense
 * for and explains the rest, nothing it produces reaches the Blueprint without passing through
 * the review, and a failure says what happened instead of leaving a spinner behind.
 */
import { stubEndpoint } from '@/lib/ai/stub-endpoint'
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AssistantPanel } from '@/components/ai/assistant-panel'
import { AI_SETTINGS_KEY } from '@/lib/ai/settings'
import { CREDENTIAL_KEYS } from '@/lib/credentials'
import { parseProject } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const realFetch = globalThis.fetch

/** What the model says when asked to turn notes into knowledge: three proposals. */
const COMPOUND_ANSWER = {
  summary: 'Three things learned from the migration hotfix.',
  proposals: [
    {
      kind: 'iron-law',
      artifact: {
        id: 'migrations-need-a-way-back',
        name: 'Every migration has a way back',
        rule: 'Never merge a schema migration without a tested rollback in the same change.',
        category: 'data',
        severity: 'critical',
      },
      note: 'From the note about the 2am hotfix.',
    },
    {
      kind: 'skill',
      artifact: {
        id: 'writing-a-rollback',
        name: 'Writing a rollback',
        whenToUse: 'When a change includes a schema migration.',
        body: 'Write the down migration first and run it against a copy of production data.',
      },
      note: 'Nobody knew how to reverse the change.',
    },
    {
      kind: 'rule',
      artifact: {
        id: 'deploy-on-a-weekday',
        name: 'Deploy on a weekday',
        guidance: 'Prefer deploying schema changes between Monday and Thursday.',
        category: 'process',
      },
    },
  ],
}

function endpointAnswers(content: unknown) {
  stubEndpoint(content)
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

describe('AssistantPanel', () => {
  it('sends you to Settings rather than to an endpoint that does not exist', async () => {
    await loadFixture()
    render(<AssistantPanel open onOpenChange={() => {}} />)

    expect(screen.getByText('No AI endpoint yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Set one up/ })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('button', { name: 'Improve' })).not.toBeInTheDocument()
  })

  it('offers what the selection makes sense for, and explains the rest', async () => {
    configure()
    await loadFixture()
    render(<AssistantPanel open onOpenChange={() => {}} />)

    // Nothing selected: the artifact actions are visible, disabled, and say what to do.
    const improve = screen.getByRole('button', { name: 'Add verification' })
    expect(improve).toBeDisabled()
    expect(improve).toHaveAttribute('title', 'Select an artifact first')
    expect(screen.getByRole('button', { name: 'Draft the whole Blueprint' })).toBeEnabled()

    useWorkspace.getState().select({ kind: 'skill', id: 'xunit' })
    expect(await screen.findByRole('button', { name: 'Add verification' })).toBeEnabled()
    // A workflow still needs an agent, and says so even with a skill selected.
    expect(screen.getByRole('button', { name: 'A workflow for this agent' })).toBeDisabled()
  })

  it('applies the proposals that were accepted, and only those', async () => {
    configure()
    const before = await loadFixture()
    endpointAnswers(COMPOUND_ANSWER)
    const user = userEvent.setup()
    render(<AssistantPanel open onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Turn this into reusable knowledge' }))
    await user.type(
      screen.getByLabelText('What happened'),
      'We shipped a migration without a rollback and had to hotfix at 2am.',
    )
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    const list = await screen.findByRole('list', { name: 'Proposed changes' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)

    await user.click(screen.getByRole('checkbox', { name: 'Reject Deploy on a weekday' }))
    await user.click(screen.getByRole('button', { name: 'Apply 2 changes' }))

    const after = useWorkspace.getState().blueprint!
    expect(after.ironLaws).toHaveLength(before.ironLaws.length + 1)
    expect(after.skills).toHaveLength(before.skills.length + 1)
    expect(after.rules).toHaveLength(before.rules.length)
    expect(after.rules.some((rule) => rule.id === 'deploy-on-a-weekday')).toBe(false)
  })

  it('says what went wrong and leaves the Blueprint alone', async () => {
    configure()
    const before = await loadFixture()
    globalThis.fetch = (() =>
      Promise.resolve(new Response('nope', { status: 401 }))) as unknown as typeof globalThis.fetch
    const user = userEvent.setup()
    render(<AssistantPanel open onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Find contradictions' }))
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('rejected the key')
    expect(screen.getByText(/Nothing was changed/)).toBeInTheDocument()
    expect(useWorkspace.getState().blueprint).toEqual(before)
  })

  it('shows a model’s findings as findings, marked as the model’s', async () => {
    configure()
    await loadFixture()
    endpointAnswers({
      contradictions: [
        {
          first: { kind: 'iron-law', id: 'no-implementation-details' },
          second: { kind: 'skill', id: 'test-design' },
          conflict: 'The law forbids asserting on mocks; the skill asks for it.',
          severity: 'high',
        },
      ],
    })
    const user = userEvent.setup()
    render(<AssistantPanel open onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Find contradictions' }))
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    const findings = await screen.findByRole('list', { name: 'AI findings' })
    expect(findings).toHaveTextContent('BP-AI-CONTRA-001')
    expect(within(findings).getByText('AI')).toBeInTheDocument()

    // Both sides of the contradiction are reachable from the finding.
    await user.click(within(findings).getByRole('button', { name: 'Skill: test-design' }))
    expect(useWorkspace.getState().selection).toEqual({ kind: 'skill', id: 'test-design' })
  })
})
