/**
 * The Codex adapter's plugin layout (P9-28).
 *
 * A Codex plugin carries skills, hooks and MCP servers, and is installed from a marketplace
 * file in a Git repository. It has no instruction file, no agent files and no config, so the
 * persona and laws become a skill, subagents and permissions are reported, and everything
 * else is the project mapping at a different root. Layout and manifest fields:
 * docs/harness/codex.md, "Plugin layout".
 *
 * ```
 * .agents/plugins/marketplace.json         the marketplace listing this one plugin
 * plugins/codex/
 *   .codex-plugin/plugin.json              name = Blueprint id, version = Blueprint version
 *   skills/guide/SKILL.md                  the composed instructions, as the skill to read first
 *   skills/guide/references/<id>.md        references attached only to agents
 *   skills/<id>/SKILL.md + agents/openai.yaml
 *   hooks/hooks.json
 *   .mcp.json
 * ```
 */
import type { Blueprint } from '@agent-blueprint/core'
import { stableJson } from '@agent-blueprint/core'

import { markdownWithFrontmatter } from '../shared/frontmatter'
import { composeInstructions, lawsForAgent, primaryAgentOf } from '../shared/instructions'
import { firstSentence } from '../shared/markdown'
import { type Phrasing, SHARED_PHRASING } from '../shared/phrasing'
import { commandPolicySection, emitPortableSkillSet } from '../shared/portable'
import {
  type CompatibilityIssue,
  type CompileResult,
  generatedFile,
  type GeneratedFile,
} from '../types'
import { buildHooks } from './config'
import { openAiSidecar } from './sidecar'

export const CODEX_PLUGIN_ROOT = 'plugins/codex'
export const CODEX_MARKETPLACE_FILE = '.agents/plugins/marketplace.json'
/** The skill that carries what `AGENTS.md` would have. */
export const GUIDE_SKILL_ID = 'guide'

/**
 * Codex qualifies a plugin's skills by the plugin name, and a plugin installs no subagents,
 * so a delegating step asks the session to adopt the persona instead.
 */
export function codexPluginPhrasing(pluginName: string): Phrasing {
  return {
    ...SHARED_PHRASING,
    id: 'codex',
    supportsDelegation: false,
    delegate: (agentId) => `Adopt the \`${agentId}\` persona for this step`,
    invokeSkill: (skillId) => `Apply the \`$${pluginName}:${skillId}\` skill`,
    workflowInvocation: (workflowId) => `$${pluginName}:${workflowId}`,
  }
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'codex', concept, support, message, ...extra })

/** What `codex plugin marketplace add <owner>/<repo>` reads. */
export function codexMarketplaceFile(blueprint: Blueprint): GeneratedFile {
  const listing = {
    name: blueprint.id,
    interface: { displayName: blueprint.name },
    plugins: [
      {
        name: blueprint.id,
        source: { source: 'local', path: `./${CODEX_PLUGIN_ROOT}` },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Development',
      },
    ],
  }
  return generatedFile(CODEX_MARKETPLACE_FILE, stableJson(listing), 'json', 'codex', [])
}

