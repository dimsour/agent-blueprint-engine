import { describe, expect, it } from 'vitest'

import {
  createEmptyBlueprint,
  evaluateBlueprint,
  evaluateCheck,
  evaluateRequirements,
  healthSummary,
  requirementSchema,
  upsertEntity,
} from '../src/index'
import { loadFixture } from './helpers'

describe('requirement checks', () => {
  it('satisfies both fixture requirements with evidence', async () => {
    const blueprint = await loadFixture()
    const { results, diagnostics } = evaluateRequirements(blueprint)

    expect(diagnostics).toEqual([])
    expect(results.map((result) => `${result.ref.id}:${result.status}`)).toEqual([
      'verify-before-claiming:satisfied',
      'use-existing-framework:satisfied',
    ])
    const first = results[0]
    expect(first?.checks.map((check) => check.status)).toEqual(['pass', 'pass', 'pass'])
    expect(first?.checks[0]?.evidence).toEqual([{ kind: 'workflow', id: 'write-tests' }])
    expect(first?.checks[1]?.evidence).toEqual([
      { kind: 'iron-law', id: 'never-fake-verification' },
    ])
  })

  it('drops to partial when the evidence disappears', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.gates = []
    const { results, diagnostics } = evaluateRequirements(blueprint)

    expect(results[0]?.status).toBe('partial')
    const finding = diagnostics.find((diagnostic) => diagnostic.code === 'BP-REQ-002')
    expect(finding?.severity).toBe('warning')
    expect(finding?.data).toEqual({
      passed: ['workflow-has-node-type', 'iron-law-matches'],
      failed: ['gate-exists'],
    })
  })

  it('reports an unmet must requirement as an error and a should as a warning', () => {
    let blueprint = createEmptyBlueprint({ id: 'x', name: 'X' })
    blueprint = upsertEntity(
      blueprint,
      'requirement',
      requirementSchema.parse({
        id: 'must-verify',
        name: 'Must verify',
        statement: 'The agent must verify its work.',
        level: 'must',
        checks: [{ type: 'workflow-has-node-type', nodeType: 'verification' }],
      }),
    )
    blueprint = upsertEntity(
      blueprint,
      'requirement',
      requirementSchema.parse({
        id: 'should-review',
        name: 'Should review',
        statement: 'The agent should review its work.',
        level: 'should',
        checks: [{ type: 'workflow-has-node-type', nodeType: 'review' }],
      }),
    )
    const diagnostics = evaluateRequirements(blueprint).diagnostics
    expect(diagnostics.map((d) => `${d.code}:${d.severity}`)).toEqual([
      'BP-REQ-001:error',
      'BP-REQ-001:warning',
    ])
  })

  it('marks a prose-only requirement unverifiable and an ai-judged one skipped', () => {
    let blueprint = createEmptyBlueprint({ id: 'x', name: 'X' })
    blueprint = upsertEntity(blueprint, 'requirement', {
      id: 'prose',
      name: 'Prose',
      statement: 'The agent should be helpful.',
    })
    blueprint = upsertEntity(blueprint, 'requirement', {
      id: 'judged',
      name: 'Judged',
      statement: 'The agent should write clearly.',
      checks: [{ type: 'ai-judged', prompt: 'Does it write clearly?' }],
    })
    const codes = evaluateRequirements(blueprint).diagnostics.map((d) => d.code)
    expect(codes).toEqual(['BP-REQ-003', 'BP-REQ-004'])
  })

  it('fails a check with an invalid regular expression instead of throwing', async () => {
    const blueprint = await loadFixture()
    const result = evaluateCheck(blueprint, { type: 'iron-law-matches', pattern: '([' })
    expect(result.status).toBe('fail')
    expect(result.error).toBeDefined()
  })

  it('matches text across the requested kinds only', async () => {
    const blueprint = await loadFixture()
    expect(
      evaluateCheck(blueprint, {
        type: 'text-mentions',
        kinds: ['rule'],
        pattern: 'already references',
      }).status,
    ).toBe('pass')
    expect(
      evaluateCheck(blueprint, {
        type: 'text-mentions',
        kinds: ['gate'],
        pattern: 'already references',
      }).status,
    ).toBe('fail')
  })

  it('checks a skill tag through the agent that owns the skill', async () => {
    const blueprint = await loadFixture()
    expect(evaluateCheck(blueprint, { type: 'agent-has-skill-tag', tag: 'DOTNET' }).status).toBe(
      'pass',
    )
    expect(evaluateCheck(blueprint, { type: 'agent-has-skill-tag', tag: 'rust' }).status).toBe(
      'fail',
    )
  })
})

