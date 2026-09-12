/**
 * The full Copilot adapter.
 *
 * The fixture has one agent, one path-scoped rule, one hook and one gate, which covers the
 * files a single-agent project gets. The rest of these tests build the shapes the fixture
 * does not have — a second agent that delegates, a denied tool category, an MCP server — and
 * check the two things that are easy to get wrong: an allowlist that removes a capability the
 * agent still needs, and a claim of enforcement the harness cannot make.
 */
import { type Agent, type Blueprint, fromYaml, type Tool } from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import { adapterFor, compileBlueprint, type GeneratedFile } from '../src/index'
import { loadFixture, textOf } from './helpers'

interface HookHandler {
  type: string
  bash: string
  powershell: string
  timeoutSec?: number
  matcher?: string
}

function hooksOf(files: GeneratedFile[]): Record<string, HookHandler[]> {
  const file = files.find((candidate) => candidate.path === '.github/hooks/blueprint.json')
  return (JSON.parse(textOf(file)) as { hooks: Record<string, HookHandler[]> }).hooks
}

function frontmatterOf(content: string): Record<string, unknown> {
  const end = content.indexOf('\n---\n')
  return fromYaml(content.slice(4, end)) as Record<string, unknown>
}

/** The fixture plus a reviewer that may not write and may hand work to a researcher. */
async function withTeam(): Promise<Blueprint> {
  const blueprint = structuredClone(await loadFixture())
  const primary = blueprint.agents[0]!
  const reviewer: Agent = {
    ...structuredClone(primary),
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reads the tests and says what is wrong with them.',
    permissions: {
      operations: { ...primary.permissions.operations, 'fs.write': 'deny', 'fs.delete': 'deny' },
      patterns: [],
    },
    delegation: { canDelegateTo: ['researcher'] },
  }
  const researcher: Agent = {
    ...structuredClone(primary),
    id: 'researcher',
    name: 'Researcher',
    description: 'Finds out how the code under test is meant to behave.',
    delegation: { canDelegateTo: ['testing-expert'] },
  }
  blueprint.agents = [primary, reviewer, researcher]
  return blueprint
}

async function withMcpTool(operations: string[]): Promise<Blueprint> {
  const blueprint = structuredClone(await loadFixture())
  const tool: Tool = {
    id: 'issue-tracker',
    name: 'Issue tracker',
    tags: [],
    metadata: {},
    kind: 'mcp',
    operations,
    mcp: {
      transport: 'stdio',
      command: 'issue-tracker-mcp',
      args: ['--repo', '.'],
      envVars: ['ISSUE_TRACKER_TOKEN'],
    },
  }
  blueprint.tools = [...blueprint.tools, tool]
  blueprint.agents = blueprint.agents.map((agent) => ({
    ...agent,
    toolIds: [...agent.toolIds, tool.id],
  }))
  return blueprint
}