export function compileCodexPlugin(blueprint: Blueprint): CompileResult {
  const files: GeneratedFile[] = []
  const issues: CompatibilityIssue[] = []
  const primary = primaryAgentOf(blueprint)
  const phrasing = codexPluginPhrasing(blueprint.id)
  const skillsRoot = `${CODEX_PLUGIN_ROOT}/skills`

  // --- The guide: what AGENTS.md would have carried, as the skill to read first -------------
  const policy = commandPolicySection(primary)
  const instructions = composeInstructions(blueprint, {
    phrasing,
    sourcePath: 'blueprint/',
    nativePathScopedRules: false,
    memoryNative: false,
    referenceLink: (referenceId) => `(\`references/${referenceId}.md\` beside this skill)`,
    ...(policy ? { extraSections: [{ title: 'Command policy', body: policy }] } : {}),
  })
  files.push(
    generatedFile(
      `${skillsRoot}/${GUIDE_SKILL_ID}/SKILL.md`,
      markdownWithFrontmatter(
        {
          name: GUIDE_SKILL_ID,
          description: `Read first: who ${blueprint.name} is, what it must never do, and how its work is organised.`,
        },
        // The composer's own header line comes first; the frontmatter needs to be above it.
        instructions.content.replace(/^<!-- Generated[^\n]*\n\n?/, ''),
        'blueprint/',
      ),
      'markdown',
      'codex',
      [...(primary ? [{ kind: 'agent' as const, id: primary.id }] : [])],
    ),
  )
  files.push(
    openAiSidecar(
      GUIDE_SKILL_ID,
      `${blueprint.name} guide`,
      `Who ${blueprint.name} is and what it must never do.`,
      'codex',
      skillsRoot,
    ),
  )
  issues.push(
    issue(
      'ironLaws',
      'adapted',
      `A Codex plugin has no instruction file. The persona, Iron Laws and rules are the \`$${blueprint.id}:${GUIDE_SKILL_ID}\` skill, which the model loads when asked or when the description matches, rather than always.`,
      { adaptation: `${skillsRoot}/${GUIDE_SKILL_ID}/SKILL.md` },
    ),
  )

  // --- Skills and workflows, the portable way, at the plugin's root ------------------------
  const skillSet = emitPortableSkillSet(blueprint, {
    root: skillsRoot,
    owner: 'codex',
    referencesDir: `${skillsRoot}/${GUIDE_SKILL_ID}/references`,
    phrasing,
  })
  files.push(...skillSet.files)
  for (const warning of skillSet.warnings) {
    issues.push(
      issue('skills', 'limited', warning.message, { ref: { kind: 'skill', id: warning.skillId } }),
    )
  }
  for (const skill of blueprint.skills) {
    files.push(openAiSidecar(skill.id, skill.name, skill.description, 'codex', skillsRoot))
  }
  for (const workflow of blueprint.workflows) {
    files.push(openAiSidecar(workflow.id, workflow.name, workflow.description, 'codex', skillsRoot))
    issues.push(
      issue(
        'workflows',
        'adapted',
        `Workflow "${workflow.name}" is compiled to an orchestration skill invoked with $${blueprint.id}:${workflow.id}.`,
        {
          ref: { kind: 'workflow', id: workflow.id },
          adaptation: `${skillsRoot}/${workflow.id}/SKILL.md`,
        },
      ),
    )
  }
  for (const rule of blueprint.rules) {
    if (rule.paths.length === 0) continue
    issues.push(
      issue(
        'pathScopedRules',
        'adapted',
        `Rule "${rule.name}" applies to ${rule.paths.join(', ')}; a plugin has no nested AGENTS.md, so it is in the guide skill with an "Applies to" note.`,
        { ref: { kind: 'rule', id: rule.id } },
      ),
    )
  }

  // --- Hooks: inline commands only; a plugin's root has no documented variable ------------
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
        `Hook "${hook.name}" runs a script, and Codex documents no variable a plugin's hook could reach its own files by; the hook was not emitted.`,
        { ref: { kind: 'hook', id: hook.id } },
      ),
    )
  }
  const hooks = buildHooks(withoutScripts, lawsForAgent(blueprint, primary?.id))
  issues.push(...hooks.issues)
  if (hooks.hooks) {
    files.push(
      generatedFile(
        `${CODEX_PLUGIN_ROOT}/hooks/hooks.json`,
        stableJson({ hooks: hooks.hooks }),
        'json',
        'codex',
        [],
      ),
    )
  }

  // --- MCP servers: names of variables, never values -----------------------------------------
  const mcpTools = blueprint.tools.filter((tool) => tool.mcp)
  if (mcpTools.length > 0) {
    const servers = Object.fromEntries(
      mcpTools.map((tool) => [
        tool.id,
        {
          ...(tool.mcp?.command ? { command: tool.mcp.command } : {}),
          ...(tool.mcp?.args.length ? { args: tool.mcp.args } : {}),
          ...(tool.mcp?.url ? { url: tool.mcp.url } : {}),
          ...(tool.mcp?.envVars.length
            ? { env: Object.fromEntries(tool.mcp.envVars.map((name) => [name, ''])) }
            : {}),
        },
      ]),
    )
    files.push(
      generatedFile(
        `${CODEX_PLUGIN_ROOT}/.mcp.json`,
        stableJson({ mcpServers: servers }),
        'json',
        'codex',
        mcpTools.map((tool) => ({ kind: 'tool' as const, id: tool.id })),
      ),
    )
  }

  // --- The manifest and the marketplace --------------------------------------------------
  const manifest = {
    name: blueprint.id,
    version: blueprint.version,
    ...(blueprint.description ? { description: blueprint.description } : {}),
    skills: './skills/',
    interface: {
      displayName: blueprint.name,
      shortDescription: firstSentence(blueprint.description) || blueprint.name,
    },
  }
  files.push(
    generatedFile(
      `${CODEX_PLUGIN_ROOT}/.codex-plugin/plugin.json`,
      stableJson(manifest),
      'json',
      'codex',
      [],
    ),
  )
  files.push(codexMarketplaceFile(blueprint))

  // --- What a Codex plugin cannot carry ----------------------------------------------------
  const subagents = blueprint.agents.filter((agent) => agent.id !== primary?.id)
  for (const agent of subagents) {
    issues.push(
      issue(
        'agents',
        'unsupported',
        `Agent "${agent.name}" is not in the plugin: a Codex plugin installs no subagents. Steps that delegate to it ask the session to adopt its persona.`,
        { ref: { kind: 'agent', id: agent.id } },
      ),
    )
  }
  if (
    primary &&
    Object.keys(primary.permissions.operations).length + primary.permissions.patterns.length > 0
  ) {
    issues.push(
      issue(
        'permissions',
        'unsupported',
        `The permissions of "${primary.name}" are not in the plugin: a Codex plugin carries no config. They are the command policy in the guide skill; the session's own sandbox and approval policy apply.`,
        { ref: { kind: 'agent', id: primary.id } },
      ),
    )
  }
  if (blueprint.memories.some((memory) => memory.scope !== 'stateless')) {
    issues.push(
      issue(
        'memory',
        'unsupported',
        'A Codex plugin cannot turn the memories feature on; the seed is in the guide skill.',
      ),
    )
  }

  return { files, issues }
}
