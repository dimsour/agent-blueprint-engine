/**
 * The Claude Code adapter's plugin layout (P9-27).
 *
 * A project layout is picked up by opening the repository; a plugin is installed from a
 * marketplace and follows the user into every project. The two carry the same skills, agents,
 * hooks and MCP servers, but a plugin has no `CLAUDE.md`, no `.claude/rules/` and no
 * permission lists — its `settings.json` accepts two unrelated keys — so what those carried
 * goes somewhere else here, and what cannot go anywhere is reported. Layout and manifest
 * fields: docs/harness/claude-code.md, "Plugin layout".
 *
 * ```
 * .claude-plugin/marketplace.json          the marketplace listing this one plugin
 * plugins/claude-code/
 *   .claude-plugin/plugin.json             name = Blueprint id, version = Blueprint version
 *   instructions.md                        the composed instructions, injected at SessionStart
 *   skills/<id>/SKILL.md                   skills, workflows, and one skill per path-scoped rule
 *   agents/<id>.md                         subagents, carrying every law that binds them
 *   hooks/hooks.json, hooks/scripts/<id>.sh
 *   references/<id>.md
 *   .mcp.json                              env values as `${user_config.<VAR>}`
 * ```
 */
import type { Blueprint, Rule } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'

import { type Frontmatter, markdownWithFrontmatter } from '../shared/frontmatter'
import { type ScriptLocation } from '../shared/hooks'
import { composeInstructions, lawsForAgent, primaryAgentOf } from '../shared/instructions'
import { type Phrasing } from '../shared/phrasing'
import { emitSkillDir, renderReference } from '../shared/skill-dir'
import { emitWorkflowSkill } from '../shared/workflow-skill'
import {
  type CompatibilityIssue,
  type CompileResult,
  generatedFile,
  type GeneratedFile,
} from '../types'
import { agentFile, skillFrontmatter, toolNames } from './emit'
import type { ClaudeCodeOptions } from './options'
import { hookScriptFiles, lowerHooks } from './settings'

export const PLUGIN_ROOT = 'plugins/claude-code'
export const MARKETPLACE_FILE = '.claude-plugin/marketplace.json'

/** Where a plugin keeps its hook scripts, and the variable Claude resolves to its directory. */
export const PLUGIN_SCRIPTS: ScriptLocation = {
  dir: `${PLUGIN_ROOT}/hooks/scripts`,
  invoke: (path) => `bash "\${CLAUDE_PLUGIN_ROOT}/${path.slice(PLUGIN_ROOT.length + 1)}"`,
}

/**
 * Inside a plugin every skill and agent is namespaced by the plugin's name, so the
 * instructions have to say `/name:workflow`, not `/workflow`.
 */
export function pluginPhrasing(pluginName: string): Phrasing {
  return {
    id: 'claude-code',
    supportsDelegation: true,
    delegate: (agentId) => `Use the Agent tool to run the \`${pluginName}:${agentId}\` subagent`,
    invokeSkill: (skillId) => `Apply the \`${pluginName}:${skillId}\` skill`,
    workflowInvocation: (workflowId) => `/${pluginName}:${workflowId}`,
  }
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'claude-code', concept, support, message, ...extra })

/** A path-scoped rule as a skill: `paths:` lazy-loads it exactly as `.claude/rules/` would. */
function ruleSkill(rule: Rule): GeneratedFile {
  const frontmatter: Frontmatter = {
    name: `rule-${rule.id}`,
    description: rule.description ?? rule.guidance,
    paths: rule.paths,
    'user-invocable': false,
  }
  const body = [`# ${rule.name}`, rule.guidance, rule.body].filter(Boolean).join('\n\n')
  return generatedFile(
    `${PLUGIN_ROOT}/skills/rule-${rule.id}/SKILL.md`,
    markdownWithFrontmatter(frontmatter, body, `blueprint/rules/${rule.id}.md`),
    'markdown',
    'claude-code',
    [{ kind: 'rule', id: rule.id }],
  )
}

/**
 * The marketplace that lists the plugin: what `/plugin marketplace add <owner>/<repo>` reads.
 * Its name is the Blueprint's id, so the install command is `/plugin install <id>@<id>`.
 */
