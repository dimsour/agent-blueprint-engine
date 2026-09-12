/**
 * `.codex/config.toml` and `.codex/hooks.json`.
 *
 * Codex permissions are global and coarse: one sandbox mode and one approval policy for the
 * whole session. Per-command rules cannot be enforced, so they are lowered to the sandbox
 * setting that is closest without being more permissive, and the exact intent is written
 * into `AGENTS.md` as a command policy the agent can still follow.
 */
import type { Agent, Blueprint, Hook, IronLaw } from '@agent-blueprint/core'

import {
  effectiveCommand,
  executableCriteria,
  failing,
  failureOutcomeOf,
  gateFailureOutcomeOf,
  hookEnforcedLaws,
  hookScriptFile,
  hookStatusMessage,
  isCommandAction,
  type ScriptLocation,
} from '../shared/hooks'
import type { TomlTable } from '../shared/toml'
import type { CompatibilityIssue, GeneratedFile } from '../types'

export interface CodexHookHandler {
  type: 'command'
  command: string
  timeout?: number
  statusMessage?: string
  async?: boolean
}

export interface CodexHookEntry {
  matcher?: string
  hooks: CodexHookHandler[]
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'codex', concept, support, message, ...extra })

/** Codex's events for each trigger; `undefined` where Codex has none. */
export function lowerTrigger(hook: Hook): { event: string; matcher?: string } | undefined {
  switch (hook.trigger) {
    case 'session-start':
      return { event: 'SessionStart', matcher: 'startup' }
    case 'user-prompt':
      return { event: 'UserPromptSubmit' }
    case 'before-tool':
      return { event: 'PreToolUse' }
    case 'after-tool':
    case 'after-file-change':
      return { event: 'PostToolUse' }
    case 'before-stop':
      return { event: 'Stop' }
    case 'subagent-stop':
      return { event: 'SubagentStop' }
    case 'subagent-start':
      return { event: 'SubagentStart' }
    case 'before-compact':
      return { event: 'PreCompact' }
    case 'after-compact':
      return { event: 'PostCompact' }
    case 'after-tool-failure':
      // Codex has no event for a failed tool call.
      return undefined
  }
}

/** Codex has no prompt handler, so a check becomes a one-line reminder on stdout. */
function reminderCommand(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').replace(/"/g, "'").trim()
  return `echo "${singleLine}"`
}

/**
 * Where hook scripts live (P9-30). Codex documents no variable for the project root, so the
 * path is relative to it, which is where Codex runs a hook from.
 */
export const CODEX_SCRIPTS: ScriptLocation = {
  dir: '.codex/hooks',
  invoke: (path) => `bash ${path}`,
}

/** The script files the hooks run, for the hooks that have one (P9-30). */
export function hookScriptFiles(
  blueprint: Blueprint,
  scripts: ScriptLocation = CODEX_SCRIPTS,
): GeneratedFile[] {
  return blueprint.hooks.flatMap((hook) => {
    const file = hookScriptFile(hook, scripts, 'codex')
    return file ? [file] : []
  })
}

