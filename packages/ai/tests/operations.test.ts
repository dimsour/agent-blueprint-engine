/**
 * The operations, replayed against what models actually said.
 *
 * Every recording holds at least one thing the model got wrong, because that is where the
 * work is: a colliding id, a reference to something it never wrote, an artifact missing a
 * required field, a finding about an artifact that does not exist. What the tests assert is
 * always the same two things — the good part survives, and the bad part is dropped with a
 * note rather than reaching the Blueprint.
 */
import {
  applyChangeSet,
  type Blueprint,
  createEmptyBlueprint,
  createEntity,
  findEntity,
  upsertEntity,
  validateBlueprint,
} from '@agent-blueprint/core'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  compound,
  createIronLawsFor,
  createWorkflowFor,
  evaluate,
  findContradictions,
  findMissing,
  generateArtifact,
  generateBlueprint,
  assembleChangeSet,
  improveArtifact,
  judgeRequirements,
  type OperationDeps,
} from '../src/index'
import { loadFixture, recording, replayClient } from './helpers'

let fixture: Blueprint

beforeAll(async () => {
  fixture = await loadFixture()
})

function depsFor(name: string, slice?: [number, number]): OperationDeps {
  const answers = recording(name)
  return { client: replayClient(slice ? answers.slice(...slice) : answers).client }
}

describe('generateBlueprint', () => {
  it('turns a draft into artifacts that apply cleanly to an empty Blueprint', async () => {
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const result = await generateBlueprint(
      depsFor('generate-blueprint'),
      { blueprint: empty },
      'A crew that reviews pull requests in a .NET codebase.',
    )

    const applied = applyChangeSet(empty, result.changeSet)
    expect(applied.rejected).toEqual([])
    expect(applied.blueprint.agents.map((agent) => agent.id)).toEqual(['reviewer', 'verifier'])
    expect(applied.blueprint.settings.primaryAgentId).toBe('reviewer')
    expect(applied.blueprint.name).toBe('PR Review Crew')
    // Nothing the model wrote may leave the Blueprint pointing at something that isn't there.
    expect(validateBlueprint(applied.blueprint).filter((d) => d.code === 'BP-REF-001')).toEqual([])
  })

  it('renames a colliding id and leaves references to the id that survived', async () => {
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const result = await generateBlueprint(
      depsFor('generate-blueprint'),
      { blueprint: empty },
      'A crew that reviews pull requests.',
    )
    const applied = applyChangeSet(empty, result.changeSet).blueprint

    // The model wrote two skills called "diff-reading"; the second one had to move.
    expect(applied.skills.map((skill) => skill.id)).toEqual(['diff-reading', 'diff-reading-2'])
    // …and its own references to "diff-reading" still mean the first one.
    const reviewer = findEntity(applied, 'agent', 'reviewer')!
    expect(reviewer.skillIds).toContain('diff-reading')
    expect(reviewer.skillIds).not.toContain('diff-reading-2')
  })

  it('drops what will not parse and says so, instead of failing the answer', async () => {
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const result = await generateBlueprint(
      depsFor('generate-blueprint'),
      { blueprint: empty },
      'A crew that reviews pull requests.',
    )

    // The rule had no guidance, which the schema requires.
    expect(result.notes.some((note) => note.startsWith('Dropped a proposed rule'))).toBe(true)
    expect(result.changeSet.ops.some((op) => 'kind' in op && op.kind === 'rule')).toBe(false)

    // The reviewer named a skill nobody wrote.
    expect(result.notes).toContain(
      'Removed a reference to skill:security-audit, which does not exist.',
    )
  })

  it('lays the steps out so a generated workflow opens as a graph, the same way every time', async () => {
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const once = await generateBlueprint(depsFor('generate-blueprint'), { blueprint: empty }, 'x')
    const twice = await generateBlueprint(depsFor('generate-blueprint'), { blueprint: empty }, 'x')

    const workflow = applyChangeSet(empty, once.changeSet).blueprint.workflows[0]!
    const positions = workflow.nodes.map((node) => node.position)
    expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(positions.length)
    // One column per step of the path, so the graph reads left to right on first open.
    const columnOf = (id: string) => workflow.nodes.find((node) => node.id === id)!.position.x
    expect([columnOf('start'), columnOf('read'), columnOf('verify'), columnOf('done')]).toEqual([
      0, 260, 520, 780,
    ])
    expect(JSON.stringify(twice.changeSet)).toBe(JSON.stringify(once.changeSet))
  })
})