describe('evaluateBlueprint', () => {
  it('scores the fixture highly and explains every deduction', async () => {
    const blueprint = await loadFixture()
    const report = evaluateBlueprint(blueprint)

    expect(report.overall).toBeGreaterThanOrEqual(90)
    expect(report.dimensions).toHaveLength(10)
    for (const dimension of report.dimensions) {
      expect(dimension.score).toBeGreaterThanOrEqual(0)
      expect(dimension.score).toBeLessThanOrEqual(100)
      if (dimension.score < 100) expect(dimension.findings.length).toBeGreaterThan(0)
    }
    expect(report.computedFrom).toEqual({ schemaVersion: '1.0', rulesVersion: '1.0.0' })
  })

  it('contains no timestamp and is stable across runs', async () => {
    const blueprint = await loadFixture()
    const first = evaluateBlueprint(blueprint)
    const second = evaluateBlueprint(structuredClone(blueprint))
    expect(second).toEqual(first)
    expect(JSON.stringify(first)).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('drops the Iron Laws score to 40 when there are none', () => {
    const report = evaluateBlueprint(createEmptyBlueprint({ id: 'x', name: 'X' }))
    const laws = report.dimensions.find((dimension) => dimension.id === 'ironLaws')
    expect(laws?.score).toBe(40)
    expect(laws?.findings.some((finding) => finding.code === 'BP-EVAL-LAW-003')).toBe(true)
  })

  it('penalises an agent allowed to force-push', async () => {
    const blueprint = structuredClone(await loadFixture())
    const before =
      evaluateBlueprint(blueprint).dimensions.find((d) => d.id === 'safety')?.score ?? 0
    blueprint.agents[0]!.permissions.operations['git.force-push'] = 'allow'
    const after = evaluateBlueprint(blueprint).dimensions.find((d) => d.id === 'safety')
    expect(after?.score).toBe(before - 10)
    expect(after?.findings.some((finding) => finding.code === 'BP-SAFETY-001')).toBe(true)
  })

  it('scales coverage by the share of satisfied requirements', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.gates = []
    const coverage = evaluateBlueprint(blueprint).dimensions.find((d) => d.id === 'coverage')
    // One of two requirements is still satisfied, so coverage is roughly halved.
    expect(coverage?.score).toBeLessThan(60)
  })

  it('uses an injected portability provider', async () => {
    const blueprint = await loadFixture()
    const report = evaluateBlueprint(blueprint, {
      portability: () => ({
        score: 60,
        issues: [
          {
            code: 'BP-PORT-001',
            severity: 'warning',
            message: 'Memory is unsupported on Pi.',
            data: { target: 'pi' },
          },
        ],
      }),
    })
    const portability = report.dimensions.find((dimension) => dimension.id === 'portability')
    expect(portability?.score).toBe(60)
    expect(report.overall).toBeLessThan(evaluateBlueprint(blueprint).overall)
  })
})

describe('healthSummary', () => {
  it('summarises the fixture', async () => {
    const blueprint = await loadFixture()
    const health = healthSummary(blueprint)

    expect(health.errors).toBe(0)
    expect(health.artifacts).toBe(19)
    expect(health.orphans).toEqual([])
    expect(health.targets).toEqual([
      { harnessId: 'claude-code', status: 'ok' },
      { harnessId: 'codex', status: 'ok' },
    ])
    expect(health.overall).toBe(evaluateBlueprint(blueprint).overall)
    expect(health.topFindings.length).toBeLessThanOrEqual(5)
  })

  it('blocks every target while the Blueprint has an error', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.agents[0]?.skillIds.push('does-not-exist')
    const health = healthSummary(blueprint)
    expect(health.errors).toBeGreaterThan(0)
    expect(health.targets.every((target) => target.status === 'blocked')).toBe(true)
    expect(health.topFindings[0]?.severity).toBe('error')
  })
})

/**
 * Where a failed check nearly passed (P9-19).
 *
 * Reported from use: "Nothing in the Blueprint meets its check" on a requirement, and the
 * cause was a hook with the right trigger and the wrong action type — three artifacts away,
 * with nothing on screen pointing at it. A failed check knows what it looked at.
 */
