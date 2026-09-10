/**
 * `opencode.json` and the permission lowering behind it.
 *
 * OpenCode is the one target with a permission model as expressive as the Blueprint's: allow,
 * ask and deny, per key, with pattern objects for commands and paths. So this is the adapter
 * that loses the least, and the care goes into the one thing that is easy to get wrong —
 * order. OpenCode evaluates patterns with **the last match winning**, so the catch-all is
 * written first and the specific rules after it. `stableJson` keeps insertion order, which is
 * why the objects below are built in the order they are meant to be read.
 */
import type { Agent, Blueprint, PermissionSet } from '@agent-blueprint/core'

import {
  GIT_READ_PREFIXES,
  type PermissionDecision,
  patternsFor,
  READ_ONLY_SHELL_PREFIXES,
} from '../shared/permissions'
import type { CompatibilityIssue } from '../types'

/** A permission value: one decision for the key, or a pattern object read last-match-first. */
export type PermissionValue = PermissionDecision | Record<string, PermissionDecision>

export type OpenCodePermissions = Record<string, PermissionValue>

const issue = (
  concept: CompatibilityIssue['concept'],
  support: CompatibilityIssue['support'],
  message: string,
  extra: Partial<CompatibilityIssue> = {},
): CompatibilityIssue => ({ harnessId: 'opencode', concept, support, message, ...extra })

/** Command patterns, broadest first. Later keys win, so the order here is the semantics. */
function bashPatterns(permissions: PermissionSet): Record<string, PermissionDecision> {
  const operations = permissions.operations
  const rules: Record<string, PermissionDecision> = {}
  const set = (pattern: string, decision: PermissionDecision | undefined): void => {
    if (decision !== undefined) rules[pattern] = decision
  }

  set('*', operations['shell.mutating'])

  // Read-only commands only need their own entry when they are treated differently.
  const readonly = operations['shell.readonly']
  if (readonly !== undefined && readonly !== operations['shell.mutating']) {
    for (const prefix of READ_ONLY_SHELL_PREFIXES) set(`${prefix} *`, readonly)
  }

  for (const prefix of GIT_READ_PREFIXES) set(`${prefix} *`, operations['git.read'])
  set('git commit *', operations['git.commit'])
  set('git push *', operations['git.push'])
  // Written after `git push *` because a force push is also a push, and the last match wins.
  set('git push --force *', operations['git.force-push'])
  set('git push -f *', operations['git.force-push'])
  set('rm *', operations['fs.delete'])

  // The author's own rules are the most specific thing they wrote, so they go last. Only the
  // operations whose patterns *are* commands: an `fs.delete` pattern is a path, and a path in
  // a command rule matches no command ever while reading as though the rule were honoured.
  for (const operation of ['shell.readonly', 'shell.mutating'] as const) {
    for (const pattern of patternsFor(permissions, operation)) {
      rules[pattern.pattern] = pattern.decision
    }
  }

  return rules
}

/** Operations whose patterns this adapter can express: commands in `bash`, paths in `read`/`edit`. */
const LOWERED_PATTERN_OPERATIONS = new Set([
  'shell.readonly',
  'shell.mutating',
  'fs.read',
  'fs.write',
])

/** Path patterns for a file operation, or a single decision when there are none. */
function pathValue(
  permissions: PermissionSet,
  operation: 'fs.read' | 'fs.write',
): PermissionValue | undefined {
  const blanket = permissions.operations[operation]
  const patterns = patternsFor(permissions, operation)
  if (patterns.length === 0) return blanket
  const rules: Record<string, PermissionDecision> = {}
  if (blanket !== undefined) rules['*'] = blanket
  for (const pattern of patterns) rules[pattern.pattern] = pattern.decision
  return rules
}

/**
 * The `permission` object for one agent. Keys OpenCode does not document a Blueprint meaning
 * for (`task`, `skill`, `lsp`, `question`, `doom_loop`, `external_directory`) are left unset
 * so the harness default applies: writing a guess there would restrict an agent in a way
 * nobody asked for.
 */