describe('copilot adapter', () => {
  it('emits the documented file set for the fixture', async () => {
    const { files } = compileBlueprint(await loadFixture(), { targets: ['copilot'] })
    const paths = files.map((file) => file.path)

    expect(paths).toContain('AGENTS.md')
    expect(paths).toContain('.github/copilot-instructions.md')
    expect(paths).toContain('.github/skills/xunit/SKILL.md')
    expect(paths).toContain('.github/skills/xunit/references/xunit-patterns.md')
    expect(paths).toContain('.github/prompts/write-tests.prompt.md')
    expect(paths).toContain('.github/instructions/prefer-existing-framework.instructions.md')
    expect(paths).toContain('.github/hooks/blueprint.json')
    // A single agent is the primary agent, so it is AGENTS.md rather than a custom agent.
    expect(paths.filter((path) => path.startsWith('.github/agents/'))).toEqual([])
    // No MCP tool in the fixture, so no editor configuration to write.
    expect(paths).not.toContain('.vscode/mcp.json')
  })

  it('scopes a rule with globs to those globs instead of always loading it', async () => {
    const { files } = compileBlueprint(await loadFixture(), { targets: ['copilot'] })
    const file = files.find((candidate) =>
      candidate.path.endsWith('prefer-existing-framework.instructions.md'),
    )!

    // Several globs are one comma-separated value; a YAML list would not be read as applyTo.
    expect(frontmatterOf(textOf(file)).applyTo).toBe('**/*.csproj, **/*Tests.cs')
    expect(textOf(file)).toContain('applyTo: "**/*.csproj, **/*Tests.cs"')
  })

  it('makes a gate refuse the stop rather than only mentioning it', async () => {
    const { files } = compileBlueprint(await loadFixture(), { targets: ['copilot'] })
    const stop = hooksOf(files).agentStop ?? []

    const gate = stop.find((handler) => handler.bash.startsWith('dotnet test'))!
    expect(gate.bash).toBe(
      'dotnet test || echo \'{"decision":"block","reason":"Tests must pass: All tests in the affected projects pass."}\'',
    )
    expect(gate.powershell).toContain('if ($LASTEXITCODE -ne 0)')
    // The payload is quoted twice over — once as JSON, once for the shell — so the reason
    // must carry no quote of its own or the command would not parse.
    const payload = gate.bash.slice(gate.bash.indexOf('{'), gate.bash.lastIndexOf('}') + 1)
    expect((JSON.parse(payload) as { reason: string }).reason).not.toMatch(/['"]/)
  })

  it('says that a hook meant for a file pattern runs on every edit', async () => {
    const { issues } = compileBlueprint(await loadFixture(), { targets: ['copilot'] })
    const hook = hooksOf(compileBlueprint(await loadFixture(), { targets: ['copilot'] }).files)
    expect(hook.postToolUse?.[0]?.matcher).toBe('edit|write')

    const reported = issues.find(
      (candidate) => candidate.concept === 'hooks' && candidate.support === 'limited',
    )
    expect(reported?.message).toContain('**/*.cs')
    expect(reported?.message).toContain('selects tools rather than paths')
  })

  it('compiles every non-primary agent to a custom agent with its own allowlist', async () => {
    const { files } = compileBlueprint(await withTeam(), { targets: ['copilot'] })
    const paths = files.map((file) => file.path)
    expect(paths).toContain('.github/agents/reviewer.agent.md')
    expect(paths).toContain('.github/agents/researcher.agent.md')
    expect(paths).not.toContain('.github/agents/testing-expert.agent.md')

    const reviewer = frontmatterOf(
      textOf(files.find((file) => file.path === '.github/agents/reviewer.agent.md')),
    )
    // Writing is denied, so `edit` goes; reading and running commands are not, so they stay.
    expect(reviewer.tools).toEqual(['read', 'execute', 'agent'])
    expect(reviewer.agents).toEqual(['researcher'])
    expect(reviewer['user-invocable']).toBe(true)
  })

  it('does not hand off to the primary agent, which has no agent file', async () => {
    const { files, issues } = compileBlueprint(await withTeam(), { targets: ['copilot'] })
    const researcher = frontmatterOf(
      textOf(files.find((file) => file.path === '.github/agents/researcher.agent.md')),
    )

    expect(researcher.agents).toBeUndefined()
    expect(
      issues.some(
        (issue) =>
          issue.ref?.id === 'researcher' && issue.message.includes('delegate back to the primary'),
      ),
    ).toBe(true)
  })

  it('configures an MCP server for the editor without carrying its secret', async () => {
    const { files, issues } = compileBlueprint(await withMcpTool(['create_issue']), {
      targets: ['copilot'],
    })
    const config = JSON.parse(
      textOf(files.find((file) => file.path === '.vscode/mcp.json')),
    ) as Record<string, Record<string, Record<string, unknown>>>

    expect(config.servers?.['issue-tracker']).toEqual({
      type: 'stdio',
      command: 'issue-tracker-mcp',
      args: ['--repo', '.'],
      env: { ISSUE_TRACKER_TOKEN: '' },
    })
    // The cloud agent reads none of this, and saying so is the point of the issue.
    expect(issues.some((issue) => issue.message.includes('repository settings'))).toBe(true)
  })

  it('cannot allowlist an MCP server whose tools the Blueprint does not name', async () => {
    const named = compileBlueprint(await withMcpTool(['create_issue']), { targets: ['copilot'] })
    const unnamed = compileBlueprint(await withMcpTool([]), { targets: ['copilot'] })

    expect(
      named.issues.some((issue) => issue.message.includes('does not list the operations')),
    ).toBe(false)
    expect(
      unnamed.issues.some((issue) => issue.message.includes('does not list the operations')),
    ).toBe(true)
  })

  it('reports the per-command rules it cannot enforce instead of dropping them quietly', async () => {
    const { issues } = compileBlueprint(await loadFixture(), { targets: ['copilot'] })
    const permissions = issues.find(
      (issue) => issue.concept === 'permissions' && issue.ref?.id === 'testing-expert',
    )

    expect(permissions?.support).toBe('limited')
    expect(permissions?.message).toContain('2 per-command rule(s)')
    expect(permissions?.adaptation).toBe('AGENTS.md "Command policy" section')
  })

  it('reports an error when a workflow and a skill share an id', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.workflows[0]!.id = 'xunit'
    const diagnostics = adapterFor('copilot').validate(blueprint, { emitHooks: true })
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['BP-COPILOT-001'])
    expect(diagnostics[0]?.severity).toBe('error')
  })

  it('warns when a custom agent body is longer than Copilot will read', async () => {
    const blueprint = await withTeam()
    blueprint.agents[1]!.body = 'x'.repeat(30_001)
    const diagnostics = adapterFor('copilot').validate(blueprint, { emitHooks: true })

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['BP-COPILOT-002'])
    expect(diagnostics[0]?.severity).toBe('warning')
    expect(diagnostics[0]?.ref).toEqual({ kind: 'agent', id: 'reviewer' })
  })

  it('leaves the hooks file out when the repository manages its own', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.targets = [
      ...blueprint.targets,
      { harnessId: 'copilot', enabled: true, options: { emitHooks: false } },
    ]
    const { files } = compileBlueprint(blueprint, { targets: ['copilot'] })
    expect(files.map((file) => file.path)).not.toContain('.github/hooks/blueprint.json')
  })
})

