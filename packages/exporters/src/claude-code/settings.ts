/**
 * `.claude/settings.json`: permissions, hooks and the memory flag.
 *
 * The permission table is the one in docs/harness/claude-code.md. Claude resolves
 * deny > ask > allow, which is why a blanket deny with an allow exception is widened to
 * `ask` and reported rather than silently dropping the exception.
 */
import type { Agent, Blueprint, Gate, Hook, IronLaw, Tool } from '@agent-blueprint/core'

import {
  executableCriteria,
  filePatternNote,
  hookEnforcedLaws,
  hookPrompt,
  hookStatusMessage,
  isCommandAction,
} from '../shared/hooks'
import {
  effectiveBlanketDecision,
  GIT_READ_PREFIXES,
  type PermissionDecision,
  type PermissionOperation,
  READ_ONLY_SHELL_PREFIXES,
} from '../shared/permissions'
import type { CompatibilityIssue } from '../types'

export interface ClaudeHookHandler {
  type: 'command' | 'prompt'
  command?: string
  prompt?: string
  timeout?: number
  statusMessage?: string
}

export interface ClaudeHookMatcher {
  matcher?: string
  hooks: ClaudeHookHandler[]
}

export interface ClaudeSettings {
  permissions?: {
    allow?: string[]
    ask?: string[]
    deny?: string[]
  }
  hooks?: Record<string, ClaudeHookMatcher[]>
  autoMemoryEnabled?: boolean
}

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'claude-code', concept, support, message, ...extra })

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Bash rules for one operation. `documentationDomains` come from documentation tools. */
function rulesFor(
  operation: PermissionOperation,
  context: { documentationDomains: string[]; mcpServers: string[] },
): string[] {
  switch (operation) {
    case 'fs.read':
      return ['Read', 'Glob', 'Grep']
    case 'fs.write':
      return ['Edit', 'Write']
    case 'fs.delete':
      return ['Bash(rm *)']
    case 'shell.readonly':
      return READ_ONLY_SHELL_PREFIXES.map((prefix) => `Bash(${prefix} *)`)
    case 'shell.mutating':
      return ['Bash']
    case 'git.read':
      return GIT_READ_PREFIXES.map((prefix) => `Bash(${prefix} *)`)
    case 'git.commit':
      return ['Bash(git add *)', 'Bash(git commit *)']
    case 'git.push':
      return ['Bash(git push *)']
    case 'git.force-push':
      return ['Bash(git push --force *)', 'Bash(git push -f *)']
    case 'net.docs':
      return context.documentationDomains.map((domain) => `WebFetch(domain:${domain})`)
    case 'net.any':
      return ['WebFetch', 'WebSearch']
    case 'mcp':
      return context.mcpServers.map((server) => `mcp__${server}`)
  }
}

function patternRule(operation: PermissionOperation, pattern: string): string {
  switch (operation) {
    case 'fs.read':
      return `Read(${pattern})`
    case 'fs.write':
      return `Edit(${pattern})`
    case 'net.docs':
    case 'net.any':
      return `WebFetch(domain:${pattern})`
    case 'mcp':
      return `mcp__${pattern}`
    case 'fs.delete':
    case 'shell.readonly':
    case 'shell.mutating':
    case 'git.read':
    case 'git.commit':
    case 'git.push':
    case 'git.force-push':
      return `Bash(${pattern})`
  }
}

