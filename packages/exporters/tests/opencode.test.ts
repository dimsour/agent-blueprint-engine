/**
 * The full OpenCode adapter.
 *
 * OpenCode is the target whose permission model matches the Blueprint's, so most of these
 * tests are about permissions, and specifically about **order**: OpenCode reads a pattern
 * object last-match-wins, which means a correct set of rules in the wrong order is a wrong
 * set of rules. The rest cover the shapes the fixture does not have — a subagent, a
 * directory-scoped rule, an MCP server.
 */
import { type Agent, type Blueprint, fromYaml, type Rule, type Tool } from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import { adapterFor, compileBlueprint, type GeneratedFile } from '../src/index'
import { loadFixture, textOf } from './helpers'

type Decision = 'allow' | 'ask' | 'deny'
type PermissionValue = Decision | Record<string, Decision>

interface Config {
  $schema: string
  permission?: Record<string, PermissionValue>
  instructions?: string[]
  mcp?: Record<string, Record<string, unknown>>
}

function configOf(files: GeneratedFile[]): Config {
  return JSON.parse(textOf(files.find((file) => file.path === 'opencode.json'))) as Config
}

function frontmatterOf(content: string): Record<string, unknown> {
  const end = content.indexOf('\n---\n')
  return fromYaml(content.slice(4, end)) as Record<string, unknown>
}

/** The fixture plus a reviewer that may read but not write, and may not run anything. */
async function withReviewer(overrides: Partial<Agent> = {}): Promise<Blueprint> {
  const blueprint = structuredClone(await loadFixture())
  const primary = blueprint.agents[0]!
  const reviewer: Agent = {
    ...structuredClone(primary),
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reads the tests and says what is wrong with them.',
    permissions: {
      operations: { 'fs.read': 'allow', 'fs.write': 'deny', 'shell.mutating': 'deny' },
      patterns: [],
    },
    ...overrides,
  }
  blueprint.agents = [primary, reviewer]
  return blueprint
}

async function withMcpTool(mcp: Tool['mcp']): Promise<Blueprint> {
  const blueprint = structuredClone(await loadFixture())
  blueprint.tools = [
    ...blueprint.tools,
    {
      id: 'issue-tracker',
      name: 'Issue tracker',
      tags: [],
      metadata: {},
      kind: 'mcp',
      operations: [],
      mcp,
    },
  ]
  return blueprint
}

