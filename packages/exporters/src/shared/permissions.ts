/**
 * Shared vocabulary for lowering abstract permissions.
 *
 * A Blueprint says "this agent may run mutating shell commands only after asking"; each
 * harness expresses that differently, and some cannot express it at all. The helpers here
 * answer the questions every adapter asks, so the per-harness tables stay small.
 */
import type { Agent, PermissionSet } from '@agent-blueprint/core'

export type PermissionOperation = keyof PermissionSet['operations']
export type PermissionDecision = 'allow' | 'ask' | 'deny'

/** Commands that only read. Used when `shell.readonly` differs from `shell.mutating`. */
export const READ_ONLY_SHELL_PREFIXES = [
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'diff',
  'pwd',
  'echo',
  'which',
  'file',
  'stat',
] as const

export const GIT_READ_PREFIXES = ['git status', 'git diff', 'git log', 'git show'] as const

export function decisionOf(
  permissions: PermissionSet,
  operation: PermissionOperation,
): PermissionDecision | undefined {
  return permissions.operations[operation]
}

/** Patterns for one operation, in declaration order. */
export function patternsFor(permissions: PermissionSet, operation: PermissionOperation) {
  return permissions.patterns.filter((pattern) => pattern.operation === operation)
}

export function hasAllowPattern(
  permissions: PermissionSet,
  operation: PermissionOperation,
): boolean {
  return patternsFor(permissions, operation).some((pattern) => pattern.decision === 'allow')
}

/**
 * Every harness resolves deny before allow, so a blanket deny plus an allow pattern would
 * deny everything, silently losing the exception the author wrote. Adapters therefore widen
 * the blanket decision to `ask` and report the widening.
 */
export function effectiveBlanketDecision(
  permissions: PermissionSet,
  operation: PermissionOperation,
): { decision: PermissionDecision | undefined; widened: boolean } {
  const decision = decisionOf(permissions, operation)
  if (decision === 'deny' && hasAllowPattern(permissions, operation)) {
    return { decision: 'ask', widened: true }
  }
  return { decision, widened: false }
}

/** True when nothing needs approval: the harness can run unattended. */
export function isFullyPermissive(permissions: PermissionSet): boolean {
  const values = Object.values(permissions.operations)
  return values.length > 0 && values.every((decision) => decision === 'allow')
}

export function requiresApproval(permissions: PermissionSet): boolean {
  return (
    Object.values(permissions.operations).includes('ask') ||
    permissions.patterns.some((pattern) => pattern.decision === 'ask')
  )
}

/** Documentation domains an agent may fetch, taken from its documentation-kind tools. */
export function documentationDomains(
  agent: Agent,
  tools: { id: string; kind: string; metadata: Record<string, unknown> }[],
): string[] {
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