export function lowerPermissions(
  agent: Agent | undefined,
  blueprint: Blueprint,
): { permissions: ClaudeSettings['permissions']; issues: CompatibilityIssue[] } {
  if (!agent) return { permissions: undefined, issues: [] }

  const issues: CompatibilityIssue[] = []
  const lists: Record<PermissionDecision, string[]> = { allow: [], ask: [], deny: [] }
  const add = (decision: PermissionDecision, rules: string[]) => {
    for (const rule of rules) if (!lists[decision].includes(rule)) lists[decision].push(rule)
  }

  const context = {
    documentationDomains: documentationDomainsOf(agent, blueprint.tools),
    mcpServers: blueprint.tools.filter((tool) => tool.mcp).map((tool) => tool.id),
  }

  const operations = Object.keys(agent.permissions.operations) as PermissionOperation[]
  for (const operation of operations) {
    const { decision, widened } = effectiveBlanketDecision(agent.permissions, operation)
    if (decision === undefined) continue
    if (widened) {
      issues.push(
        issue(
          'permissions',
          'limited',
          `"${operation}" is denied with an allowed exception. Claude resolves deny before allow, so the exception would never apply; it is compiled as "ask" instead.`,
          { ref: { kind: 'agent', id: agent.id }, adaptation: `${operation} → permissions.ask` },
        ),
      )
    }
    add(decision, rulesFor(operation, context))
  }

  for (const pattern of agent.permissions.patterns) {
    add(pattern.decision, [patternRule(pattern.operation, pattern.pattern)])
  }

  // A blanket rule that is stricter than a specific one wins under deny > ask > allow.
  const shellBlanket = agent.permissions.operations['shell.mutating']
  if (shellBlanket !== 'allow' && agent.permissions.operations['shell.readonly'] === 'allow') {
    issues.push(
      issue(
        'permissions',
        'limited',
        `Read-only shell commands are allowed while shell commands in general are "${shellBlanket}". Claude applies the stricter rule first, so it may still ask before running them.`,
        { ref: { kind: 'agent', id: agent.id } },
      ),
    )
  }

  const permissions = {
    ...(lists.allow.length > 0 ? { allow: lists.allow } : {}),
    ...(lists.ask.length > 0 ? { ask: lists.ask } : {}),
    ...(lists.deny.length > 0 ? { deny: lists.deny } : {}),
  }
  return {
    permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
    issues,
  }
}