export function buildHooks(
  blueprint: Blueprint,
  laws: IronLaw[],
  scripts: ScriptLocation = CODEX_SCRIPTS,
): { hooks: Record<string, CodexHookEntry[]> | undefined; issues: CompatibilityIssue[] } {
  const issues: CompatibilityIssue[] = []
  const events = new Map<string, CodexHookEntry[]>()

  const push = (event: string, matcher: string | undefined, handler: CodexHookHandler) => {
    const list = events.get(event) ?? []
    const existing = list.find((entry) => entry.matcher === matcher)
    if (existing) existing.hooks.push(handler)
    else list.push({ ...(matcher === undefined ? {} : { matcher }), hooks: [handler] })
    events.set(event, list)
  }

  for (const hook of blueprint.hooks) {
    const lowered = lowerTrigger(hook)
    if (!lowered) {
      issues.push(
        issue(
          'hooks',
          'unsupported',
          `Hook "${hook.name}" runs after a tool fails, an event Codex hooks do not have; it was not emitted.`,
          { ref: { kind: 'hook', id: hook.id } },
        ),
      )
      continue
    }
    const { event, matcher } = lowered
    const background = hook.action.async ? { async: true } : {}
    if (isCommandAction(hook)) {
      const command = effectiveCommand(hook, scripts)
      if (!command) continue
      push(event, matcher, {
        type: 'command',
        // Same exit-code convention as Claude Code, so the same wrapper makes a failure mean
        // what the Blueprint says (P9-25). A background hook's result is discarded.
        command: hook.action.async
          ? command
          : failing(command, failureOutcomeOf(hook), undefined, {
              stop: event === 'Stop' || event === 'SubagentStop',
            }),
        ...(hook.action.timeoutSec === undefined ? {} : { timeout: hook.action.timeoutSec }),
        statusMessage: hookStatusMessage(hook),
        ...background,
      })
    } else {
      push(event, matcher, {
        type: 'command',
        command: reminderCommand(hook.action.prompt ?? hook.description ?? hook.name),
        statusMessage: hookStatusMessage(hook),
        ...background,
      })
      issues.push(
        issue(
          'hooks',
          'adapted',
          `Hook "${hook.name}" asks the model to check something, which Codex hooks cannot do; it is compiled to a reminder printed into the session instead.`,
          { ref: { kind: 'hook', id: hook.id } },
        ),
      )
    }

    if (hook.trigger === 'after-file-change') {
      issues.push(
        issue(
          'hooks',
          'limited',
          `Hook "${hook.name}" should run only after a file changes, but Codex has no tool matcher, so it runs after every tool call.`,
          { ref: { kind: 'hook', id: hook.id }, adaptation: 'PostToolUse without a matcher' },
        ),
      )
    }
  }

  for (const gate of blueprint.gates) {
    const criteria = executableCriteria(gate)
    for (const criterion of criteria) {
      push('Stop', undefined, {
        type: 'command',
        command: failing(
          criterion.command,
          gateFailureOutcomeOf(gate),
          gate.onFail === 'request-approval'
            ? `${gate.name} failed. Ask the user before continuing.`
            : undefined,
          { stop: true },
        ),
        timeout: 600,
        statusMessage: `${gate.name}: ${criterion.description}`,
      })
    }
    if (criteria.length === 0) {
      issues.push(
        issue(
          'gates',
          'adapted',
          `Gate "${gate.name}" has no runnable criterion, so it stays an instruction in the workflow skill.`,
          { ref: { kind: 'gate', id: gate.id } },
        ),
      )
    }
  }

  const enforced = hookEnforcedLaws(laws)
  if (enforced.length > 0) {
    push('Stop', undefined, {
      type: 'command',
      command: reminderCommand(
        `Before finishing, check these Iron Laws: ${enforced.map((law) => law.name).join('; ')}.`,
      ),
      statusMessage: 'Checking the Iron Laws',
    })
    issues.push(
      issue(
        'ironLaws',
        'adapted',
        'Iron Laws marked for hook enforcement are compiled to a printed reminder; Codex cannot run a model-side check in a hook.',
      ),
    )
  }

  const hooks = Object.fromEntries([...events.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
  return { hooks: Object.keys(hooks).length > 0 ? hooks : undefined, issues }
}

export interface CodexPermissions {
  approvalPolicy: 'untrusted' | 'on-request' | 'never'
  sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access'
  networkAccess: boolean
}

export function lowerPermissions(agent: Agent | undefined): {
  permissions: CodexPermissions
  issues: CompatibilityIssue[]
} {
  const issues: CompatibilityIssue[] = []
  if (!agent) {
    return {
      permissions: {
        approvalPolicy: 'on-request',
        sandboxMode: 'workspace-write',
        networkAccess: false,
      },
      issues,
    }
  }

  const operations = agent.permissions.operations
  const sandboxMode = operations['fs.write'] === 'deny' ? 'read-only' : 'workspace-write'
  const networkAccess = operations['net.any'] === 'allow'

  const values = Object.entries(operations)
  const anyAsk = values.some(([, decision]) => decision === 'ask')
  const shellDenied = operations['shell.mutating'] === 'deny'
  const executionAllowed = values
    .filter(([operation]) => operation.startsWith('shell.') || operation.startsWith('git.'))
    .every(([, decision]) => decision === 'allow')

  const approvalPolicy = shellDenied
    ? 'untrusted'
    : anyAsk || agent.permissions.patterns.some((pattern) => pattern.decision !== 'allow')
      ? 'on-request'
      : executionAllowed
        ? 'never'
        : 'on-request'

  if (agent.permissions.patterns.length > 0) {
    issues.push(
      issue(
        'permissions',
        'limited',
        `Codex approves commands globally, so the ${agent.permissions.patterns.length} per-command rule(s) on "${agent.name}" cannot be enforced. They are written into AGENTS.md as a command policy the agent is told to follow.`,
        {
          ref: { kind: 'agent', id: agent.id },
          adaptation: `approval_policy = "${approvalPolicy}"`,
        },
      ),
    )
  }
  if (operations['git.push'] === 'deny' || operations['git.force-push'] === 'deny') {
    issues.push(
      issue(
        'permissions',
        'limited',
        'Codex has no per-command deny rule, so the ban on pushing is an instruction rather than an enforced boundary.',
        { ref: { kind: 'agent', id: agent.id } },
      ),
    )
  }
  if (!networkAccess && operations['net.docs'] === 'allow') {
    issues.push(
      issue(
        'permissions',
        'adapted',
        'Documentation fetches are allowed but arbitrary network access is not; Codex network access is all or nothing, so it is disabled and the allowed domains are listed in AGENTS.md.',
        { ref: { kind: 'agent', id: agent.id } },
      ),
    )
  }

  return { permissions: { approvalPolicy, sandboxMode, networkAccess }, issues }
}

export function buildConfig(
  blueprint: Blueprint,
  primary: Agent | undefined,
  permissions: CodexPermissions,
  subagents: Agent[],
  hasHooks: boolean,
): TomlTable {
  const config: TomlTable = {
    approval_policy: permissions.approvalPolicy,
    sandbox_mode: permissions.sandboxMode,
  }

  if (permissions.sandboxMode === 'workspace-write') {
    config.sandbox_workspace_write = { network_access: permissions.networkAccess }
  }

  const usesMemory = blueprint.memories.some((memory) => memory.scope !== 'stateless')
  const features = {
    ...(hasHooks ? { hooks: true } : {}),
    ...(subagents.length > 0 ? { multi_agent: true } : {}),
    ...(usesMemory ? { memories: true } : {}),
  }
  // Codex feature flags are opt-in; an empty table would be noise in the diff.
  if (Object.keys(features).length > 0) config.features = features

  if (subagents.length > 0) {
    const agents: TomlTable = { enabled: true }
    for (const agent of subagents) {
      agents[agent.id] = {
        description: agent.description ?? agent.responsibilities.join('; '),
        config_file: `.codex/agents/${agent.id}.toml`,
      }
    }
    config.agents = agents
  }

  if (usesMemory) {
    config.memories = { generate_memories: true, use_memories: true }
  }

  const mcpTools = blueprint.tools.filter((tool) => tool.mcp)
  if (mcpTools.length > 0) {
    const servers: TomlTable = {}
    for (const tool of mcpTools) {
      const mcp = tool.mcp
      if (!mcp) continue
      servers[tool.id] = {
        ...(mcp.command ? { command: mcp.command } : {}),
        ...(mcp.args.length > 0 ? { args: [...mcp.args] } : {}),
        ...(mcp.url ? { url: mcp.url } : {}),
        // Values are never emitted: only the names of the variables the user must set.
        ...(mcp.envVars.length > 0
          ? { env: Object.fromEntries(mcp.envVars.map((name) => [name, ''])) }
          : {}),
      }
    }
    config.mcp_servers = servers
  }

  void primary
  return config
}
