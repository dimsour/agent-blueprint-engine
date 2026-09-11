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
  isKnownDiagnosticCode,
  createEmptyBlueprint,
  createEntity,
  findEntity,
  upsertEntity,
  validateBlueprint,
  DIAGNOSTIC_CODES,
} from '@agent-blueprint/core'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  addCapability,
  compound,
  createIronLawsFor,
  createWorkflowFor,
  evaluate,
  findContradictions,
  findMissing,
  fixabilityOf,
  fixFinding,
  fixFindings,
  invariantFor,
  generateArtifact,
  generateBlueprint,
  assembleChangeSet,
  improveArtifact,
  judgeRequirements,
  AI_DIAGNOSTIC_CODES,
  houseStyleFor,
  HOUSE_STYLE_CODES,
  PROMPTS,
  type PromptId,
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

/**
 * The same recorded answer, twice.
 *
 * `generateBlueprint` checks its own draft and asks again when the validator finds something
 * (P9-14), and the recording is a real model answer that does not pass — which is the whole
 * reason the check exists. Answering identically twice means the second attempt is no better
 * than the first, so the first is kept and these tests still measure the assembler.
 */
function depsRepeating(name: string): OperationDeps {
  const answers = recording(name)
  return { client: replayClient([...answers, ...answers]).client }
}

