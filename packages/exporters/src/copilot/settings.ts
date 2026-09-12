/**
 * `.github/hooks/blueprint.json`, the tool allowlist and `.vscode/mcp.json`.
 *
 * Copilot's enforceable surface is narrower than it first looks. Hooks are real and
 * declarative, and a stop hook can refuse to let the agent finish, which is what makes a Gate
 * a gate. The tool allowlist on an agent file is real too, but it lists tool *categories*:
 * there is nowhere to say "this shell command yes, that one no". Per-command rules therefore
 * stay prose in `AGENTS.md`, and this module reports that rather than pretending otherwise.
 */
import type { Agent, Blueprint, Hook, IronLaw, Tool, ToolKind } from '@agent-blueprint/core'

import {
  effectiveCommand,
  executableCriteria,
  hookPrompt,
  hookScriptFile,
  hookStatusMessage,
  isCommandAction,
  type ScriptLocation,
} from '../shared/hooks'
import type { CompatibilityIssue, GeneratedFile } from '../types'

/**
 * Where hook scripts live (P9-30). Copilot documents no project-root variable, so the path
 * is relative to the repository, which is where a hook runs; the PowerShell variant runs the
 * same script through bash, which Copilot on Windows needs on the PATH.
 */
export const COPILOT_SCRIPTS: ScriptLocation = {
  dir: '.github/hooks/scripts',
  invoke: (path) => `bash ${path}`,
}

/** The script files the hooks run, for the hooks that have one (P9-30). */
export function hookScriptFiles(blueprint: Blueprint): GeneratedFile[] {
  return blueprint.hooks.flatMap((hook) => {
    const file = hookScriptFile(hook, COPILOT_SCRIPTS, 'copilot')
    return file ? [file] : []
  })
}

/** Copilot tool aliases (docs/harness/copilot.md). */
type ToolAlias = 'read' | 'edit' | 'execute' | 'search' | 'web' | 'agent' | 'todo'

const ALIAS_ORDER: ToolAlias[] = ['read', 'edit', 'search', 'execute', 'web', 'agent', 'todo']

/** Which aliases a tool kind needs. */
const ALIASES_FOR_KIND: Record<ToolKind, ToolAlias[]> = {
  filesystem: ['read', 'edit'],
  shell: ['execute'],
  git: ['execute'],
  database: ['execute'],
  browser: ['web'],
  api: ['web'],
  documentation: ['web'],
  search: ['search'],
  mcp: [],
  custom: [],
}

/** The alias each operation runs through. */
const ALIAS_BEHIND_OPERATION: Record<string, ToolAlias> = {
  'fs.read': 'read',
  'fs.write': 'edit',
  'fs.delete': 'edit',
  'shell.readonly': 'execute',
  'shell.mutating': 'execute',
  'git.read': 'execute',
  'git.commit': 'execute',
  'git.push': 'execute',
  'git.force-push': 'execute',
  'net.docs': 'web',
  'net.any': 'web',
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'copilot', concept, support, message, ...extra })

/**
 * The `tools:` list for an agent file: what its tools need, minus what its permissions deny
 * outright, plus `agent` when it has somewhere to delegate. An alias is dropped only when
 * every operation behind it is denied — denying `git.push` while allowing `git.read` still
 * needs `execute`.
 */
export function toolAliases(agent: Agent, tools: readonly Tool[], delegates: number): string[] {
  const wanted = new Set<ToolAlias>()
  const servers: string[] = []

  for (const toolId of agent.toolIds) {
    const tool = tools.find((candidate) => candidate.id === toolId)
    if (!tool) continue
    if (tool.mcp) {
      // A `server/tool` entry needs a tool name. A server whose operations the Blueprint does
      // not name cannot be written here, and is reported instead of guessed.
      for (const operation of tool.operations) servers.push(`${tool.id}/${operation}`)
      continue
    }
    for (const alias of ALIASES_FOR_KIND[tool.kind]) wanted.add(alias)
  }

  const denied = new Set<ToolAlias>()
  const survives = new Set<ToolAlias>()
  for (const [operation, decision] of Object.entries(agent.permissions.operations)) {
    const alias = ALIAS_BEHIND_OPERATION[operation]
    if (!alias) continue
    if (decision === 'deny') denied.add(alias)
    else survives.add(alias)
  }
  for (const alias of denied) if (!survives.has(alias)) wanted.delete(alias)

  if (delegates > 0) wanted.add('agent')

  return [...ALIAS_ORDER.filter((alias) => wanted.has(alias)), ...[...new Set(servers)].sort()]
}