describe('generateArtifact', () => {
  it('creates the artifact and wires it into the agent, without rewriting the agent', async () => {
    const result = await generateArtifact(
      depsFor('generate-artifact'),
      { blueprint: fixture },
      { kind: 'skill', brief: 'property-based testing' },
    )

    expect(result.changeSet.ops.map((op) => op.id)).toEqual([
      'create:skill:property-based-testing',
      'update:agent:testing-expert',
    ])
    const applied = applyChangeSet(fixture, result.changeSet).blueprint
    const agent = findEntity(applied, 'agent', 'testing-expert')!
    expect(agent.skillIds).toContain('property-based-testing')
    // Everything else about the agent is untouched: only the one list moved.
    const before = findEntity(fixture, 'agent', 'testing-expert')!
    expect({ ...agent, skillIds: before.skillIds }).toEqual(before)
  })

  it('wires into nothing when asked to', async () => {
    const result = await generateArtifact(
      depsFor('generate-artifact'),
      { blueprint: fixture },
      { kind: 'skill', brief: 'property-based testing', attachToAgentId: null },
    )
    expect(result.changeSet.ops).toHaveLength(1)
  })
})

describe('improveArtifact', () => {
  it('will not let the model move the artifact it was asked to improve', async () => {
    const result = await improveArtifact(
      depsFor('improve-artifact'),
      { blueprint: fixture, selection: { kind: 'skill', id: 'xunit' } },
      { action: 'add-verification' },
    )

    // The model answered with id "xunit-testing"; a rename here would read as a duplicate.
    expect(result.changeSet.ops).toHaveLength(1)
    const [op] = result.changeSet.ops
    expect(op!.type).toBe('update')
    expect(op!.id).toBe('update:skill:xunit')
    const applied = applyChangeSet(fixture, result.changeSet).blueprint
    expect(applied.skills.map((skill) => skill.id)).toEqual(fixture.skills.map((skill) => skill.id))
    expect(findEntity(applied, 'skill', 'xunit')!.body).toContain('dotnet test --filter')
  })

  it('refuses when nothing is selected', async () => {
    await expect(
      improveArtifact(depsFor('improve-artifact'), { blueprint: fixture }),
    ).rejects.toThrow(/selected/)
  })
})

describe('createWorkflowFor', () => {
  it('asks again with the validator’s own words when the graph does not hold together', async () => {
    const answers = recording('create-workflow')
    const { client, sent } = replayClient(answers)
    const result = await createWorkflowFor(
      { client },
      { blueprint: fixture, selection: { kind: 'agent', id: 'testing-expert' } },
      { brief: 'release the build' },
    )

    expect(sent).toHaveLength(2)
    // The second request repeats what the validator said, not a generic "try again".
    const request = sent[1]!.messages.find((message) => message.role === 'user')!
    expect(request.content).toContain('BP-WF-010')

    const applied = applyChangeSet(fixture, result.changeSet).blueprint
    const workflow = findEntity(applied, 'workflow', 'release-the-build')!
    expect(workflow.edges.map((edge) => edge.to)).toContain('done')
    expect(findEntity(applied, 'agent', 'testing-expert')!.workflowIds).toContain(
      'release-the-build',
    )
    expect(result.notes).toEqual([])
  })

  it('accepts a graph the validator is happy with, without a second attempt', async () => {
    const answers = recording('create-workflow')
    const { client, sent } = replayClient([answers[1]!])
    await createWorkflowFor({ client }, { blueprint: fixture }, { brief: 'release the build' })
    expect(sent).toHaveLength(1)
  })
})

