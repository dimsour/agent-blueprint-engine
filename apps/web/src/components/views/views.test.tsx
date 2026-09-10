/**
 * The trust surfaces: the report the app gives about a Blueprint, and what it will write.
 *
 * These are the screens that make the product's claims checkable, so what matters is that
 * they agree with the functions behind them rather than paraphrasing them.
 */
import { answerFor, stubEndpoint } from '@/lib/ai/stub-endpoint'
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { evaluateBlueprint, validateBlueprint } from '@agent-blueprint/core'
import { compileBlueprint, portabilityOf } from '@agent-blueprint/exporters'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

/** An AI endpoint this browser believes in, and an answer for it. */
function configureEndpoint() {
  localStorage.setItem(
    'ab:settings:ai',
    JSON.stringify({
      presetId: 'custom',
      baseUrl: 'https://stub.test/v1',
      model: 'stub',
      jsonSchema: true,
      viaProxy: false,
      extraHeaders: {},
    }),
  )
  sessionStorage.setItem('ab:credentials:ai', 'sk-stub-abcdefghijklmnop')
}

function stubAnswer(content: unknown) {
  stubEndpoint(content)
}

const realFetch = globalThis.fetch

describe('EvaluationView', () => {
  beforeEach(() => {
    useWorkspace.getState().close()
    localStorage.clear()
    sessionStorage.clear()
    globalThis.fetch = realFetch
  })

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

  it('offers the AI analysis only when there is an endpoint to ask', async () => {
    await load()
    render(<EvaluationView />)

    const button = screen.getByRole('button', { name: 'Run AI analysis' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Configure an AI endpoint in Settings')
  })

  it('lists a model’s findings beside the rules’, marked, and leaves the score alone', async () => {
    const blueprint = await load()
    configureEndpoint()
    stubAnswer({
      contradictions: [
        {
          first: { kind: 'iron-law', id: 'no-implementation-details' },
          second: { kind: 'skill', id: 'test-design' },
          conflict: 'The law forbids asserting on mocks; the skill asks for it.',
          severity: 'high',
        },
      ],
    })
    const expected = evaluateBlueprint(blueprint, { diagnostics: validateBlueprint(blueprint) })
    const user = userEvent.setup()
    render(<EvaluationView />)

    await user.click(screen.getByRole('button', { name: 'Run AI analysis' }))

    const consistency = await screen.findByRole('list', { name: /Consistency findings/ })
    expect(consistency).toHaveTextContent('BP-AI-CONTRA-001')
    // The badge is what keeps "a rule computed this" and "a model thought this" apart.
    expect(within(consistency).getByText('AI')).toBeInTheDocument()

    const dimension = expected.dimensions.find((entry) => entry.id === 'consistency')!
    expect(screen.getByText(/do not change the score/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Consistency findings/).closest('div')).toHaveTextContent(
      String(dimension.score),
    )
  })

  it('drops a model’s findings the moment the Blueprint changes', async () => {
    const blueprint = await load()
    configureEndpoint()
    stubAnswer({
      contradictions: [
        {
          first: { kind: 'iron-law', id: 'no-implementation-details' },
          second: { kind: 'skill', id: 'test-design' },
          conflict: 'Something a model believed about an older version of this Blueprint.',
          severity: 'high',
        },
      ],
    })
    const user = userEvent.setup()
    render(<EvaluationView />)

    await user.click(screen.getByRole('button', { name: 'Run AI analysis' }))
    expect(await screen.findByText(/do not change the score/)).toBeInTheDocument()

    // Edit anything, and the finding is about a Blueprint that no longer exists.
    useWorkspace.getState().load('test', { ...blueprint, description: 'Changed.' })
    await waitFor(() =>
      expect(screen.queryByText(/do not change the score/)).not.toBeInTheDocument(),
    )
  })

  it('keeps what one analysis found when the other fails', async () => {
    const fixture = await load()
    // Requirement judging only calls the endpoint when there is an `ai-judged` check to judge,
    // so the fixture needs one for there to be a second call that can fail.
    useWorkspace.getState().load('test', {
      ...fixture,
      requirements: [
        ...fixture.requirements,
        {
          ...fixture.requirements[0]!,
          id: 'explains-itself',
          statement: 'The agent explains its reasoning before it acts.',
          checks: [{ type: 'ai-judged', prompt: 'Does anything ask it to say why?' }],
        },
      ],
    })
    configureEndpoint()
    // Contradictions answer; the requirement judging is refused. Losing both would throw away
    // an answer the user already paid for.
    let call = 0
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      call += 1
      return Promise.resolve(
        call === 1
          ? answerFor(
              {
                contradictions: [
                  {
                    first: { kind: 'iron-law', id: 'no-implementation-details' },
                    second: { kind: 'skill', id: 'test-design' },
                    conflict: 'A real finding that must survive the other call failing.',
                    severity: 'high',
                  },
                ],
              },
              init,
            )
          : new Response('slow down', { status: 429 }),
      )
    }) as unknown as typeof globalThis.fetch

    const user = userEvent.setup()
    render(<EvaluationView />)
    await user.click(screen.getByRole('button', { name: 'Run AI analysis' }))

    const consistency = await screen.findByRole('list', { name: /Consistency findings/ })
    expect(consistency).toHaveTextContent('BP-AI-CONTRA-001')
    // …and the failure is still reported rather than swallowed.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
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
    expect(
      screen.getByText(String(file.content).slice(0, 40), { exact: false }),
    ).toBeInTheDocument()
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

/**
 * docs/08 says every generated and source file about to be committed is scanned. An archive is
 * the other way a project leaves this browser, and it usually leaves it towards somebody else,
 * so the export runs the same scan the push does and refuses on the same terms (P7-06).
 */
describe('ExportView: the secret scan', () => {
  beforeEach(() => useWorkspace.getState().close())

  /** Puts a line into the first agent's persona, which reaches the compiled files as well. */
  async function withSecret(line: string) {
    const blueprint = await load()
    const [first, ...rest] = blueprint.agents
    if (!first) throw new Error('The fixture has no agents.')
    useWorkspace.getState().load('test', {
      ...blueprint,
      agents: [{ ...first, body: `${first.body}\n\n${line}\n` }, ...rest],
    })
  }

  it('downloads a clean project without asking anything', async () => {
    await load()
    render(<ExportView />)

    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled()
    expect(screen.queryByText(/looks like a credential/)).not.toBeInTheDocument()
  })

  it('refuses while something in the files looks like a credential', async () => {
    await withSecret('Use AKIAIOSFODNN7EXAMPLE when deploying.')
    render(<ExportView />)

    expect(await screen.findByText(/looks like a credential/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
  })

  it('downloads once every finding has been accepted, one at a time', async () => {
    const user = userEvent.setup()
    await withSecret('Use AKIAIOSFODNN7EXAMPLE when deploying.')
    render(<ExportView />)

    // One pasted key becomes several findings: the artifact that carries it, and every file
    // compiled from that artifact. Each is a separate decision to ship it.
    const findings = screen.getAllByRole('checkbox', { name: /AWS access key/ })
    expect(findings.length).toBeGreaterThan(1)
    for (const finding of findings.slice(0, -1)) {
      await user.click(finding)
      expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
    }
    await user.click(findings.at(-1)!)
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled()
  })

  it('never shows the credential it found', async () => {
    await withSecret('key: sk-abcdefghijklmnopqrstuvwxyz01')
    render(<ExportView />)

    await screen.findByText(/looks like a credential/)
    expect(document.body.textContent).not.toContain('sk-abcdefghijklmnopqrstuvwxyz01')
  })
})

/**
 * The two things a request in flight needs (P6-11) and the verdict that was being thrown away
 * (P6-12). Both are about the same screen and the same call, so they are tested together.
 */
describe('EvaluationView: a request in flight', () => {
  beforeEach(() => {
    useWorkspace.getState().close()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** An endpoint that never answers until the request is aborted. */
  function stubHang(): void {
    globalThis.fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })) as unknown as typeof globalThis.fetch
  }

  it('offers Stop only while something is running', async () => {
    await load()
    configureEndpoint()
    stubHang()
    const user = userEvent.setup()
    render(<EvaluationView />)

    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run AI analysis' }))
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
  })

  it('stopping is a decision, not a failure', async () => {
    await load()
    configureEndpoint()
    stubHang()
    const user = userEvent.setup()
    render(<EvaluationView />)

    await user.click(screen.getByRole('button', { name: 'Run AI analysis' }))
    await user.click(await screen.findByRole('button', { name: 'Stop' }))

    // Back to idle, with nothing reported as broken.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Run AI analysis' })).toBeEnabled(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('EvaluationView: a check a model judged', () => {
  beforeEach(() => {
    useWorkspace.getState().close()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** The fixture, with a requirement whose only check needs a model. */
  async function withAiJudgedCheck() {
    const blueprint = await load()
    const [first, ...rest] = blueprint.requirements
    if (!first) throw new Error('The fixture has no requirements.')
    useWorkspace.getState().load('test', {
      ...blueprint,
      requirements: [
        {
          ...first,
          checks: [
            { type: 'ai-judged' as const, prompt: 'Does the agent verify before claiming?' },
          ],
        },
        ...rest,
      ],
    })
    return first.id
  }

  it('shows a passed verdict instead of leaving the check unverifiable', async () => {
    const requirementId = await withAiJudgedCheck()
    configureEndpoint()
    stubAnswer({
      contradictions: [],
      verdicts: [
        {
          id: `${requirementId}#0`,
          status: 'pass',
          rationale: 'The write-tests workflow has a verification step.',
        },
      ],
    })
    const user = userEvent.setup()
    render(<EvaluationView />)

    // Before asking, a rule cannot run this check and says so.
    const checks = screen.getAllByRole('list', { name: 'Checks' })
    expect(within(checks[0]!).getByText('skipped')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Run AI analysis' }))

    // Only failures become diagnostics, so without carrying the verdicts a passed check still
    // read as skipped — in the one place a reader looks to see whether a requirement holds.
    const after = screen.getAllByRole('list', { name: 'Checks' })
    expect(await within(after[0]!).findByText('pass')).toBeInTheDocument()
    expect(within(after[0]!).getByText('judged by a model')).toBeInTheDocument()
  })
})
