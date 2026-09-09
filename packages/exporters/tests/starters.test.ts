/**
 * End-to-end: every starter blueprint compiles for every target.
 *
 * The golden tests pin the exact bytes for one fixture; this one asks a broader question of
 * ten diverse projects, including a five-agent team with parallel review. If an adapter only
 * works for the shape of the fixture, it fails here.
 */
import { type Blueprint, HARNESS_IDS, MemoryFs, readProject } from '@agent-blueprint/core'
import { starterBlueprints } from '@agent-blueprint/templates'
import { beforeAll, describe, expect, it } from 'vitest'

import { compileBlueprint, GENERATED_HEADER_RE, portabilityOf } from '../src/index'

const blueprints = new Map<string, Blueprint>()

beforeAll(async () => {
  for (const starter of starterBlueprints) {
    const { blueprint } = await readProject(new MemoryFs(starter.files))
    blueprints.set(starter.id, blueprint)
  }
})

describe('starter blueprints compile', () => {
  it('covers ten starters', () => {
    expect(starterBlueprints).toHaveLength(10)
  })

  it.each(starterBlueprints.map((starter) => [starter.id] as const))(
    '%s compiles for every target without conflicts',
    (id) => {
      const blueprint = blueprints.get(id)
      expect(blueprint).toBeDefined()
      const result = compileBlueprint(blueprint!, { targets: [...HARNESS_IDS] })

      expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
      expect(result.files.length).toBeGreaterThan(8)

      // One file per path: the shared artifacts merged instead of colliding.
      const paths = result.files.map((file) => file.path)
      expect(new Set(paths).size).toBe(paths.length)
      expect(paths).toContain('AGENTS.md')
      expect(paths).toContain('CLAUDE.md')
      expect(result.files.find((file) => file.path === 'AGENTS.md')?.owner).toBe('shared')
    },
  )

  it.each(starterBlueprints.map((starter) => [starter.id] as const))(
    '%s compiles deterministically',
    (id) => {
      const blueprint = blueprints.get(id)!
      const first = compileBlueprint(blueprint, { targets: [...HARNESS_IDS] })
      const second = compileBlueprint(structuredClone(blueprint), { targets: [...HARNESS_IDS] })
      expect(second.files).toEqual(first.files)
    },
  )

  it.each(starterBlueprints.map((starter) => [starter.id] as const))(
    '%s produces well-formed files',
    (id) => {
      const { files } = compileBlueprint(blueprints.get(id)!, { targets: [...HARNESS_IDS] })
      for (const file of files) {
        expect(file.path, file.path).not.toMatch(/^[/\\]|\\/)
        expect(file.path.split('/'), file.path).not.toContain('..')
        expect(file.content.endsWith('\n'), file.path).toBe(true)
        if (file.format === 'markdown') {
          expect(GENERATED_HEADER_RE.test(file.content), `${id} ${file.path}`).toBe(true)
        }
      }
    },
  )

  it('compiles the multi-agent team into subagents and a delegating workflow', () => {
    const blueprint = blueprints.get('software-engineering-team')!
    expect(blueprint.agents).toHaveLength(5)

    const { files } = compileBlueprint(blueprint, { targets: ['claude-code', 'codex'] })
    const paths = files.map((file) => file.path)

    // Four subagents; the orchestrator is primary and becomes CLAUDE.md instead.
    for (const agentId of ['architect', 'developer', 'test-engineer', 'security-reviewer']) {
      expect(paths).toContain(`.claude/agents/${agentId}.md`)
      expect(paths).toContain(`.codex/agents/${agentId}.toml`)
    }
    expect(paths).not.toContain('.claude/agents/orchestrator.md')

    const workflowSkill = files.find(
      (file) => file.path === '.claude/skills/deliver-feature/SKILL.md',
    )
    expect(workflowSkill?.content).toContain('Use the Agent tool to run the `architect` subagent')
    expect(workflowSkill?.content).toContain('Run these branches at the same time')
    expect(workflowSkill?.content).toContain('Do not continue unless every criterion below holds')
  })

  it('scores every starter as portable to its own targets', () => {
    for (const starter of starterBlueprints) {
      const { score } = portabilityOf(blueprints.get(starter.id)!)
      expect(score, `${starter.id} scored ${score}`).toBeGreaterThanOrEqual(85)
    }
  })

  it('reports what Pi cannot do with the multi-agent team', () => {
    const blueprint = blueprints.get('software-engineering-team')!
    const { issues } = compileBlueprint(blueprint, { targets: ['pi'] })

    const unsupportedAgents = issues.filter(
      (issue) => issue.concept === 'agents' && issue.support === 'unsupported',
    )
    expect(unsupportedAgents).toHaveLength(4)
    expect(unsupportedAgents[0]?.message).toContain('no subagents')
    expect(issues.some((issue) => issue.concept === 'parallelAgents')).toBe(true)
  })
})