function documentationDomainsOf(agent: Agent, tools: Tool[]): string[] {
  const domains = new Set<string>()
  for (const toolId of agent.toolIds) {
    const tool = tools.find((candidate) => candidate.id === toolId)
    if (tool?.kind !== 'documentation') continue
    const declared = tool.metadata.domains
    if (Array.isArray(declared)) {
      for (const domain of declared) if (typeof domain === 'string') domains.add(domain)
    }
  }
  return [...domains].sort()
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const TOOL_KIND_MATCHERS: Record<string, string> = {
  filesystem: 'Edit|Write|Read',
  shell: 'Bash',
  git: 'Bash',
  browser: 'WebFetch|WebSearch',
  search: 'WebFetch|WebSearch|Grep|Glob',
  database: 'Bash',
  api: 'WebFetch',
  documentation: 'WebFetch',
  mcp: 'mcp__.*',
  custom: '',
}

interface LoweredTrigger {
  event: string
  matcher?: string
}

export function lowerTrigger(hook: Hook): LoweredTrigger {
  switch (hook.trigger) {
    case 'session-start':
      return { event: 'SessionStart' }
    case 'user-prompt':
      return { event: 'UserPromptSubmit' }
    case 'before-tool':
      return { event: 'PreToolUse', ...matcherFor(hook) }
    case 'after-tool':
      return { event: 'PostToolUse', ...matcherFor(hook) }
    case 'after-file-change':
      return { event: 'PostToolUse', matcher: 'Edit|Write' }
    case 'before-stop':
      return { event: 'Stop' }
    case 'subagent-stop':
      return { event: 'SubagentStop' }
  }
}

function matcherFor(hook: Hook): { matcher?: string } {
  const matchers = hook.conditions.toolKinds
    .map((kind) => TOOL_KIND_MATCHERS[kind] ?? '')
    .filter((matcher) => matcher.length > 0)
  return matchers.length === 0 ? {} : { matcher: [...new Set(matchers)].sort().join('|') }
}

export function lowerHooks(
  blueprint: Blueprint,
  laws: IronLaw[],
): { hooks: ClaudeSettings['hooks']; issues: CompatibilityIssue[] } {
  const issues: CompatibilityIssue[] = []
  const events = new Map<string, ClaudeHookMatcher[]>()

  const push = (event: string, matcher: string | undefined, handler: ClaudeHookHandler) => {
    const list = events.get(event) ?? []
    const existing = list.find((entry) => entry.matcher === matcher)
    if (existing) existing.hooks.push(handler)
    else list.push({ ...(matcher === undefined ? {} : { matcher }), hooks: [handler] })
    events.set(event, list)
  }

  for (const hook of blueprint.hooks) {
    const { event, matcher } = lowerTrigger(hook)
    const handler = handlerFor(hook, laws)
    if (!handler) {
      issues.push(
        issue(
          'hooks',
          'limited',
          `Hook "${hook.name}" has no command or prompt to run and was skipped.`,
          {
            ref: { kind: 'hook', id: hook.id },
          },
        ),
      )
      continue
    }
    push(event, matcher, handler)

    const note = filePatternNote(hook)
    if (note) {
      issues.push(
        issue(
          'hooks',
          'adapted',
          `Hook "${hook.name}" is limited to ${hook.conditions.filePatterns.join(', ')}, which Claude hooks cannot express; the command runs for every matching tool call and must filter the paths itself.`,
          { ref: { kind: 'hook', id: hook.id }, adaptation: note },
        ),
      )
    }
  }

  // Gates with a runnable criterion become Stop hooks so the session cannot end unverified.
  for (const gate of blueprint.gates) {
    for (const criterion of executableCriteria(gate)) {
      push('Stop', undefined, {
        type: 'command',
        command: criterion.command,
        timeout: 600,
        statusMessage: `${gate.name}: ${criterion.description}`,
      })
    }
    if (executableCriteria(gate).length === 0) {
      issues.push(
        issue(
          'gates',
          'adapted',
          `Gate "${gate.name}" has no runnable criterion, so it is compiled as an instruction in the workflow skill rather than a hook.`,
          { ref: { kind: 'gate', id: gate.id } },
        ),
      )
    }
  }

  const enforced = hookEnforcedLaws(laws)
  if (enforced.length > 0) {
    push('Stop', undefined, {
      type: 'prompt',
      prompt: hookPrompt({ action: { type: 'check-iron-laws' } } as Hook, enforced),
      statusMessage: 'Checking the Iron Laws',
    })
  }

  const hooks = Object.fromEntries([...events.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
  return { hooks: Object.keys(hooks).length > 0 ? hooks : undefined, issues }
}

function handlerFor(hook: Hook, laws: IronLaw[]): ClaudeHookHandler | undefined {
  if (isCommandAction(hook)) {
    const command = hook.action.command
    if (!command) return undefined
    return {
      type: 'command',
      command,
      ...(hook.action.timeoutSec === undefined ? {} : { timeout: hook.action.timeoutSec }),
      statusMessage: hookStatusMessage(hook),
    }
  }
  return {
    type: 'prompt',
    prompt: hookPrompt(hook, laws),
    statusMessage: hookStatusMessage(hook),
  }
}

// ---------------------------------------------------------------------------
// settings.json
// ---------------------------------------------------------------------------

export function buildSettings(
  blueprint: Blueprint,
  primary: Agent | undefined,
  laws: IronLaw[],
): { settings: ClaudeSettings; issues: CompatibilityIssue[] } {
  const permissions = lowerPermissions(primary, blueprint)
  const hooks = lowerHooks(blueprint, laws)

  const settings: ClaudeSettings = {
    ...(permissions.permissions ? { permissions: permissions.permissions } : {}),
    ...(hooks.hooks ? { hooks: hooks.hooks } : {}),
    ...(blueprint.memories.some((memory) => memory.scope !== 'stateless')
      ? { autoMemoryEnabled: true }
      : {}),
  }

  return { settings, issues: [...permissions.issues, ...hooks.issues] }
}

/** Gates are also described in the workflow skills, so the two can never disagree. */
export function gatesWithoutCommands(blueprint: Blueprint): Gate[] {
  return blueprint.gates.filter((gate) => executableCriteria(gate).length === 0)
}