export function marketplaceFile(blueprint: Blueprint): GeneratedFile {
  const listing = {
    name: blueprint.id,
    owner: { name: blueprint.name },
    metadata: {
      ...(blueprint.description ? { description: blueprint.description } : {}),
      version: blueprint.version,
      pluginRoot: './plugins',
    },
    plugins: [
      {
        name: blueprint.id,
        source: './plugins/claude-code',
        ...(blueprint.description ? { description: blueprint.description } : {}),
        version: blueprint.version,
      },
    ],
  }
  return generatedFile(MARKETPLACE_FILE, stableJson(listing), 'json', 'claude-code', [])
}

export function compilePlugin(blueprint: Blueprint, options: ClaudeCodeOptions): CompileResult {
  const files: GeneratedFile[] = []
  const issues: CompatibilityIssue[] = []
  const primary = primaryAgentOf(blueprint)
  const phrasing = pluginPhrasing(blueprint.id)
  const subagents = blueprint.agents.filter((agent) => agent.id !== primary?.id)
  const mcpTools = blueprint.tools.filter((tool) => tool.mcp)
  const envVars = [...new Set(mcpTools.flatMap((tool) => tool.mcp?.envVars ?? []))].sort()

  // --- The instructions, and the hook that puts them in front of the model -----------------
  const looseReferences = blueprint.references.filter(
    (reference) => !blueprint.skills.some((skill) => skill.referenceIds.includes(reference.id)),
  )
  const instructions = composeInstructions(blueprint, {
    phrasing,
    sourcePath: 'blueprint/',
    nativePathScopedRules: true,
    pathScopedRuleLocation: (ruleId) => `the \`${blueprint.id}:rule-${ruleId}\` skill`,
    memoryNative: false,
    referenceLink: (referenceId) => `(\`references/${referenceId}.md\` in this plugin)`,
  })
  files.push(
    generatedFile(
      `${PLUGIN_ROOT}/instructions.md`,
      instructions.content,
      'markdown',
      'claude-code',
      [...(primary ? [{ kind: 'agent' as const, id: primary.id }] : [])],
    ),
  )
  issues.push(
    issue(
      'ironLaws',
      'adapted',
      'A plugin has no instruction file. The persona, Iron Laws and rules are in `instructions.md`, which a SessionStart hook prints into the session; a subagent gets its laws in its own file.',
      { adaptation: `${PLUGIN_ROOT}/instructions.md` },
    ),
  )

  for (const rule of blueprint.rules) {
    if (rule.paths.length > 0) files.push(ruleSkill(rule))
  }

  // --- Skills and workflows ----------------------------------------------------------------
  const skillsRoot = `${PLUGIN_ROOT}/skills`
  for (const skill of blueprint.skills) {
    const result = emitSkillDir(skill, blueprint, {
      root: skillsRoot,
      owner: 'claude-code',
      extraFrontmatter: skillFrontmatter(skill),
      allowedTools: toolNames(skill.allowedToolIds, blueprint),
    })
    files.push(...result.files)
    for (const warning of result.warnings) {
      issues.push(issue('skills', 'limited', warning, { ref: { kind: 'skill', id: skill.id } }))
    }
  }
  for (const workflow of blueprint.workflows) {
    const { body, notes } = emitWorkflowSkill(workflow, blueprint, phrasing)
    const frontmatter: Frontmatter = {
      name: workflow.id,
      description: workflow.description ?? workflow.name,
      'user-invocable': true,
      ...(workflow.argumentHint ? { 'argument-hint': workflow.argumentHint } : {}),
    }
    files.push(
      generatedFile(
        `${skillsRoot}/${workflow.id}/SKILL.md`,
        markdownWithFrontmatter(frontmatter, body, `blueprint/workflows/${workflow.id}.md`),
        'markdown',
        'claude-code',
        [{ kind: 'workflow', id: workflow.id }],
      ),
    )
    issues.push(
      issue(
        'workflows',
        'adapted',
        `Workflow "${workflow.name}" is compiled to an orchestration skill, invoked as /${blueprint.id}:${workflow.id}; Claude Code has no workflow engine, so the steps are instructions rather than enforced control flow.`,
        {
          ref: { kind: 'workflow', id: workflow.id },
          adaptation: `${skillsRoot}/${workflow.id}/SKILL.md`,
        },
      ),
    )
    for (const note of notes) {
      issues.push(
        issue('workflows', 'limited', note.message, { ref: { kind: 'workflow', id: workflow.id } }),
      )
    }
  }

  // --- Agents ------------------------------------------------------------------------------
  for (const agent of subagents) {
    // No CLAUDE.md means no global laws unless the agent file carries them itself.
    files.push(
      agentFile(agent, blueprint, options, { root: `${PLUGIN_ROOT}/agents`, allLaws: true }),
    )
  }

  // --- Hooks -------------------------------------------------------------------------------
  const laws = lawsForAgent(blueprint, primary?.id)
  const lowered = lowerHooks(blueprint, laws, PLUGIN_SCRIPTS)
  issues.push(...lowered.issues)
  const hooks = { ...(lowered.hooks ?? {}) }
  // The instructions reach the model through SessionStart: the harness adds a hook's stdout
  // to the context on that event, which is the one door a plugin has into every session.
  hooks.SessionStart = [
    ...(hooks.SessionStart ?? []),
    {
      hooks: [
        {
          type: 'command' as const,
          command: 'cat "${CLAUDE_PLUGIN_ROOT}/instructions.md"',
          statusMessage: `Loading the ${blueprint.name} instructions`,
        },
      ],
    },
  ]
  const events = Object.fromEntries(Object.entries(hooks).sort(([a], [b]) => (a < b ? -1 : 1)))
  files.push(
    generatedFile(
      `${PLUGIN_ROOT}/hooks/hooks.json`,
      stableJson({ hooks: events }),
      'json',
      'claude-code',
      [],
    ),
  )
  files.push(...hookScriptFiles(blueprint, PLUGIN_SCRIPTS))

  // --- References --------------------------------------------------------------------------
  for (const reference of looseReferences) {
    files.push(
      generatedFile(
        `${PLUGIN_ROOT}/references/${reference.id}.md`,
        renderReference(reference),
        'markdown',
        'claude-code',
        [{ kind: 'reference', id: reference.id }],
      ),
    )
  }

  // --- MCP servers, with their secrets asked for at enable time ----------------------------
  if (mcpTools.length > 0) {
    const servers = Object.fromEntries(
      mcpTools.map((tool) => [
        tool.id,
        {
          ...(tool.mcp?.command ? { command: tool.mcp.command } : {}),
          ...(tool.mcp?.args.length ? { args: tool.mcp.args } : {}),
          ...(tool.mcp?.url ? { url: tool.mcp.url } : {}),
          // The value is whatever the user gave the plugin when enabling it; it lives in
          // Claude's secure storage and never in this repository.
          ...(tool.mcp?.envVars.length
            ? {
                env: Object.fromEntries(
                  tool.mcp.envVars.map((name) => [name, `\${user_config.${name}}`]),
                ),
              }
            : {}),
        },
      ]),
    )
    files.push(
      generatedFile(
        `${PLUGIN_ROOT}/.mcp.json`,
        stableJson({ mcpServers: servers }),
        'json',
        'claude-code',
        mcpTools.map((tool) => ({ kind: 'tool' as const, id: tool.id })),
      ),
    )
  }

  // --- The manifest ------------------------------------------------------------------------
  const manifest = {
    name: blueprint.id,
    version: blueprint.version,
    ...(blueprint.description ? { description: blueprint.description } : {}),
    ...(envVars.length > 0
      ? {
          userConfig: Object.fromEntries(
            envVars.map((name) => [
              name,
              {
                type: 'string',
                title: name,
                description: `Value of ${name} for ${mcpTools
                  .filter((tool) => tool.mcp?.envVars.includes(name))
                  .map((tool) => tool.name)
                  .join(', ')}.`,
                sensitive: true,
              },
            ]),
          ),
        }
      : {}),
  }
  files.push(
    generatedFile(
      `${PLUGIN_ROOT}/.claude-plugin/plugin.json`,
      stableJson(manifest),
      'json',
      'claude-code',
      [],
    ),
  )
  files.push(marketplaceFile(blueprint))

  // --- What a plugin cannot carry ----------------------------------------------------------
  if (
    primary &&
    Object.keys(primary.permissions.operations).length + primary.permissions.patterns.length > 0
  ) {
    issues.push(
      issue(
        'permissions',
        'unsupported',
        `The permissions of "${primary.name}" are not in the plugin: a plugin's settings file accepts no permission lists. They are described in instructions.md; the project that installs the plugin decides what is allowed.`,
        { ref: { kind: 'agent', id: primary.id } },
      ),
    )
  }
  if (blueprint.memories.some((memory) => memory.scope !== 'stateless')) {
    issues.push(
      issue(
        'memory',
        'limited',
        'A plugin cannot turn auto-memory on; the memory seed is in instructions.md and the project that installs the plugin decides whether Claude remembers.',
      ),
    )
  }

  return { files, issues }
}