describe('createIronLawsFor', () => {
  it('skips a law the Blueprint already has in other words', async () => {
    const result = await createIronLawsFor(
      depsFor('create-iron-laws'),
      { blueprint: fixture, selection: { kind: 'agent', id: 'testing-expert' } },
      {},
    )

    expect(result.notes[0]).toContain('never-fake-verification')
    expect(result.changeSet.ops.map((op) => op.id)).toEqual([
      'create:iron-law:no-skipped-tests-in-main',
      'update:agent:testing-expert',
    ])
    const applied = applyChangeSet(fixture, result.changeSet).blueprint
    expect(applied.ironLaws).toHaveLength(fixture.ironLaws.length + 1)
    expect(findEntity(applied, 'agent', 'testing-expert')!.ironLawIds).toContain(
      'no-skipped-tests-in-main',
    )
  })
})

describe('the reporting operations', () => {
  it('reports a contradiction and drops the one about a law that does not exist', async () => {
    const result = await findContradictions(depsFor('analysis', [0, 1]), { blueprint: fixture })

    expect(result.diagnostics).toHaveLength(1)
    const [finding] = result.diagnostics
    expect(finding!.code).toBe('BP-AI-CONTRA-001')
    expect(finding!.ref).toEqual({ kind: 'iron-law', id: 'no-implementation-details' })
    expect(finding!.related).toEqual([{ kind: 'skill', id: 'test-design' }])
    expect(finding!.data).toMatchObject({ source: 'ai' })
    expect(result.notes[0]).toContain('no-flaky-tests')
  })

  it('reports a gap, and proposes the artifact that would close it', async () => {
    const result = await findMissing(depsFor('analysis', [1, 2]), { blueprint: fixture })

    expect(result.diagnostics.map((finding) => finding.code)).toEqual(['BP-AI-MISSING-001'])
    expect(result.diagnostics[0]!.severity).toBe('warning')
    expect(result.notes[0]).toContain('agent:nobody')

    expect(result.proposals.changeSet.ops.map((op) => op.id)).toEqual([
      'create:gate:review-complete',
    ])
    const applied = applyChangeSet(fixture, result.proposals.changeSet)
    expect(applied.rejected).toEqual([])
  })

  it('reviews by dimension, keeping only the findings that point somewhere', async () => {
    const result = await evaluate(depsFor('analysis', [2, 3]), { blueprint: fixture })

    expect(result.report.dimensions.map((d) => d.dimension)).toEqual(['verification', 'ironLaws'])
    const verification = result.report.dimensions[0]!
    expect(verification.findings).toHaveLength(1)
    expect(verification.findings[0]!.ref).toEqual({ kind: 'workflow', id: 'write-tests' })
    expect(result.notes[0]).toContain('ghost-skill')
  })
})

describe('compound', () => {
  it('turns notes into artifacts, each carrying the evidence it came from', async () => {
    const result = await compound(
      depsFor('compound'),
      { blueprint: fixture },
      'We shipped a migration without a rollback and had to hotfix at 2am.',
    )

    expect(result.changeSet.source).toBe('compound')
    expect(result.changeSet.summary).toBe('Three things learned from the migration hotfix.')
    expect(result.changeSet.ops).toHaveLength(3)
    expect(result.changeSet.ops[0]!.note).toContain('2am')

    // The third proposal came with nothing behind it, which is worth saying.
    expect(result.notes.some((note) => note.includes('no evidence attached'))).toBe(true)

    const applied = applyChangeSet(fixture, result.changeSet)
    expect(applied.rejected).toEqual([])
    expect(validateBlueprint(applied.blueprint).filter((d) => d.severity === 'error')).toEqual([])
  })
})