/** MCP servers whose tool names the Blueprint does not carry, so no allowlist entry exists. */
export function unnamedMcpTools(blueprint: Blueprint): Tool[] {
  return blueprint.tools.filter((tool) => tool.mcp && tool.operations.length === 0)
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface CopilotHookHandler {
  type: 'command'
  bash: string
  powershell: string
  timeoutSec?: number
  matcher?: string
}

export interface CopilotHooksFile {
  version: 1
  hooks: Record<string, CopilotHookHandler[]>
}

/** Tool-name regex for a hook limited to certain tool kinds. */
function matcherFor(kinds: readonly ToolKind[]): string | undefined {
  const aliases = new Set<string>()
  for (const kind of kinds) for (const alias of ALIASES_FOR_KIND[kind]) aliases.add(alias)
  if (aliases.size === 0) return undefined
  return [...aliases].sort().join('|')
}

/** Copilot's events for each trigger; `undefined` where Copilot has none. */
function lowerTrigger(hook: Hook): { event: string; matcher?: string } | undefined {
  switch (hook.trigger) {
    case 'session-start':
      return { event: 'sessionStart' }
    case 'user-prompt':
      return { event: 'userPromptSubmitted' }
    case 'before-tool': {
      const matcher = matcherFor(hook.conditions.toolKinds)
      return { event: 'preToolUse', ...(matcher ? { matcher } : {}) }
    }
    case 'after-tool': {
      const matcher = matcherFor(hook.conditions.toolKinds)
      return { event: 'postToolUse', ...(matcher ? { matcher } : {}) }
    }
    case 'after-file-change':
      return { event: 'postToolUse', matcher: 'edit|write' }
    case 'before-stop':
      return { event: 'agentStop' }
    case 'subagent-stop':
      return { event: 'subagentStop' }
    case 'after-tool-failure': {
      const matcher = matcherFor(hook.conditions.toolKinds)
      return { event: 'postToolUseFailure', ...(matcher ? { matcher } : {}) }
    }
    case 'subagent-start':
      return { event: 'subagentStart' }
    case 'before-compact':
      return { event: 'preCompact' }
    case 'after-compact':
      // Copilot has no event after compaction.
      return undefined
  }
}

/** Text that has to survive both a shell single-quoted string and a JSON string. */
function plain(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/["']/g, '').trim()
}

/**
 * A stop hook that refuses the stop. Copilot reads the decision from stdout, so the command
 * runs and prints a refusal only when it failed; printing nothing means the stop is allowed.
 */
function blocking(command: string, reason: string): { bash: string; powershell: string } {
  const decision = JSON.stringify({ decision: 'block', reason: plain(reason) })
  return {
    bash: `${command} || echo '${decision}'`,
    powershell: `${command}; if ($LASTEXITCODE -ne 0) { Write-Output '${decision}' }`,
  }
}

/** Copilot has no handler shape we can generate for a model-side check; print it instead. */
function reminder(text: string): { bash: string; powershell: string } {
  const line = plain(text)
  return { bash: `echo "${line}"`, powershell: `Write-Output "${line}"` }
}

export function buildHooks(
  blueprint: Blueprint,
  laws: readonly IronLaw[],
): { file: CopilotHooksFile | undefined; issues: CompatibilityIssue[] } {
  const issues: CompatibilityIssue[] = []
  const events = new Map<string, CopilotHookHandler[]>()
  const push = (event: string, handler: CopilotHookHandler): void => {
    events.set(event, [...(events.get(event) ?? []), handler])
  }

  for (const hook of blueprint.hooks) {
    const lowered = lowerTrigger(hook)
    if (!lowered) {
      issues.push(
        issue(
          'hooks',
          'unsupported',
          `Hook "${hook.name}" runs after compaction, an event Copilot hooks do not have; it was not emitted.`,
          { ref: { kind: 'hook', id: hook.id } },
        ),
      )
      continue
    }
    const { event, matcher } = lowered
    const command = effectiveCommand(hook, COPILOT_SCRIPTS)
    if (isCommandAction(hook) && !command) continue
    if (hook.action.async) {
      issues.push(
        issue(
          'hooks',
          'limited',
          `Hook "${hook.name}" should run in the background, which Copilot hooks do not document; it runs in the foreground and the agent waits for it.`,
          { ref: { kind: 'hook', id: hook.id } },
        ),
      )
    }

    const blocks = hook.onFailure === 'block'
    const shell = command
      ? event === 'agentStop' && blocks
        ? blocking(command, hookStatusMessage(hook))
        : { bash: command, powershell: command }
      : reminder(hookPrompt(hook, laws))

    if (!command) {
      issues.push(
        issue(
          'hooks',
          'adapted',
          `Hook "${hook.name}" asks the model to check something. Copilot's prompt handler is not documented well enough to generate, so the check is printed into the session for the model to honour rather than run as one.`,
          { ref: { kind: 'hook', id: hook.id } },
        ),
      )
    }

    push(event, {
      type: 'command',
      ...shell,
      ...(hook.action.timeoutSec === undefined ? {} : { timeoutSec: hook.action.timeoutSec }),
      ...(matcher ? { matcher } : {}),
    })

    if (hook.conditions.filePatterns.length > 0) {
      issues.push(
        issue(
          'hooks',
          'limited',
          `Hook "${hook.name}" is meant for files matching ${hook.conditions.filePatterns.join(', ')}, but a Copilot matcher selects tools rather than paths, so it runs after every matching tool call and the command has to check the path itself.`,
          { ref: { kind: 'hook', id: hook.id } },
        ),
      )
    }
    if (blocks && event !== 'preToolUse' && event !== 'agentStop') {
      issues.push(
        issue(
          'hooks',
          'limited',
          `Hook "${hook.name}" should block on failure, but only \`preToolUse\` and \`agentStop\` handlers can refuse in Copilot; on \`${event}\` the failure is reported and the agent carries on.`,
          { ref: { kind: 'hook', id: hook.id } },
        ),
      )
    }
  }

  for (const gate of blueprint.gates) {
    const criteria = executableCriteria(gate)
    for (const criterion of criteria) {
      push('agentStop', {
        type: 'command',
        ...blocking(criterion.command, `${gate.name}: ${criterion.description}`),
        timeoutSec: 600,
      })
    }
    if (criteria.length === 0) {
      issues.push(
        issue(
          'gates',
          'adapted',
          `Gate "${gate.name}" has no runnable criterion, so it stays an instruction in the workflow prompt and skill.`,
          { ref: { kind: 'gate', id: gate.id } },
        ),
      )
    }
  }

  const enforced = laws.filter((law) => law.enforcement.includes('hook'))
  if (enforced.length > 0) {
    push('agentStop', {
      type: 'command',
      ...reminder(
        `Before finishing, check these Iron Laws: ${enforced.map((law) => law.name).join('; ')}.`,
      ),
    })
    issues.push(
      issue(
        'ironLaws',
        'adapted',
        'Iron Laws marked for hook enforcement are printed as a reminder when the agent stops; Copilot cannot run a model-side check from a hook.',
      ),
    )
  }

  if (events.size === 0) return { file: undefined, issues }
  return {
    file: {
      version: 1,
      hooks: Object.fromEntries([...events.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
    },
    issues,
  }
}

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

/**
 * `.vscode/mcp.json`. The cloud coding agent configures MCP in repository settings rather
 * than in a file, so this configures the editor only. `sse` is written as `http`: the VS Code
 * schema names `stdio` and `http`, and `http` is the transport that replaced SSE.
 */
export function mcpServers(blueprint: Blueprint): Record<string, Record<string, unknown>> {
  const servers: Record<string, Record<string, unknown>> = {}

  for (const tool of blueprint.tools) {
    const mcp = tool.mcp
    if (!mcp) continue
    servers[tool.id] = {
      type: mcp.transport === 'stdio' ? 'stdio' : 'http',
      ...(mcp.command ? { command: mcp.command } : {}),
      ...(mcp.args.length > 0 ? { args: [...mcp.args] } : {}),
      ...(mcp.url ? { url: mcp.url } : {}),
      // Only the names of the variables the user must set; never a value.
      ...(mcp.envVars.length > 0
        ? { env: Object.fromEntries(mcp.envVars.map((name) => [name, ''])) }
        : {}),
    }
  }

  return servers
}
