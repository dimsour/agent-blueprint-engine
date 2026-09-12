/**
 * The Copilot adapter's plugin layout (P9-36).
 *
 * A Copilot plugin is an Agent Plugins 1.0 package: a root `plugin.json` that declares the
 * spec's `$schema`, portable skills under `skills/` and MCP servers in `mcp.json`, and
 * Copilot's own components under `com.github.copilot/` — agents, rules and hooks. It is
 * installed from a marketplace file in a Git repository. It has no `AGENTS.md`, so the
 * persona and laws become a rule file that applies to every path; everything else is the
 * project mapping at a different root. Layout and manifest fields: docs/harness/copilot.md,
 * "Plugin layout".
 *
 * ```
 * .github/plugin/marketplace.json          the marketplace listing this one plugin
 * plugins/copilot/
 *   plugin.json                            $schema, name = Blueprint id, version, description
 *   skills/<id>/SKILL.md                   skills and workflows, as in the portable tree
 *   references/<id>.md                     references attached only to agents
 *   mcp.json                               servers with the spec's $schema; no env values
 *   com.github.copilot/
 *     agents/<id>.agent.md                 custom agents, carrying every law that binds them
 *     rules/guide.instructions.md          the composed instructions, applyTo "**"
 *     rules/<id>.instructions.md           one per path-scoped rule
 *     hooks/hooks.json                     hooks with inline commands, gates, the law reminder
 * ```
 */
import type { Blueprint } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'

import { type Frontmatter, markdownWithFrontmatter } from '../shared/frontmatter'
import { composeInstructions, lawsForAgent, primaryAgentOf } from '../shared/instructions'
import { type Phrasing, SHARED_PHRASING } from '../shared/phrasing'
import { commandPolicySection, emitPortableSkillSet } from '../shared/portable'
import { renderReference } from '../shared/skill-dir'
import {
  type CompatibilityIssue,
  type CompileResult,
  generatedFile,
  type GeneratedFile,
} from '../types'
import { agentFile, agentIssues, instructionFile } from './emit'
import type { CopilotOptions } from './options'
import { buildHooks, unnamedMcpTools } from './settings'

export const COPILOT_PLUGIN_ROOT = 'plugins/copilot'
export const COPILOT_MARKETPLACE_FILE = '.github/plugin/marketplace.json'
/** The directory Copilot reads its own components from in an Agent Plugins 1.0 package. */
export const COPILOT_COMPONENTS = `${COPILOT_PLUGIN_ROOT}/com.github.copilot`
/** The rule file that carries what `AGENTS.md` would have. */
export const GUIDE_RULE_ID = 'guide'

const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'

/**
 * Copilot invokes every skill as `/<name>`, plugin or not, and hands off to custom agents
 * by name, so the plugin's instructions read as the project's do apart from the workflow
 * command.
 */
export const COPILOT_PLUGIN_PHRASING: Phrasing = {
  ...SHARED_PHRASING,
  id: 'copilot',
  workflowInvocation: (workflowId) => `/${workflowId}`,
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'copilot', concept, support, message, ...extra })

/** Where a marketplace install puts the plugin, per the CLI plugin reference. */
export function installedPluginDir(blueprint: Blueprint): string {
  return `~/.copilot/installed-plugins/${blueprint.id}/${blueprint.id}`
}

/** What `copilot plugin marketplace add <owner>/<repo>` reads. */
export function copilotMarketplaceFile(blueprint: Blueprint): GeneratedFile {
  const listing = {
    name: blueprint.id,
    owner: { name: blueprint.name },
    metadata: {
      ...(blueprint.description ? { description: blueprint.description } : {}),
      version: blueprint.version,
    },
    plugins: [
      {
        name: blueprint.id,
        ...(blueprint.description ? { description: blueprint.description } : {}),
        version: blueprint.version,
        source: `./${COPILOT_PLUGIN_ROOT}`,
      },
    ],
  }
  return generatedFile(COPILOT_MARKETPLACE_FILE, stableJson(listing), 'json', 'copilot', [])
}

