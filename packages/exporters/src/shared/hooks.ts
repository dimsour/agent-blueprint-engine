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

/**
 * What a failed command should do, in the terms the exit-code convention offers.
 *
 * `block`: exit 2, output on stderr — the harness refuses the action and hands the output
 * to the agent. `report`: exit 1, output on stderr — nothing is refused and the user sees
 * it. `ignore`: the command's result does not matter.
 */
export type FailureOutcome = 'block' | 'report' | 'ignore'

export function failureOutcomeOf(hook: Hook): FailureOutcome {
  // "Return to agent" and "block" are the same mechanism: exit 2 is how a hook's output
  // reaches the model, and on the events that can refuse, it also refuses.
  return hook.onFailure === 'warn' ? 'report' : 'block'
}

export function gateFailureOutcomeOf(gate: Gate): FailureOutcome {
  switch (gate.onFail) {
    case 'allow':
      return 'ignore'
    case 'warn':
      return 'report'
    case 'block':
    case 'request-approval':
      return 'block'
  }
}

/**
 * A command whose failure means what the Blueprint says (P9-25).
 *
 * Run as written, a test runner fails with exit 1 and prints to stdout, which under the
 * convention Claude Code and Codex share is "a non-blocking error the user is shown": the
 * hook never refuses anything and the agent never sees why. The wrapper captures the output
 * and, on failure, writes it to stderr and exits with the code the outcome needs. On success
 * it prints nothing, which keeps a passing test run out of the session.
 *
 * The syntax is POSIX shell. Claude Code runs hooks in `sh` and, on Windows, in Git Bash,
 * which it requires; Codex runs `command` through the same shell.
 */
export function failing(command: string, outcome: FailureOutcome, note?: string): string {
  if (outcome === 'ignore') return `${command} || true`
  const code = outcome === 'block' ? 2 : 1
  const prefix = note ? `printf '%s\\n' ${shellQuote(note)} >&2; ` : ''
  return `out=$(${command} 2>&1) || { ${prefix}printf '%s\\n' "$out" >&2; exit ${code}; }`
}

/** Single-quoted for the shell: nothing inside is interpreted. */
function shellQuote(text: string): string {
  return `'${text.replace(/'/g, "'\\''")}'`
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