describe('generateBlueprint', () => {
  it('turns a draft into artifacts that apply cleanly to an empty Blueprint', async () => {
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const result = await generateBlueprint(
      depsRepeating('generate-blueprint'),
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
      depsRepeating('generate-blueprint'),
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
      depsRepeating('generate-blueprint'),
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
    const once = await generateBlueprint(
      depsRepeating('generate-blueprint'),
      { blueprint: empty },
      'x',
    )
    const twice = await generateBlueprint(
      depsRepeating('generate-blueprint'),
      { blueprint: empty },
      'x',
    )

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
  /** An agent a live model wrote, with the two permission operations it made up. */
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

/**
 * Fixing one finding.
 *
 * The interesting part is not the prompt but the refusals: the codes it declines, the id it
 * will not let a model change, and the case where it cannot tell which artifact was meant.
 */
describe('fixFinding', () => {
  const missingDescription = {
    code: 'BP-DESC-001',
    severity: 'warning' as const,
    message: 'Skill "xunit" has no description.',
    ref: { kind: 'skill' as const, id: 'xunit' },
  }

  it('clears the finding without letting the model rename what it fixed', async () => {
    // Blanked so the recorded answer's description is a real change: a fix may only touch the
    // fields its code is about (P9-18), and a description returned unchanged changes nothing.
    const blueprint = {
      ...fixture,
      skills: fixture.skills.map((skill) =>
        skill.id === 'xunit' ? { ...skill, description: '' } : skill,
      ),
    }
    const result = await fixFinding(
      depsFor('fix-finding', [0, 1]),
      { blueprint },
      {
        diagnostic: missingDescription,
      },
    )

    // The model answered with id "xunit-testing". A rename here would be a create op beside
    // the untouched original, which reads as a duplicate rather than as the fix.
    expect(result.changeSet.ops).toHaveLength(1)
    expect(result.changeSet.ops[0]!.id).toBe('update:skill:xunit')

    const applied = applyChangeSet(blueprint, result.changeSet)
    expect(applied.rejected).toEqual([])
    expect(applied.blueprint.skills.map((skill) => skill.id)).toEqual(
      fixture.skills.map((skill) => skill.id),
    )
    expect(findEntity(applied.blueprint, 'skill', 'xunit')!.description).not.toBe('')
  })

  it('writes the artifact a Blueprint-level finding asks for', async () => {
    const withoutLaws = { ...fixture, ironLaws: [] }
    const result = await fixFinding(
      depsFor('fix-finding', [1, 2]),
      { blueprint: withoutLaws },
      {
        diagnostic: {
          code: 'BP-SAFETY-003',
          severity: 'info',
          message: 'No Iron Law covers security.',
        },
      },
    )

    const applied = applyChangeSet(withoutLaws, result.changeSet)
    expect(applied.rejected).toEqual([])
    expect(applied.blueprint.ironLaws.map((law) => law.category)).toContain('security')
  })

  it('assumes nothing when two artifacts of the kind come back for one finding', async () => {
    const result = await fixFinding(
      depsFor('fix-finding', [2, 3]),
      { blueprint: fixture },
      {
        diagnostic: missingDescription,
      },
    )

    // Neither is "xunit": with two, picking one would overwrite an artifact silently.
    expect(result.changeSet.ops.every((op) => op.type === 'create')).toBe(true)
    expect(result.notes.join(' ')).toMatch(/returned 2 new skill artifacts/)
  })

  it('refuses the codes no artifact edit can clear, and says what does', async () => {
    await expect(
      fixFinding(
        depsFor('fix-finding', [0, 1]),
        { blueprint: fixture },
        {
          diagnostic: {
            code: 'BP-ID-002',
            severity: 'error',
            message: 'Skill id "xUnit Testing" is not a slug.',
            ref: { kind: 'skill', id: 'xUnit Testing' },
          },
        },
      ),
    ).rejects.toThrow(/Rename in the inspector/)
  })

  it('narrows what a fix may write to the kinds the finding is about', () => {
    expect(fixabilityOf(missingDescription)).toEqual({ fixable: true, kinds: ['skill'] })
    // An orphan is usually attached to an agent rather than changed itself.
    expect(
      fixabilityOf({
        code: 'BP-ORPHAN-001',
        severity: 'warning',
        message: 'Nothing uses skill "xunit".',
        ref: { kind: 'skill', id: 'xunit' },
      }),
    ).toEqual({ fixable: true, kinds: ['skill', 'agent'] })
    expect(
      fixabilityOf({ code: 'BP-PROJECT-004', severity: 'warning', message: 'A stray file.' }),
    ).toEqual({ fixable: false, reason: 'Saving the project is the fix.' })
  })

  it('has guidance to send for every code the product can show', () => {
    // The prompt is the catalogue's `remedy`. A code without one would be asked to fix a
    // finding with no instructions, which is the model guessing.
    for (const entry of [...DIAGNOSTIC_CODES, ...AI_DIAGNOSTIC_CODES]) {
      expect(entry.remedy.length, entry.code).toBeGreaterThan(40)
    }
  })
})

/**
 * Checking the fix before the user sees it (P9-13).
 *
 * "The AI fix does not always work" has an answer the product can give itself: apply the
 * proposal to a throwaway Blueprint, run the same rules the IDE runs, and see whether the
 * finding is still there. If it is, ask again with the validator's own words. If it still is,
 * say so in the review rather than letting the user find out after applying.
 */
describe('fixFinding, checked against the validator', () => {
  /** A real finding, not a synthetic one: the rule has to be able to raise it again. */
  function withoutDescription(): Blueprint {
    return {
      ...fixture,
      skills: fixture.skills.map((skill) =>
        skill.id === 'test-design' ? { ...skill, description: '' } : skill,
      ),
    }
  }

  const finding = {
    code: 'BP-DESC-001',
    severity: 'warning' as const,
    message: 'Skill "test-design" has no description.',
    ref: { kind: 'skill' as const, id: 'test-design' },
  }

  it('asks again when the first attempt leaves the finding standing', async () => {
    const blueprint = withoutDescription()
    const result = await fixFinding(
      depsFor('fix-finding', [3, 5]),
      { blueprint },
      {
        diagnostic: finding,
      },
    )

    // The recording's first answer omits the description; the second supplies it. Keeping the
    // first would have handed the user a diff that changes nothing the finding was about.
    const applied = applyChangeSet(blueprint, result.changeSet).blueprint
    expect(findEntity(applied, 'skill', 'test-design')!.description).not.toBe('')
    expect(validateBlueprint(applied).map((found) => found.code)).not.toContain('BP-DESC-001')
    expect(result.notes.join(' ')).toContain('applying this clears BP-DESC-001')
  })

  it('says so when the fix changes something and still does not close the finding', async () => {
    // A body that gains an Instructions section but never the Verification one the finding
    // asked for: a real change, and not the change that was asked for.
    const halfDone = JSON.stringify({
      artifacts: [
        {
          kind: 'skill',
          artifact: {
            id: 'test-design',
            name: 'Test design',
            body: '## Instructions\n\nName the test for the behaviour, not the method.',
          },
        },
      ],
      note: 'Tidied the instructions.',
    })
    const result = await fixFinding(
      { client: replayClient([halfDone, halfDone]).client },
      { blueprint: fixture },
      {
        diagnostic: {
          code: 'BP-SKILL-011',
          severity: 'info',
          message: 'Skill "Test design" has no Verification section.',
          ref: { kind: 'skill', id: 'test-design' },
        },
      },
    )

    expect(result.changeSet.ops).toHaveLength(1)
    expect(result.notes.join(' ')).toContain('Still raised after this change: BP-SKILL-011')
  })

  it('does not claim to have checked a code the validator cannot raise', async () => {
    const withoutLaws = { ...fixture, ironLaws: [] }
    const result = await fixFinding(
      depsFor('fix-finding', [1, 2]),
      { blueprint: withoutLaws },
      {
        diagnostic: {
          code: 'BP-SAFETY-003',
          severity: 'info',
          message: 'No Iron Law covers security.',
        },
      },
    )

    // BP-SAFETY-003 comes from the evaluation pass, so re-running the validator proves
    // nothing about it. Saying "cleared" would be a lie by omission.
    expect(result.notes.join(' ')).toContain(
      'come from the quality review rather than the validator',
    )
    expect(result.notes.join(' ')).not.toContain('clears BP-SAFETY-003')
  })
})

describe('what the model is told about a finding', () => {
  it('sends the invariant, the evidence, the fields and the artifact itself', async () => {
    // An empty answer: the prompt is built in full, and with no ops there is no second
    // attempt to consume an answer this test does not have.
    const client = replayClient([JSON.stringify({ artifacts: [], note: 'Nothing to change.' })])
    await fixFinding(
      { client: client.client },
      { blueprint: fixture },
      {
        diagnostic: {
          code: 'BP-WF-005',
          severity: 'warning',
          message: 'Step "review" in workflow "write-tests" has no agent assigned.',
          ref: { kind: 'workflow', id: 'write-tests' },
          data: { nodeId: 'review' },
        },
      },
    )

    const sent = client.sent[0]!.messages.map((message) => message.content).join('\n')
    // The invariant is the exit condition, from the rule's own description.
    expect(sent).toContain('Cleared when:')
    // The evidence names the step, so the model does not have to guess which of nine it is.
    expect(sent).toContain('nodeId')
    // The fields say what to change and, by omission, what to return untouched.
    expect(sent).toContain('Fields to change: nodes')
    // And the artifact is repeated next to the ask, not only thousands of tokens earlier.
    expect(sent).toContain('## The artifacts as they stand')
  })
})

/**
 * The steering tables have to cover the catalogue between them.
 *
 * Two sources supply the invariant — the rule's own description where the code has a rule,
 * and a table where one rule emits several codes. A code that falls between them is asked to
 * be fixed with no statement of what "fixed" means, which is the model guessing.
 */
it('has an invariant for every validation code a model is offered', () => {
  const uncovered = DIAGNOSTIC_CODES.filter(
    (entry) =>
      entry.source === 'validation' &&
      fixabilityOf({ code: entry.code, severity: 'warning', message: '' }).fixable &&
      invariantFor(entry.code) === undefined,
  )
  expect(uncovered.map((entry) => entry.code)).toEqual([])
})

/**
 * Writing it right the first time (P9-14).
 *
 * Reported from use: a generated Blueprint arrived with seven skills that had no Instructions
 * section, six with no Verification, five laws marked for a gate that was never written, an
 * unbounded loop and a hook with no command. Every one of those is a rule in `packages/core`,
 * and the model had never been told any of them.
 */
describe('the house style', () => {
  it('tells a skill prompt the two headings the validator looks for', () => {
    const style = houseStyleFor(['skill'])
    expect(style).toContain('## Instructions')
    expect(style).toContain('## Verification')
  })

  it('says how a law marked for a gate is actually checked', () => {
    // BP-LAW-011 matches the law's name inside the gate's text. "Wire laws to gates" would
    // not have produced that; naming the string match does.
    const style = houseStyleFor(['iron-law'])
    expect(style).toMatch(/name word for word/)
  })

  it('sends only the kinds the operation may write', () => {
    const style = houseStyleFor(['gate'])
    expect(style).toContain('criterion')
    expect(style).not.toContain('## Instructions')
    // Nothing to say for an operation that proposes nothing, and no budget spent saying it.
    expect(houseStyleFor([])).toBe('')
    expect(houseStyleFor(undefined)).toBe('')
  })

  it('reaches every prompt that can write an artifact', () => {
    // The point of composing it into `systemPrompt` rather than copying it into templates:
    // adding an operation cannot silently skip the rules.
    for (const id of ['generate-blueprint', 'create-iron-laws', 'create-workflow', 'compound']) {
      expect(PROMPTS[id as PromptId].system, id).toContain('What the validator will check')
    }
    // And the ones whose kind is a call-time input carry it beside the ask instead.
    expect(PROMPTS['generate-artifact'].user({ context: '', kind: 'skill', brief: 'x' })).toContain(
      '## Instructions',
    )
  })

  it('is written against codes that still exist', () => {
    // A rule that was renamed or removed would leave the model being told to satisfy a check
    // nothing runs, which is worse than saying nothing.
    for (const code of HOUSE_STYLE_CODES) {
      expect(isKnownDiagnosticCode(code), code).toBe(true)
    }
  })
})

describe('generateBlueprint, checked against both passes', () => {
  it('reads the findings back to the model and keeps the better draft', async () => {
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const answers = recording('generate-blueprint')
    const client = replayClient([...answers, ...recording('generate-blueprint-repaired')])

    const result = await generateBlueprint(
      { client: client.client },
      { blueprint: empty },
      'A crew.',
    )

    // It asked twice, and the second request quotes the validator rather than the brief.
    expect(client.sent).toHaveLength(2)
    expect(client.sent[1]!.messages.map((message) => message.content).join('\n')).toContain(
      'BP-EVAL-SKILL-002',
    )

    // And the draft that reaches the review is the one with fewer problems in it.
    const applied = applyChangeSet(empty, result.changeSet).blueprint
    const skill = applied.skills[0]
    expect(skill?.body).toContain('## Instructions')
    expect(skill?.body).toContain('## Verification')
  })

  it('does not ask twice when the first draft is clean', async () => {
    const empty = createEmptyBlueprint({ id: 'pr-review', name: 'Untitled' })
    const client = replayClient(recording('generate-blueprint-repaired'))

    await generateBlueprint({ client: client.client }, { blueprint: empty }, 'A crew.')
    expect(client.sent).toHaveLength(1)
  })
})

/**
 * Adding a capability to a Blueprint that already exists (P9-15).
 *
 * Reported from use: the wizard drafts a whole Blueprint, and afterwards the assistant could
 * only write one artifact at a time. "A .NET review expert" is an agent, its skills and the
 * laws it works under, and asking for those separately leaves the author doing the wiring.
 */
describe('addCapability', () => {
  it('adds a wired set of artifacts without touching the project header', async () => {
    const result = await addCapability(
      depsFor('add-capability', [1, 2]),
      { blueprint: fixture },
      { brief: 'A .NET review expert' },
    )

    const applied = applyChangeSet(fixture, result.changeSet)
    expect(applied.rejected).toEqual([])
    const after = applied.blueprint

    // More than one kind, in one review.
    const kinds = new Set(
      result.changeSet.ops.map((op) => (op.type === 'update-blueprint' ? undefined : op.kind)),
    )
    expect(kinds.has('agent')).toBe(true)
    expect(kinds.has('skill')).toBe(true)
    expect(kinds.has('iron-law')).toBe(true)

    // Wired: the new agent holds what was created beside it, and a skill the fixture already
    // had rather than a second copy of it.
    const agent = findEntity(after, 'agent', 'review-expert')!
    expect(agent.skillIds).toContain('reviewing-dotnet')
    expect(agent.skillIds).toContain('test-design')
    expect(agent.ironLawIds).toContain('no-unreviewed-merge')

    // And the project is still the project: same name, same primary agent.
    expect(after.name).toBe(fixture.name)
    expect(after.settings.primaryAgentId).toBe(fixture.settings.primaryAgentId)
    expect(result.changeSet.ops.some((op) => op.type === 'update-blueprint')).toBe(false)
  })

  it('asks again when the first attempt leaves the artifacts incomplete', async () => {
    const answers = recording('add-capability')
    const client = replayClient(answers)

    const result = await addCapability(
      { client: client.client },
      { blueprint: fixture },
      { brief: 'A .NET review expert' },
    )

    // The first answer wires the agent to a skill it never wrote and gives its skills no
    // Instructions section. Both are read back, and the second answer is the one kept.
    expect(client.sent).toHaveLength(2)
    const second = client.sent[1]!.messages.map((message) => message.content).join('\n')
    expect(second).toContain('BP-EVAL-SKILL-002')

    const after = applyChangeSet(fixture, result.changeSet).blueprint
    expect(findEntity(after, 'skill', 'reviewing-dotnet')!.body).toContain('## Instructions')
  })

  it('holds new artifacts from the selected agent when it writes no agent of its own', async () => {
    // Only the laws, so there is no agent in the answer and the selection decides the owner.
    const lawsOnly = JSON.stringify({
      summary: 'A law about reviews.',
      ironLaws: [
        {
          id: 'no-unreviewed-merge',
          name: 'Never merge unreviewed',
          description: 'Nothing merges unread.',
          rule: 'Never merge a change nobody has read.',
          rationale: 'A merge is a claim that someone checked.',
          examples: ['Read it, then merged.'],
          counterexamples: ['Green, so merged.'],
          severity: 'critical',
          category: 'code-quality',
          enforcement: ['instruction'],
          violationBehavior: 'Stop and read it.',
        },
      ],
    })

    const result = await addCapability(
      { client: replayClient([lawsOnly, lawsOnly]).client },
      { blueprint: fixture, selection: { kind: 'agent', id: fixture.agents[0]!.id } },
      { brief: 'A law about reviews' },
    )

    const after = applyChangeSet(fixture, result.changeSet).blueprint
    expect(findEntity(after, 'agent', fixture.agents[0]!.id)!.ironLawIds).toContain(
      'no-unreviewed-merge',
    )
  })
})

/**
 * Several findings, in one ask (P9-17).
 *
 * Not a loop over `fixFinding`, and the reason is not speed: two findings so often name the
 * same artifact — a skill with no Instructions usually has no Verification either — that
 * fixing them separately means two edits to one file, the second computed from a Blueprint
 * that does not yet have the first in it.
 */
describe('fixFindings', () => {
  function blunted(): Blueprint {
    return {
      ...fixture,
      skills: fixture.skills.map((skill) =>
        skill.id === 'test-design' ? { ...skill, body: 'Think about what to assert.' } : skill,
      ),
    }
  }

  /** The two findings a body with neither heading raises, on the one artifact. */
  const both = [
    {
      code: 'BP-SKILL-011',
      severity: 'info' as const,
      message: 'Skill "Test design" has no Verification section.',
      ref: { kind: 'skill' as const, id: 'test-design' },
    },
    {
      code: 'BP-EVAL-SKILL-002',
      severity: 'info' as const,
      message: 'Skill "Test design" has no Instructions section.',
      ref: { kind: 'skill' as const, id: 'test-design' },
    },
  ]

  const fixed = JSON.stringify({
    artifacts: [
      {
        kind: 'skill',
        artifact: {
          id: 'test-design',
          name: 'Test design',
          description: 'Deciding what a test should assert and naming it for the behaviour.',
          whenToUse: 'When deciding what a test should assert.',
          body: '## Instructions\n\n1. Name the behaviour before naming the method.\n2. Assert on what a caller can observe.\n\n## Verification\n\nRun `dotnet test` and read the names; each one reads as a sentence about behaviour.',
        },
      },
    ],
    note: 'Gave the body both sections in one edit.',
  })

  it('answers two findings about one artifact with one version of it', async () => {
    const blueprint = blunted()
    const result = await fixFindings(
      { client: replayClient([fixed]).client },
      { blueprint },
      { diagnostics: both },
    )

    // One op, not two competing edits to the same file.
    expect(result.changeSet.ops).toHaveLength(1)
    const body = findEntity(
      applyChangeSet(blueprint, result.changeSet).blueprint,
      'skill',
      'test-design',
    )!.body
    expect(body).toContain('## Instructions')
    expect(body).toContain('## Verification')
  })

  it('sends both findings in one ask, each with its own steering', async () => {
    const client = replayClient([fixed])
    await fixFindings({ client: client.client }, { blueprint: blunted() }, { diagnostics: both })

    expect(client.sent).toHaveLength(1)
    const sent = client.sent[0]!.messages.map((message) => message.content).join('\n')
    expect(sent).toContain('Clear these 2 findings, in one answer.')
    expect(sent).toContain('BP-SKILL-011')
    expect(sent).toContain('BP-EVAL-SKILL-002')
    // And the artifact once beside the ask, not once per finding. (It appears in the
    // context block too, which is a different job and is where every artifact appears.)
    const beside = sent.slice(sent.indexOf('## The artifacts as they stand'))
    expect(beside.split('# Skill: test-design').length - 1).toBe(1)
  })

  it('says which of them it actually closes', async () => {
    const result = await fixFindings(
      { client: replayClient([fixed]).client },
      { blueprint: blunted() },
      { diagnostics: both },
    )

    // BP-SKILL-011 is a validator rule and is checked; BP-EVAL-SKILL-002 comes from the
    // quality pass, so the note says it is a judgement rather than claiming success.
    const notes = result.notes.join(' ')
    expect(notes).toContain('BP-SKILL-011')
    expect(notes).toContain('quality review rather than the validator')
  })

  it('leaves alone what no artifact edit can clear, and says which', async () => {
    const result = await fixFindings(
      { client: replayClient([fixed]).client },
      { blueprint: blunted() },
      {
        diagnostics: [
          ...both,
          {
            code: 'BP-TARGET-001',
            severity: 'info',
            message: 'No export target is enabled.',
          },
        ],
      },
    )

    expect(result.notes.join(' ')).toContain('BP-TARGET-001 was left alone')
    expect(result.notes.join(' ')).toContain('Compatibility view')
  })

  it('refuses a batch where nothing can be fixed, rather than asking for nothing', async () => {
    await expect(
      fixFindings(
        { client: replayClient([fixed]).client },
        { blueprint: fixture },
        {
          diagnostics: [
            { code: 'BP-TARGET-001', severity: 'info', message: 'No export target is enabled.' },
          ],
        },
      ),
    ).rejects.toThrow(/None of these/)
  })
})

/**
 * A fix that keeps the rest of the artifact (P9-18).
 *
 * Reported from use, on a real skill: asked to add a Verification section, the model returned
 * the skill with the section added — and `activation` emptied, `referenceIds` and
 * `allowedToolIds` gone, `tags` dropped. It answered the question and lost half the artifact
 * doing it. The prompt already says to return every other field as given; a prompt is advice,
 * and this is the part that holds.
 */
describe('fixFindings keeps what the finding was not about', () => {
  function richSkill(): Blueprint {
    return upsertEntity(fixture, 'skill', {
      id: 'xunit',
      name: 'xUnit Testing',
      description: 'Write idiomatic xUnit tests for .NET code.',
      whenToUse: 'When writing or changing tests in a .NET project.',
      tags: ['testing', 'tests', 'xunit'],
      activation: {
        filePatterns: ['**/*.Tests.cs', '**/*Tests.cs'],
        intents: ['test', 'unit test', 'xunit'],
        agentRoles: ['worker', 'reviewer'],
      },
      referenceIds: ['testing-patterns'],
      body: '# What this skill does\n\nWrite executable xUnit tests for .NET code.',
    })
  }

  const finding = {
    code: 'BP-SKILL-011',
    severity: 'info' as const,
    message: 'Skill "xUnit Testing" has no Verification section.',
    ref: { kind: 'skill' as const, id: 'xunit' },
  }

  /** Exactly what was reported: the body fixed, everything else emptied or dropped. */
  const lossy = JSON.stringify({
    artifacts: [
      {
        kind: 'skill',
        artifact: {
          id: 'xunit',
          name: 'xUnit Testing',
          description: 'Write idiomatic xUnit tests for .NET code.',
          whenToUse: 'When writing or changing tests in a .NET project.',
          tags: [],
          activation: { filePatterns: [], intents: [], agentRoles: [] },
          body: '# What this skill does\n\nWrite executable xUnit tests.\n\n## Verification\n\n`dotnet test` reports the new tests as passing.',
        },
      },
    ],
    note: 'Added a Verification section.',
  })

  it('restores every field the finding was not about', async () => {
    const blueprint = richSkill()
    const before = findEntity(blueprint, 'skill', 'xunit')!
    const result = await fixFindings(
      { client: replayClient([lossy]).client },
      { blueprint },
      { diagnostics: [finding] },
    )

    const after = findEntity(
      applyChangeSet(blueprint, result.changeSet).blueprint,
      'skill',
      'xunit',
    )!

    // The fix landed.
    expect(after.body).toContain('## Verification')
    // And nothing else moved: BP-SKILL-011 is about the body, so the body is all that may change.
    expect(after.tags).toEqual(before.tags)
    expect(after.activation).toEqual(before.activation)
    expect(after.referenceIds).toEqual(['testing-patterns'])
    expect(after.whenToUse).toBe(before.whenToUse)
  })

  it('says what it kept, rather than keeping it quietly', async () => {
    const result = await fixFindings(
      { client: replayClient([lossy]).client },
      { blueprint: richSkill() },
      { diagnostics: [finding] },
    )

    const notes = result.notes.join(' ')
    expect(notes).toContain('Kept')
    expect(notes).toContain('tags')
    expect(notes).toContain('activation')
  })

  it('lets a finding change the fields it is about', async () => {
    // BP-SKILL-010 is about `activation`, so an activation the model rewrites is the fix.
    const blueprint = richSkill()
    const answer = JSON.stringify({
      artifacts: [
        {
          kind: 'skill',
          artifact: {
            id: 'xunit',
            name: 'xUnit Testing',
            activation: { intents: ['write a unit test'] },
          },
        },
      ],
    })
    const result = await fixFindings(
      { client: replayClient([answer]).client },
      { blueprint },
      {
        diagnostics: [
          {
            code: 'BP-SKILL-010',
            severity: 'warning',
            message: 'Skill "xUnit Testing" has no activation conditions and no owner.',
            ref: { kind: 'skill', id: 'xunit' },
          },
        ],
      },
    )

    const after = findEntity(
      applyChangeSet(blueprint, result.changeSet).blueprint,
      'skill',
      'xunit',
    )!
    expect(after.activation.intents).toEqual(['write a unit test'])
    // And the body it was not asked about is still there.
    expect(after.body).toContain('What this skill does')
  })

  it('restores what came back empty when the code names no fields', async () => {
    // A contradiction is about what two artifacts say, so there is no allow-list. The weaker
    // rule stands in: an emptied field is put back, a filled one wins.
    const blueprint = richSkill()
    const answer = JSON.stringify({
      artifacts: [
        {
          kind: 'skill',
          artifact: {
            id: 'xunit',
            name: 'xUnit Testing',
            description: 'Write xUnit tests that assert on behaviour, never on mocks.',
            tags: [],
            body: '# What this skill does\n\nAssert on behaviour.',
          },
        },
      ],
    })
    const result = await fixFindings(
      { client: replayClient([answer]).client },
      { blueprint },
      {
        diagnostics: [
          {
            code: 'BP-CONTRA-001',
            severity: 'warning',
            message: 'Two artifacts disagree about mocking.',
            ref: { kind: 'skill', id: 'xunit' },
          },
        ],
      },
    )

    const after = findEntity(
      applyChangeSet(blueprint, result.changeSet).blueprint,
      'skill',
      'xunit',
    )!
    expect(after.description).toContain('never on mocks')
    expect(after.tags).toEqual(['testing', 'tests', 'xunit'])
    expect(result.notes.join(' ')).toContain('Put back')
  })
})