export function compileCopilotPlugin(blueprint: Blueprint, options: CopilotOptions): CompileResult {
  const files: GeneratedFile[] = []
  const issues: CompatibilityIssue[] = []
  const primary = primaryAgentOf(blueprint)
  const subagents = blueprint.agents.filter((agent) => agent.id !== primary?.id)
  const skillsRoot = `${COPILOT_PLUGIN_ROOT}/skills`
  const rulesDir = `${COPILOT_COMPONENTS}/rules`
  const guideFile = `${rulesDir}/${GUIDE_RULE_ID}.instructions.md`

  // --- The guide: what AGENTS.md would have carried, as a rule that applies everywhere ------
  const policy = commandPolicySection(primary)
  const instructions = composeInstructions(blueprint, {
    phrasing: COPILOT_PLUGIN_PHRASING,
    sourcePath: 'blueprint/',
    nativePathScopedRules: true,
    pathScopedRuleLocation: (ruleId) => `\`rules/${ruleId}.instructions.md\` in this plugin`,
    memoryNative: false,
    referenceLink: (referenceId) =>
      `(\`references/${referenceId}.md\` in this plugin, installed at \`${installedPluginDir(blueprint)}/\`)`,
    ...(policy ? { extraSections: [{ title: 'Command policy', body: policy }] } : {}),
  })
  const guideFrontmatter: Frontmatter = {
    name: blueprint.name,
    description: `Who ${blueprint.name} is, what it must never do, and how its work is organised.`,
    applyTo: '**',
  }
  files.push(
    generatedFile(
      guideFile,
      markdownWithFrontmatter(
        guideFrontmatter,
        // The composer's own header line comes first; the frontmatter needs to be above it.
        instructions.content.replace(/^<!-- Generated[^\n]*\n\n?/, ''),
        'blueprint/',
      ),
      'markdown',
      'copilot',
      [...(primary ? [{ kind: 'agent' as const, id: primary.id }] : [])],
    ),
  )
  issues.push(
    issue(
      'ironLaws',
      'adapted',
      `A plugin has no AGENTS.md. The persona, Iron Laws and rules are the instruction file ${GUIDE_RULE_ID}.instructions.md in the plugin, which applies to every path.`,
      { adaptation: guideFile },
    ),
  )
  for (const rule of blueprint.rules) {
    if (rule.paths.length > 0) files.push(instructionFile(rule, rulesDir))
  }

  // --- Skills and workflows, the portable way, at the plugin's root ------------------------
  const skillSet = emitPortableSkillSet(blueprint, {
    root: skillsRoot,
    owner: 'copilot',
    phrasing: COPILOT_PLUGIN_PHRASING,
  })
  files.push(...skillSet.files)
  for (const warning of skillSet.warnings) {
    issues.push(
      issue('skills', 'limited', warning.message, { ref: { kind: 'skill', id: warning.skillId } }),
    )
  }
  for (const workflow of blueprint.workflows) {
    issues.push(
      issue(
        'workflows',
        'adapted',
        `Workflow "${workflow.name}" is compiled to an orchestration skill invoked with /${workflow.id}; Copilot has no workflow engine, so the steps are instructions rather than enforced control flow.`,
        {
          ref: { kind: 'workflow', id: workflow.id },
          adaptation: `${skillsRoot}/${workflow.id}/SKILL.md`,
        },
      ),
    )
  }
  const looseReferences = blueprint.references.filter(
    (reference) => !blueprint.skills.some((skill) => skill.referenceIds.includes(reference.id)),
  )
  for (const reference of looseReferences) {
    files.push(
      generatedFile(
        `${COPILOT_PLUGIN_ROOT}/references/${reference.id}.md`,
        renderReference(reference),
        'markdown',
        'copilot',
        [{ kind: 'reference', id: reference.id }],
      ),
    )
  }

  // --- Agents ------------------------------------------------------------------------------
  for (const agent of subagents) {
    // No AGENTS.md means no global laws unless the agent file carries them itself.
    files.push(
      agentFile(agent, blueprint, primary?.id, {
        root: `${COPILOT_COMPONENTS}/agents`,
        allLaws: true,
      }),
    )
  }

  // --- Hooks: inline commands only; a plugin's hook has no documented root variable -------
  if (options.emitHooks) {
    const scripted = blueprint.hooks.filter((hook) => hook.action.script)
    const withoutScripts: Blueprint = {
      ...blueprint,
      hooks: blueprint.hooks.filter((hook) => !hook.action.script),
    }
    for (const hook of scripted) {
      issues.push(
        issue(
          'hooks',
          'unsupported',
          `Hook "${hook.name}" runs a script, and Copilot documents PLUGIN_ROOT for a plugin's MCP and LSP servers but not for its hooks; the hook was not emitted.`,
          { ref: { kind: 'hook', id: hook.id } },
        ),
      )
    }
    const hooks = buildHooks(withoutScripts, lawsForAgent(blueprint, primary?.id))
    issues.push(...hooks.issues)
    if (hooks.file) {
      files.push(
        generatedFile(
          `${COPILOT_COMPONENTS}/hooks/hooks.json`,
          stableJson(hooks.file),
          'json',
          'copilot',
          [],
        ),
      )
    }
  }

  // --- MCP servers: the spec's file, with no place for a secret ---------------------------
  const mcpTools = blueprint.tools.filter((tool) => tool.mcp)
  if (mcpTools.length > 0) {
    const servers = Object.fromEntries(
      mcpTools.map((tool) => [
        tool.id,
        {
          type:
            tool.mcp?.transport === 'stdio'
              ? 'stdio'
              : tool.mcp?.transport === 'sse'
                ? 'sse'
                : 'streamable-http',
          ...(tool.mcp?.command ? { command: tool.mcp.command } : {}),
          ...(tool.mcp?.args.length ? { args: tool.mcp.args } : {}),
          ...(tool.mcp?.url ? { url: tool.mcp.url } : {}),
        },
      ]),
    )
    files.push(
      generatedFile(
        `${COPILOT_PLUGIN_ROOT}/mcp.json`,
        stableJson({ $schema: MCP_SCHEMA, mcpServers: servers }),
        'json',
        'copilot',
        mcpTools.map((tool) => ({ kind: 'tool' as const, id: tool.id })),
      ),
    )
    for (const tool of mcpTools) {
      if (!tool.mcp?.envVars.length) continue
      issues.push(
        issue(
          'permissions',
          'limited',
          `"${tool.name}" needs ${tool.mcp.envVars.join(', ')}. A plugin's mcp.json carries literal env values only and a secret never goes in the repository, so the variable(s) have to be set in the environment Copilot runs in.`,
          { ref: { kind: 'tool', id: tool.id } },
        ),
      )
    }
  }
  for (const tool of unnamedMcpTools(blueprint)) {
    issues.push(
      issue(
        'permissions',
        'limited',
        `A Copilot tool allowlist names MCP tools as \`server/tool\`, and "${tool.name}" does not list the operations it offers, so it cannot be allowed by name. Add its operations to the tool, or widen the allowlist by hand.`,
        { ref: { kind: 'tool', id: tool.id } },
      ),
    )
  }

  // --- The manifest and the marketplace --------------------------------------------------
  const manifest = {
    $schema: PLUGIN_SCHEMA,
    name: blueprint.id,
    version: blueprint.version,
    ...(blueprint.description ? { description: blueprint.description } : {}),
  }
  files.push(
    generatedFile(
      `${COPILOT_PLUGIN_ROOT}/plugin.json`,
      stableJson(manifest),
      'json',
      'copilot',
      [],
    ),
  )
  files.push(copilotMarketplaceFile(blueprint))

  // --- What Copilot cannot carry, in either layout ------------------------------------------
  if (blueprint.memories.length > 0) {
    issues.push(
      issue(
        'memory',
        'unsupported',
        `Copilot has no persistent memory. The ${blueprint.memories.length} memory definition(s) are compiled into the guide rule as instructions to write notes into the repository instead.`,
        { adaptation: `${guideFile} "Memory" section` },
      ),
    )
  }
  issues.push(...agentIssues(blueprint, `${GUIDE_RULE_ID}.instructions.md`))

  return { files, issues }
}
