/**
 * The full Pi adapter.
 *
 * Pi runs one agent, has no `ask`, and has no network tool, so this adapter's job is as much
 * to report what is lost as to emit files. These tests check both halves: that the tool
 * allowlist is derived correctly, and that everything it cannot carry — an approval, a
 * per-command rule, a second agent — comes back as an issue rather than disappearing.
 */
import { type Agent, type Blueprint, type PermissionSet, type Rule } from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import { adapterFor, compileBlueprint } from '../src/index'
import { loadFixture } from './helpers'

function settingsOf(files: { path: string; content: string }[]): { defaultTools: string[] } {
  const file = files.find((candidate) => candidate.path === '.pi/settings.json')
  return JSON.parse(file!.content) as { defaultTools: string[] }
}

/** The fixture with the primary agent's permissions replaced. */
async function withPermissions(permissions: PermissionSet): Promise<Blueprint> {
  const blueprint = structuredClone(await loadFixture())
  blueprint.agents = blueprint.agents.map((agent) => ({ ...agent, permissions }))
  return blueprint
}

async function withSecondAgent(): Promise<Blueprint> {
  const blueprint = structuredClone(await loadFixture())
  const primary = blueprint.agents[0]!
  const reviewer: Agent = {
    ...structuredClone(primary),
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reads the tests and says what is wrong with them.',
  }
  blueprint.agents = [primary, reviewer]
  return blueprint
}

describe('pi adapter', () => {
  it('emits the documented file set for the fixture', async () => {
    const { files } = compileBlueprint(await loadFixture(), { targets: ['pi'] })
    const paths = files.map((file) => file.path)

    expect(paths).toContain('AGENTS.md')
    expect(paths).toContain('.agents/skills/xunit/SKILL.md')
    expect(paths).toContain('.pi/prompts/write-tests.md')
    expect(paths).toContain('.pi/settings.json')
    expect(paths).toContain('.pi/APPEND_SYSTEM.md')
  })

  it('enables a tool while any operation behind it survives', async () => {
    const blueprint = await withPermissions({
      operations: {
        'fs.read': 'allow',
        'fs.write': 'deny',
        'shell.readonly': 'allow',
        'shell.mutating': 'deny',
      },
      patterns: [],
    })
    const { files } = compileBlueprint(blueprint, { targets: ['pi'] })

    // Writing is denied outright, so those two go; the shell is only half denied, so it stays.
    expect(settingsOf(files).defaultTools).toEqual([
      'read',
      'bash',
      'powershell',
      'grep',
      'find',
      'ls',
    ])
  })

  it('does not leave one shell open while closing the other', async () => {
    const blueprint = await withPermissions({
      operations: { 'shell.readonly': 'deny', 'shell.mutating': 'deny', 'fs.read': 'allow' },
      patterns: [],
    })
    const tools = settingsOf(compileBlueprint(blueprint, { targets: ['pi'] }).files).defaultTools

    expect(tools).not.toContain('bash')
    expect(tools).not.toContain('powershell')
  })

  it('says that an approval it cannot ask for has become an instruction', async () => {
    const { issues } = compileBlueprint(await loadFixture(), { targets: ['pi'] })
    const asked = issues.find((issue) => issue.message.includes('no "ask" decision'))

    expect(asked?.support).toBe('limited')
    // The fixture asks before deleting, before mutating the shell and before committing.
    expect(asked?.message).toContain('shell.mutating')
    expect(asked?.adaptation).toBe('AGENTS.md "Command policy" section')
  })

  it('says that a granted network permission cannot be granted at all', async () => {
    const { issues } = compileBlueprint(await loadFixture(), { targets: ['pi'] })
    const network = issues.find((issue) => issue.message.includes('no built-in network tool'))

    // The fixture allows net.docs and denies net.any; only the grant is worth reporting.
    expect(network?.message).toContain('net.docs')
    expect(network?.message).not.toContain('net.any')
  })

  it('reports the per-command rules a tool allowlist cannot express', async () => {
    const { issues } = compileBlueprint(await loadFixture(), { targets: ['pi'] })
    const patterns = issues.find((issue) => issue.message.includes('per-command rule(s)'))

    expect(patterns?.support).toBe('limited')
    expect(patterns?.message).toContain('2 per-command rule(s)')
  })

  it('turns a second agent into a persona prompt and says what that costs', async () => {
    const { files, issues } = compileBlueprint(await withSecondAgent(), { targets: ['pi'] })
    const prompt = files.find((file) => file.path === '.pi/prompts/reviewer.md')!

    expect(prompt.content).toContain('Adopt the `reviewer` persona')
    // The template takes the task as its argument rather than assuming one.
    expect(prompt.content).toContain('$ARGUMENTS')
    expect(prompt.content).toContain('argument-hint: <task>')

    const unsupported = issues.find(
      (issue) => issue.concept === 'agents' && issue.ref?.id === 'reviewer',
    )
    expect(unsupported?.support).toBe('unsupported')
    expect(unsupported?.message).toContain('loses the isolation')
  })

  it('puts only the critical laws in the system prompt', async () => {
    const blueprint = structuredClone(await loadFixture())
    const critical = blueprint.ironLaws.filter((law) => law.severity === 'critical')
    expect(critical.length).toBeGreaterThan(0)
    expect(critical.length).toBeLessThan(blueprint.ironLaws.length)

    const { files } = compileBlueprint(blueprint, { targets: ['pi'] })
    const appended = files.find((file) => file.path === '.pi/APPEND_SYSTEM.md')!

    for (const law of blueprint.ironLaws) {
      expect(appended.content.includes(law.name), law.name).toBe(law.severity === 'critical')
    }
  })

  it('leaves the system prompt alone when no law is critical', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.ironLaws = blueprint.ironLaws.map((law) => ({ ...law, severity: 'high' as const }))
    const { files } = compileBlueprint(blueprint, { targets: ['pi'] })

    expect(files.map((file) => file.path)).not.toContain('.pi/APPEND_SYSTEM.md')
  })

  it('shares a directory rule with the other AGENTS.md readers', async () => {
    const blueprint = structuredClone(await loadFixture())
    const rule: Rule = {
      ...blueprint.rules[0]!,
      id: 'src-rules',
      name: 'Rules for src',
      paths: ['src/**'],
    }
    blueprint.rules = [rule]

    const all = compileBlueprint(blueprint, { targets: ['codex', 'opencode', 'pi'] })
    const nested = all.files.filter((file) => file.path === 'src/AGENTS.md')

    expect(nested).toHaveLength(1)
    expect(nested[0]?.owner).toBe('shared')
  })

  it('refuses an agent and a workflow that would be the same prompt file', async () => {
    const blueprint = await withSecondAgent()
    blueprint.agents[1]!.id = 'write-tests'
    const diagnostics = adapterFor('pi').validate(blueprint, { emitSettings: true })

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['BP-PI-002'])
    expect(diagnostics[0]?.severity).toBe('error')
    expect(diagnostics[0]?.message).toContain('.pi/prompts/write-tests.md')
  })

  it('reports an error when a workflow and a skill share an id', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.workflows[0]!.id = 'xunit'
    const diagnostics = adapterFor('pi').validate(blueprint, { emitSettings: true })
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['BP-PI-001'])
  })

  it('leaves the settings out when the repository manages its own', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.targets = [
      ...blueprint.targets,
      { harnessId: 'pi', enabled: true, options: { emitSettings: false } },
    ]
    const { files } = compileBlueprint(blueprint, { targets: ['pi'] })
    expect(files.map((file) => file.path)).not.toContain('.pi/settings.json')
  })
})
