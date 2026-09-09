/**
 * Pieces shared by the harnesses whose hooks are JSON with the same exit-code convention
 * (Claude Code, Codex, Copilot): exit 0 continues, exit 2 blocks with stderr as the reason.
 *
 * A Blueprint hook says *what* must happen and *when*, never in whose syntax; each adapter
 * maps `trigger` to its own event name and `action` to its own handler shape.
 */
import type { Gate, Hook, IronLaw, ToolKind } from '@agent-blueprint/core'

/** Actions that run a shell command; the rest are prompt checks. */
const COMMAND_ACTIONS = new Set(['command', 'run-tests', 'format', 'lint', 'secret-scan'])

export function isCommandAction(hook: Hook): boolean {
  return COMMAND_ACTIONS.has(hook.action.type)
}

export function hookCommand(hook: Hook): string | undefined {
  return isCommandAction(hook) ? hook.action.command : undefined
}

/** What the hook is for, shown by harnesses that display a status line. */
export function hookStatusMessage(hook: Hook): string {
  const failure =
    hook.onFailure === 'block'
      ? 'blocks on failure'
      : hook.onFailure === 'warn'
        ? 'warns on failure'
        : 'returns failures to the agent'
  return `${hook.name} (${failure})`
}

/**
 * The prompt used by `prompt-check` and `check-iron-laws` hooks. For iron laws the text is
 * generated from the laws themselves so the check cannot drift from the Blueprint.
 */
export function hookPrompt(hook: Hook, laws: readonly IronLaw[]): string {
  if (hook.action.type === 'check-iron-laws') return ironLawCheckPrompt(laws)
  return hook.action.prompt ?? `Check: ${hook.description ?? hook.name}`
}

export function ironLawCheckPrompt(laws: readonly IronLaw[]): string {
  if (laws.length === 0) return 'Check the response against the Iron Laws before finishing.'
  const list = laws.map((law) => `- ${law.name}: ${law.rule}`).join('\n')
  return [
    'Check the work just completed against these Iron Laws:',
    list,
    'If any law was violated, say which one and correct it before finishing. Never claim a verification you did not run.',
  ].join('\n\n')
}

/** Gate criteria that can actually run, in a stable order. */
export function executableCriteria(gate: Gate): { command: string; description: string }[] {
  return gate.criteria
    .filter((criterion): criterion is typeof criterion & { command: string } =>
      Boolean(criterion.command),
    )
    .map((criterion) => ({
      command: criterion.command,
      description: criterion.description ?? `${gate.name} criterion`,
    }))
}

export function hasExecutableCriteria(gate: Gate): boolean {
  return executableCriteria(gate).length > 0
}

/** Laws the harness should enforce with a hook rather than with instructions alone. */
export function hookEnforcedLaws(laws: readonly IronLaw[]): IronLaw[] {
  return laws.filter((law) => law.enforcement.includes('hook'))
}

/** Tool kinds a hook is limited to, as a stable sorted list. */
export function toolKindsOf(hook: Hook): ToolKind[] {
  return [...hook.conditions.toolKinds].sort()
}

/**
 * File-pattern conditions have no native equivalent in any of the JSON hook formats, so the
 * command carries them as a comment and the adapter reports the limitation once.
 */
export function filePatternNote(hook: Hook): string | undefined {
  const patterns = hook.conditions.filePatterns
  return patterns.length === 0 ? undefined : `Intended for files matching ${patterns.join(', ')}`
}