export function lowerPermissions(agent: Agent): {
  permissions: OpenCodePermissions
  issues: CompatibilityIssue[]
} {
  const issues: CompatibilityIssue[] = []
  const operations = agent.permissions.operations
  const permissions: OpenCodePermissions = {}

  const read = pathValue(agent.permissions, 'fs.read')
  if (read !== undefined) {
    permissions.read = read
    // glob and grep read the tree as well; a read ban that left them open would not be one.
    if (typeof read === 'string') {
      permissions.glob = read
      permissions.grep = read
    }
  }

  const edit = pathValue(agent.permissions, 'fs.write')
  if (edit !== undefined) permissions.edit = edit

  const bash = bashPatterns(agent.permissions)
  if (Object.keys(bash).length > 0) permissions.bash = bash

  // OpenCode has one fetch key. When documentation is allowed but the open internet is not,
  // neither decision is right, so it asks and the difference is reported.
  const docs = operations['net.docs']
  const any = operations['net.any']
  if (docs !== undefined || any !== undefined) {
    if (docs === 'allow' && any !== undefined && any !== 'allow') {
      permissions.webfetch = 'ask'
      issues.push(
        issue(
          'permissions',
          'limited',
          `"${agent.name}" may fetch documentation but not the open internet. OpenCode has one \`webfetch\` permission and cannot tell the two apart, so it asks; the domains that were meant to be free are listed in the AGENTS.md command policy.`,
          { ref: { kind: 'agent', id: agent.id }, adaptation: 'webfetch: "ask"' },
        ),
      )
    } else {
      permissions.webfetch = any ?? docs ?? 'ask'
    }
    if (any !== undefined) permissions.websearch = any
  }

  // A pattern this adapter has nowhere to put is the kind of loss that is only visible if it
  // is said out loud: an `fs.delete` path, a `net.docs` domain, an `mcp` rule. The blanket
  // decision for those operations still applies; the exception the author wrote does not.
  const dropped = agent.permissions.patterns.filter(
    (pattern) => !LOWERED_PATTERN_OPERATIONS.has(pattern.operation),
  )
  if (dropped.length > 0) {
    const operations = [...new Set(dropped.map((pattern) => pattern.operation))].sort()
    issues.push(
      issue(
        'permissions',
        'limited',
        `OpenCode has no rule shape for ${operations.join(', ')}, so the ${dropped.length} pattern(s) on "${agent.name}" for those operations are not enforced. The blanket decision still applies; the exception does not. They are in the AGENTS.md command policy.`,
        { ref: { kind: 'agent', id: agent.id }, adaptation: 'AGENTS.md "Command policy" section' },
      ),
    )
  }

  return { permissions, issues }
}

export interface OpenCodeConfig {
  $schema: string
  permission?: OpenCodePermissions
  instructions?: string[]
  mcp?: Record<string, Record<string, unknown>>
}

export function buildConfig(
  blueprint: Blueprint,
  primary: Agent | undefined,
  looseReferenceGlob: string | undefined,
): { config: OpenCodeConfig; issues: CompatibilityIssue[] } {
  const issues: CompatibilityIssue[] = []
  const config: OpenCodeConfig = { $schema: 'https://opencode.ai/config.json' }

  if (primary) {
    const lowered = lowerPermissions(primary)
    issues.push(...lowered.issues)
    if (Object.keys(lowered.permissions).length > 0) config.permission = lowered.permissions
  }

  // Loose references belong to the project rather than to one skill, so they are always loaded.
  if (looseReferenceGlob) config.instructions = [looseReferenceGlob]

  const mcpTools = blueprint.tools.filter((tool) => tool.mcp)
  if (mcpTools.length > 0) {
    const servers: Record<string, Record<string, unknown>> = {}
    for (const tool of mcpTools) {
      const mcp = tool.mcp
      if (!mcp) continue
      servers[tool.id] =
        mcp.transport === 'stdio'
          ? {
              type: 'local',
              command: [...(mcp.command ? [mcp.command] : []), ...mcp.args],
              enabled: true,
              // Only the names of the variables the user must set; never a value.
              ...(mcp.envVars.length > 0
                ? { environment: Object.fromEntries(mcp.envVars.map((name) => [name, ''])) }
                : {}),
            }
          : {
              type: 'remote',
              ...(mcp.url ? { url: mcp.url } : {}),
              enabled: true,
            }
      if (mcp.transport === 'stdio' && !mcp.command) {
        issues.push(
          issue(
            'permissions',
            'limited',
            `MCP server "${tool.name}" is configured for stdio but names no command, so OpenCode has nothing to start. Give the tool a command, or configure the server by hand.`,
            { ref: { kind: 'tool', id: tool.id } },
          ),
        )
      }
    }
    config.mcp = servers
  }

  return { config, issues }
}
