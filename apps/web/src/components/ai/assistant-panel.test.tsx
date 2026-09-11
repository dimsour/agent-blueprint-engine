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
    expect(screen.getByText('Check the key in Settings.')).toBeInTheDocument()
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

/**
 * Adding a whole capability from inside a project (P9-15).
 *
 * Reported from use: the wizard can draft a Blueprint, and after that the assistant could only
 * write one artifact at a time. "A .NET review expert" is an agent, its skills and the laws it
 * works under, and asking for them separately leaves the wiring to the author.
 */
describe('Add a capability', () => {
  /** Enough kinds to prove it is not the one-artifact action wearing a different name. */
  const CAPABILITY = {
    summary: 'A .NET review expert with its skills and laws.',
    agents: [
      {
        id: 'review-expert',
        name: '.NET Review Expert',
        description: 'Reviews .NET changes before they merge.',
        role: 'reviewer',
        responsibilities: ['Review .NET changes and report what is wrong with them'],
        outputRequirements: ['One comment per finding, naming file and line'],
        skillIds: ['reviewing-dotnet'],
        ironLawIds: ['no-unreviewed-merge'],
        body: 'You review .NET changes. You do not approve what you have not read.',
      },
    ],
    skills: [
      {
        id: 'reviewing-dotnet',
        name: 'Reviewing .NET code',
        description: 'Reviewing a C# change against the project laws.',
        whenToUse: 'When a C# change has to be reviewed.',
        activation: { filePatterns: ['**/*.cs'] },
        body: '## Instructions\n\n1. List the changed files.\n2. Read each hunk.\n\n## Verification\n\nEvery comment names a file and a line in the diff.',
      },
    ],
    ironLaws: [
      {
        id: 'no-unreviewed-merge',
        name: 'Never merge unreviewed',
        description: 'Nothing merges unread.',
        rule: 'Never merge a change nobody has read.',
        rationale: 'A merge is a claim that someone checked it.',
        examples: ['Read all four hunks, then approved.'],
        counterexamples: ['Green, so merged without reading.'],
        severity: 'critical',
        category: 'code-quality',
        enforcement: ['instruction'],
        violationBehavior: 'Stop and read the change first.',
      },
    ],
  }

  it('proposes artifacts of several kinds at once, wired together', async () => {
    configure()
    const before = await loadFixture()
    endpointAnswers(CAPABILITY)
    const user = userEvent.setup()
    render(<AssistantPanel open onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Add a capability' }))
    await user.type(
      screen.getByLabelText('What the capability is'),
      'A .NET review expert that checks changes against our Iron Laws.',
    )
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    const list = await screen.findByRole('list', { name: 'Proposed changes' })
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(2)

    await user.click(screen.getByRole('button', { name: /^Apply/ }))
    const after = useWorkspace.getState().blueprint!

    expect(after.agents).toHaveLength(before.agents.length + 1)
    expect(after.skills).toHaveLength(before.skills.length + 1)
    expect(after.ironLaws).toHaveLength(before.ironLaws.length + 1)
    // Wired, not a pile of parts: the new agent holds what came with it.
    const agent = after.agents.find((candidate) => candidate.id === 'review-expert')!
    expect(agent.skillIds).toContain('reviewing-dotnet')
    expect(agent.ironLawIds).toContain('no-unreviewed-merge')
  })

  it('leaves the project itself alone', async () => {
    configure()
    const before = await loadFixture()
    endpointAnswers(CAPABILITY)
    const user = userEvent.setup()
    render(<AssistantPanel open onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Add a capability' }))
    await user.type(screen.getByLabelText('What the capability is'), 'A .NET review expert.')
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await screen.findByRole('list', { name: 'Proposed changes' })
    await user.click(screen.getByRole('button', { name: /^Apply/ }))

    // The distinction from "Draft the whole Blueprint", which names the project and picks its
    // primary agent. Adding to a project must not rename it.
    const after = useWorkspace.getState().blueprint!
    expect(after.name).toBe(before.name)
    expect(after.settings.primaryAgentId).toBe(before.settings.primaryAgentId)
  })
})