describe('near misses', () => {
  it('names the hook that has the trigger but not the action, and says which', async () => {
    const blueprint = upsertEntity(await loadFixture(), 'hook', {
      id: 'secret-scan-before-stop',
      name: 'Secret scan before stop',
      trigger: 'before-stop',
      action: { type: 'command', command: 'dotnet tool run dotnet-secretscan --scan .' },
      severity: 'critical',
    })

    const result = evaluateCheck(blueprint, {
      type: 'hook-exists',
      trigger: 'before-stop',
      actionType: 'secret-scan',
    })

    expect(result.status).toBe('fail')
    expect(result.nearMisses).toEqual([
      {
        ref: { kind: 'hook', id: 'secret-scan-before-stop' },
        because: 'its action is command, not secret-scan',
      },
    ])
  })

  it('names the hook that has the action but not the trigger, the other way round', async () => {
    const blueprint = await loadFixture()
    const result = evaluateCheck(blueprint, {
      type: 'hook-exists',
      trigger: 'before-stop',
      actionType: 'run-tests',
    })

    expect(result.status).toBe('fail')
    expect(result.nearMisses?.[0]).toEqual({
      ref: { kind: 'hook', id: 'run-tests-after-change' },
      because: 'it runs on after-file-change, not before-stop',
    })
  })

  it('leaves out a hook that matches neither, which is not a near miss', async () => {
    const blueprint = await loadFixture()
    const result = evaluateCheck(blueprint, {
      type: 'hook-exists',
      trigger: 'session-start',
      actionType: 'secret-scan',
    })
    expect(result.status).toBe('fail')
    expect(result.nearMisses).toBeUndefined()
  })

  it('carries the pointer onto the finding: in the message, as related, and as data', async () => {
    let blueprint = upsertEntity(await loadFixture(), 'hook', {
      id: 'secret-scan-before-stop',
      name: 'Secret scan before stop',
      trigger: 'before-stop',
      action: { type: 'command', command: 'scan' },
      severity: 'critical',
    })
    blueprint = upsertEntity(blueprint, 'requirement', {
      id: 'security-enforcement',
      name: 'Security enforcement',
      statement: 'Secret scanning is enforced before the agent stops.',
      level: 'must',
      checks: [{ type: 'hook-exists', trigger: 'before-stop', actionType: 'secret-scan' }],
    })

    const finding = evaluateRequirements(blueprint).diagnostics.find(
      (d) => d.code === 'BP-REQ-001' && d.ref?.id === 'security-enforcement',
    )!

    // The one line every surface shows carries the pointer, not only the structured fields.
    expect(finding.message).toContain(
      'The nearest is hook "Secret scan before stop": its action is command, not secret-scan.',
    )
    // `related` is what every findings list already navigates to.
    expect(finding.related).toEqual([{ kind: 'hook', id: 'secret-scan-before-stop' }])
    // And `data` is what the fix operation reads as evidence.
    expect(finding.data).toMatchObject({
      nearMisses: [
        {
          kind: 'hook',
          id: 'secret-scan-before-stop',
          because: 'its action is command, not secret-scan',
        },
      ],
    })
  })

  it('says what a gate has instead of the criterion asked for', async () => {
    const blueprint = await loadFixture()
    const result = evaluateCheck(blueprint, {
      type: 'gate-exists',
      criterionKind: 'human-approval',
    })
    expect(result.status).toBe('fail')
    expect(result.nearMisses?.[0]?.because).toMatch(/its criteria are .*; none is human-approval/)
  })

  it('tells a tagged-but-unheld skill from an agent whose skills lack the tag', async () => {
    const blueprint = upsertEntity(await loadFixture(), 'skill', {
      id: 'rust-basics',
      name: 'Rust basics',
      tags: ['rust'],
      body: '## Instructions\n\nCargo.',
    })
    const result = evaluateCheck(blueprint, { type: 'agent-has-skill-tag', tag: 'rust' })

    expect(result.status).toBe('fail')
    const because = (result.nearMisses ?? []).map(
      (miss) => `${miss.ref.kind}:${miss.ref.id} ${miss.because}`,
    )
    expect(because.some((line) => line.startsWith('skill:rust-basics it is tagged "rust"'))).toBe(
      true,
    )
    expect(
      because.some((line) => line.startsWith('agent:') && line.includes('is tagged "rust"')),
    ).toBe(true)
  })

  it('lists the step types a workflow has instead of the one it needs', async () => {
    const blueprint = await loadFixture()
    const result = evaluateCheck(blueprint, {
      type: 'workflow-has-node-type',
      nodeType: 'human-approval',
    })
    expect(result.status).toBe('fail')
    expect(result.nearMisses?.length).toBeGreaterThan(0)
    expect(result.nearMisses?.[0]?.because).toMatch(/its steps are .*; none is human-approval/)
  })
})