describe('judgeRequirements', () => {
  /** The fixture has no `ai-judged` checks, so the test brings one that has two. */
  function withJudgedChecks(): Blueprint {
    return upsertEntity(fixture, 'requirement', {
      ...createEntity(fixture, 'requirement', { name: 'Explains itself', id: 'explains-itself' }),
      statement: 'The agent explains its reasoning before it acts.',
      checks: [
        { type: 'ai-judged', prompt: 'Does anything ask the agent to say why before acting?' },
        { type: 'ai-judged', prompt: 'Is the agent required to read what it claims?' },
      ],
    })
  }

  it('answers the checks the validator has to skip, and marks them as a model’s', async () => {
    const blueprint = withJudgedChecks()
    const result = await judgeRequirements(depsFor('judge-requirements'), { blueprint })

    // A check that passed is not news; only the failure becomes a finding.
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({
      code: 'BP-AI-REQ-001',
      severity: 'warning',
      ref: { kind: 'requirement', id: 'explains-itself' },
      data: { source: 'ai', status: 'fail', checkIndex: 0 },
    })
    expect(result.diagnostics[0]!.message).toContain('explains its reasoning')

    // Both verdicts are kept, for a view that shows checks rather than findings.
    expect(result.verdicts.map((entry) => entry.verdict.status)).toEqual(['fail', 'pass'])
    expect(result.notes[0]).toContain('a-requirement-that-is-not-there')
  })

  it('asks nothing when there is nothing only a model could answer', async () => {
    const { client, sent } = replayClient([])
    const result = await judgeRequirements({ client }, { blueprint: fixture })
    expect(sent).toEqual([])
    expect(result).toMatchObject({ diagnostics: [], verdicts: [] })
  })
})

describe('permissions a model invented', () => {
  /** The agent a local model wrote, with the two operations it made up. */
  function agentWithInventedPermissions() {
    return {
      id: 'reviewer-agent',
      name: 'Reviewer',
      role: 'reviewer',
      body: 'You review pull requests.',
      permissions: {
        operations: {
          'fs.read': 'allow',
          'git.fetch': 'allow',
          'git.checkout': 'allow',
          'git.push': 'deny',
        },
        patterns: [
          { operation: 'git.fetch', pattern: 'origin *', decision: 'allow' },
          { operation: 'fs.write', pattern: 'src/**', decision: 'ask' },
        ],
      },
    }
  }

  it('keeps the agent and drops only the operations that do not exist', () => {
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const { changeSet, notes } = assembleChangeSet({
      blueprint: empty,
      source: 'ai',
      id: 'ai:test',
      summary: 'One agent.',
      drafts: [{ kind: 'agent', value: agentWithInventedPermissions() }],
    })

    // The whole agent used to be dropped for this, taking the draft down with it.
    expect(changeSet.ops.map((op) => op.id)).toEqual(['create:agent:reviewer-agent'])
    const agent = applyChangeSet(empty, changeSet).blueprint.agents[0]!
    expect(agent.permissions.operations).toEqual({ 'fs.read': 'allow', 'git.push': 'deny' })
    expect(agent.permissions.patterns.map((entry) => entry.operation)).toEqual(['fs.write'])

    expect(notes).toContain(
      'Removed the permission "git.checkout", which is not an operation this model has.',
    )
    expect(notes).toContain(
      'Removed the permission "git.fetch", which is not an operation this model has.',
    )
  })

  it('does not let one invented permission take the whole draft with it', () => {
    // The cascade that produced "fifteen changes describing a system with nobody in it":
    // the agent was dropped, then the workflow's reference to it, then the primary agent.
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const { changeSet } = assembleChangeSet({
      blueprint: empty,
      source: 'ai',
      id: 'ai:test',
      summary: 'An agent and a workflow that needs it.',
      drafts: [
        { kind: 'agent', value: agentWithInventedPermissions() },
        {
          kind: 'workflow',
          value: {
            id: 'pr-review-workflow',
            name: 'Review a pull request',
            entryNodeId: 'start',
            nodes: [
              { id: 'start', type: 'start', label: 'Start' },
              { id: 'read', type: 'agent', label: 'Read', config: { agentId: 'reviewer-agent' } },
              { id: 'done', type: 'end', label: 'Done' },
            ],
            edges: [
              { id: 'e1', from: 'start', to: 'read' },
              { id: 'e2', from: 'read', to: 'done' },
            ],
          },
        },
      ],
      header: { settings: { ...empty.settings, primaryAgentId: 'reviewer-agent' } },
    })

    const applied = applyChangeSet(empty, changeSet).blueprint
    expect(applied.agents).toHaveLength(1)
    expect(applied.settings.primaryAgentId).toBe('reviewer-agent')
    // The workflow still points at the agent, because the agent still exists.
    const step = applied.workflows[0]!.nodes.find((node) => node.id === 'read')!
    expect(step.config.agentId).toBe('reviewer-agent')
  })
})