/**
 * The plugin layout (P9-36): an Agent Plugins 1.0 package with Copilot's components under
 * `com.github.copilot/`, and a marketplace at `.github/plugin/marketplace.json`.
 */
describe('copilot plugin layout', () => {
  const asPlugin = async (mutate?: (blueprint: Blueprint) => void) => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.targets = [{ harnessId: 'copilot', enabled: true, options: { layout: 'plugin' } }]
    mutate?.(blueprint)
    return compileBlueprint(blueprint)
  }

  it('writes an Agent Plugins package and nothing else at the root but the marketplace', async () => {
    const { files } = await asPlugin()
    const paths = files.map((file) => file.path)
    expect(paths.filter((path) => !path.startsWith('plugins/copilot/'))).toEqual([
      '.github/plugin/marketplace.json',
      'README.md',
    ])
    const manifest = JSON.parse(
      textOf(files.find((f) => f.path === 'plugins/copilot/plugin.json')),
    ) as Record<string, unknown>
    expect(manifest.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
    expect(manifest.name).toBe('dotnet-testing-expert')
    // The spec's manifest is closed: no component paths.
    expect(Object.keys(manifest).sort()).toEqual(['$schema', 'description', 'name', 'version'])
    const marketplace = JSON.parse(
      textOf(files.find((f) => f.path === '.github/plugin/marketplace.json')),
    ) as { name: string; plugins: { name: string; source: string }[] }
    expect(marketplace.name).toBe('dotnet-testing-expert')
    expect(marketplace.plugins[0]).toMatchObject({
      name: 'dotnet-testing-expert',
      source: './plugins/copilot',
    })
  })

  it('carries the instructions as a rule that applies to every path', async () => {
    const { files, issues } = await asPlugin()
    const guide = files.find(
      (f) => f.path === 'plugins/copilot/com.github.copilot/rules/guide.instructions.md',
    )
    const text = textOf(guide)
    expect(frontmatterOf(text)).toMatchObject({ applyTo: '**' })
    expect(text).toContain('## Iron Laws')
    expect(text).toContain('## Command policy')
    // The path-scoped rule is beside it, and the guide says so.
    expect(
      files.some(
        (f) =>
          f.path ===
          'plugins/copilot/com.github.copilot/rules/prefer-existing-framework.instructions.md',
      ),
    ).toBe(true)
    expect(text).toContain('`rules/prefer-existing-framework.instructions.md` in this plugin')
    expect(files.some((f) => f.path === 'AGENTS.md')).toBe(false)
    const laws = issues.find((i) => i.harnessId === 'copilot' && i.concept === 'ironLaws')
    expect(laws?.support).toBe('adapted')
  })

  it('invokes workflows as skills, with no prompt file', async () => {
    const { files } = await asPlugin()
    const paths = files.map((file) => file.path)
    expect(paths).toContain('plugins/copilot/skills/write-tests/SKILL.md')
    expect(paths.some((path) => path.endsWith('.prompt.md'))).toBe(false)
    const readme = textOf(files.find((f) => f.path === 'README.md'))
    expect(readme).toContain('copilot plugin marketplace add <owner>/<repo>')
    expect(readme).toContain('copilot plugin install dotnet-testing-expert@dotnet-testing-expert')
    expect(readme).toContain('`/write-tests`')
  })

  it('gives a custom agent every law it is bound by, since there is no AGENTS.md', async () => {
    const blueprint = await withTeam()
    blueprint.targets = [{ harnessId: 'copilot', enabled: true, options: { layout: 'plugin' } }]
    const { files } = compileBlueprint(blueprint)
    const agent = textOf(
      files.find((f) => f.path === 'plugins/copilot/com.github.copilot/agents/reviewer.agent.md'),
    )
    expect(agent).toContain('## Iron Laws\n- **Never Fake Verification.**')
    expect(frontmatterOf(agent)).toMatchObject({ agents: ['researcher'] })
  })

  it('writes the MCP file the spec defines, and leaves the secret to the environment', async () => {
    const blueprint = await withMcpTool(['search'])
    blueprint.targets = [{ harnessId: 'copilot', enabled: true, options: { layout: 'plugin' } }]
    const { files, issues } = compileBlueprint(blueprint)
    const mcp = JSON.parse(textOf(files.find((f) => f.path === 'plugins/copilot/mcp.json'))) as {
      $schema: string
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(mcp.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json')
    expect(mcp.mcpServers['issue-tracker']).toEqual({
      type: 'stdio',
      command: 'issue-tracker-mcp',
      args: ['--repo', '.'],
    })
    expect(JSON.stringify(mcp)).not.toContain('ISSUE_TRACKER_TOKEN')
    const reported = issues.find(
      (i) => i.harnessId === 'copilot' && i.ref?.id === 'issue-tracker' && i.support === 'limited',
    )
    expect(reported?.message).toContain('ISSUE_TRACKER_TOKEN')
  })

  it('keeps inline hooks and drops scripted ones, saying why', async () => {
    const { files, issues } = await asPlugin((blueprint) => {
      blueprint.hooks[0]!.action = { type: 'command', script: 'exit 0', async: false }
    })
    const hooks = textOf(
      files.find((f) => f.path === 'plugins/copilot/com.github.copilot/hooks/hooks.json'),
    )
    // The gate's stop hook stays; the scripted hook has no root variable to find its file by.
    expect(hooks).toContain('agentStop')
    expect(hooks).not.toContain('postToolUse')
    expect(files.some((f) => f.path.includes('/hooks/scripts/'))).toBe(false)
    const dropped = issues.find(
      (i) => i.harnessId === 'copilot' && i.ref?.id === 'run-tests-after-change',
    )
    expect(dropped?.support).toBe('unsupported')
  })

  it('refuses a path-scoped rule named like the guide, in the plugin layout only', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.rules[0]!.id = 'guide'
    blueprint.agents[0]!.ruleIds = blueprint.agents[0]!.ruleIds.map((id) =>
      id === 'prefer-existing-framework' ? 'guide' : id,
    )
    const codes = (layout: 'project' | 'plugin') =>
      adapterFor('copilot')
        .validate(blueprint, { emitHooks: true, layout })
        .map((d) => d.code)
    expect(codes('plugin')).toContain('BP-COPILOT-003')
    expect(codes('project')).not.toContain('BP-COPILOT-003')
  })
})