describe('opencode adapter', () => {
  it('emits the documented file set for the fixture', async () => {
    const { files } = compileBlueprint(await loadFixture(), { targets: ['opencode'] })
    const paths = files.map((file) => file.path)

    expect(paths).toContain('AGENTS.md')
    expect(paths).toContain('opencode.json')
    expect(paths).toContain('.agents/skills/xunit/SKILL.md')
    expect(paths).toContain('.opencode/commands/write-tests.md')
    // A single agent is the primary agent: it is AGENTS.md plus the global permission block.
    expect(paths.filter((path) => path.startsWith('.opencode/agents/'))).toEqual([])
  })

  it('writes the catch-all first, because the last matching rule wins', async () => {
    const { files } = compileBlueprint(await loadFixture(), { targets: ['opencode'] })
    const bash = configOf(files).permission?.bash as Record<string, Decision>
    const keys = Object.keys(bash)

    expect(keys[0]).toBe('*')
    expect(bash['*']).toBe('ask')
    // A force push is also a push, so the narrower ban has to be read after the wider one.
    expect(keys.indexOf('git push --force *')).toBeGreaterThan(keys.indexOf('git push *'))
    // What the author wrote themselves is the most specific thing there is, so it wins.
    expect(keys.indexOf('dotnet test *')).toBeGreaterThan(keys.indexOf('*'))
    expect(bash['dotnet test *']).toBe('allow')
    expect(bash['git push *']).toBe('deny')
  })

  it('keeps the order it wrote when the file is serialized', async () => {
    const { files } = compileBlueprint(await loadFixture(), { targets: ['opencode'] })
    const text = textOf(files.find((file) => file.path === 'opencode.json'))

    // Canonical JSON would sort these keys and silently invert the precedence.
    expect(text.indexOf('"*": "ask"')).toBeLessThan(text.indexOf('"dotnet test *"'))
    expect(text.indexOf('"git push *"')).toBeLessThan(text.indexOf('"git push --force *"'))
  })

  it('asks when documentation is allowed but the open internet is not', async () => {
    const { files, issues } = compileBlueprint(await loadFixture(), { targets: ['opencode'] })
    const permission = configOf(files).permission!

    // net.docs is allow and net.any is deny; one webfetch key cannot be both.
    expect(permission.webfetch).toBe('ask')
    expect(permission.websearch).toBe('deny')
    expect(
      issues.some(
        (issue) =>
          issue.concept === 'permissions' && issue.message.includes('cannot tell the two apart'),
      ),
    ).toBe(true)
  })

  it('closes glob and grep with read, which would otherwise walk the tree anyway', async () => {
    const { files } = compileBlueprint(await withReviewer(), { targets: ['opencode'] })
    const reviewer = frontmatterOf(
      textOf(files.find((file) => file.path === '.opencode/agents/reviewer.md')),
    )
    const permission = reviewer.permission as Record<string, PermissionValue>

    expect(reviewer.mode).toBe('subagent')
    expect(permission.read).toBe('allow')
    expect(permission.glob).toBe('allow')
    expect(permission.grep).toBe('allow')
    expect(permission.edit).toBe('deny')
    expect((permission.bash as Record<string, Decision>)['*']).toBe('deny')
  })

  it('turns path patterns into an edit object rather than losing them', async () => {
    const blueprint = await withReviewer({
      permissions: {
        operations: { 'fs.write': 'deny' },
        patterns: [{ operation: 'fs.write', pattern: 'docs/**', decision: 'allow' }],
      },
    })
    const { files } = compileBlueprint(blueprint, { targets: ['opencode'] })
    const permission = frontmatterOf(
      textOf(files.find((file) => file.path === '.opencode/agents/reviewer.md')),
    ).permission as Record<string, PermissionValue>

    expect(permission.edit).toEqual({ '*': 'deny', 'docs/**': 'allow' })
    expect(Object.keys(permission.edit as object)[0]).toBe('*')
  })

  it('names a model only when it is written the way OpenCode reads one', async () => {
    const pinned = await withReviewer({
      model: { preference: 'strong', hint: 'anthropic/claude-x' },
    })
    const bare = await withReviewer({ model: { preference: 'strong', hint: 'opus' } })

    const pinnedFile = compileBlueprint(pinned, { targets: ['opencode'] }).files.find(
      (file) => file.path === '.opencode/agents/reviewer.md',
    )!
    expect(frontmatterOf(textOf(pinnedFile)).model).toBe('anthropic/claude-x')

    const bareResult = compileBlueprint(bare, { targets: ['opencode'] })
    const bareFile = bareResult.files.find((file) => file.path === '.opencode/agents/reviewer.md')!
    expect(frontmatterOf(textOf(bareFile)).model).toBeUndefined()
    expect(bareResult.issues.some((issue) => issue.message.includes('provider/id'))).toBe(true)
  })

  it('shares a directory rule with Codex instead of writing a second copy', async () => {
    const blueprint = structuredClone(await loadFixture())
    const rule: Rule = {
      ...blueprint.rules[0]!,
      id: 'src-rules',
      name: 'Rules for src',
      paths: ['src/**'],
    }
    blueprint.rules = [rule]

    const both = compileBlueprint(blueprint, { targets: ['codex', 'opencode'] })
    const nested = both.files.filter((file) => file.path === 'src/AGENTS.md')

    expect(nested).toHaveLength(1)
    expect(nested[0]?.owner).toBe('shared')
    expect(textOf(nested[0])).toContain('Rules for src')
  })

  it('says which rules it cannot scope', async () => {
    const { issues } = compileBlueprint(await loadFixture(), { targets: ['opencode'] })
    const scoped = issues.find((issue) => issue.concept === 'pathScopedRules')

    // `**/*.csproj` is a glob, not a directory, so there is nowhere to put a nested file.
    expect(scoped?.support).toBe('adapted')
    expect(scoped?.message).toContain('not a plain directory')
  })

  it('configures MCP servers without carrying their secrets', async () => {
    const local = await withMcpTool({
      transport: 'stdio',
      command: 'issue-tracker-mcp',
      args: ['--repo', '.'],
      envVars: ['ISSUE_TRACKER_TOKEN'],
    })
    const remote = await withMcpTool({
      transport: 'http',
      url: 'https://mcp.example.test/',
      args: [],
      envVars: [],
    })

    expect(configOf(compileBlueprint(local, { targets: ['opencode'] }).files).mcp).toEqual({
      'issue-tracker': {
        type: 'local',
        command: ['issue-tracker-mcp', '--repo', '.'],
        enabled: true,
        environment: { ISSUE_TRACKER_TOKEN: '' },
      },
    })
    expect(configOf(compileBlueprint(remote, { targets: ['opencode'] }).files).mcp).toEqual({
      'issue-tracker': { type: 'remote', url: 'https://mcp.example.test/', enabled: true },
    })
  })

  it('reports an error when a workflow and a skill share an id', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.workflows[0]!.id = 'xunit'
    const diagnostics = adapterFor('opencode').validate(blueprint, { emitConfig: true })
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['BP-OPENCODE-001'])
    expect(diagnostics[0]?.severity).toBe('error')
  })

  it('warns when a subagent and a command would be named the same thing', async () => {
    const blueprint = await withReviewer()
    blueprint.agents[1]!.id = 'write-tests'
    const diagnostics = adapterFor('opencode').validate(blueprint, { emitConfig: true })

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['BP-OPENCODE-002'])
    expect(diagnostics[0]?.severity).toBe('warning')
    expect(diagnostics[0]?.message).toContain('@write-tests')
  })

  it('leaves the config out when the repository manages its own', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.targets = [
      ...blueprint.targets,
      { harnessId: 'opencode', enabled: true, options: { emitConfig: false } },
    ]
    const { files } = compileBlueprint(blueprint, { targets: ['opencode'] })
    expect(files.map((file) => file.path)).not.toContain('opencode.json')
  })
})
