/**
 * Pieces shared by the harnesses whose hooks are JSON with the same exit-code convention
 * (Claude Code, Codex, Copilot): exit 0 continues, exit 2 blocks with stderr as the reason.
 *
 * A Blueprint hook says *what* must happen and *when*, never in whose syntax; each adapter
 * maps `trigger` to its own event name and `action` to its own handler shape.
 */
import type { Gate, HarnessId, Hook, IronLaw, ToolKind } from '@agent-blueprint/core'

import { generatedFile, type GeneratedFile } from '../types'

/** Actions that run a shell command; the rest are prompt checks. */
const COMMAND_ACTIONS = new Set(['command', 'run-tests', 'format', 'lint', 'secret-scan'])

export function isCommandAction(hook: Hook): boolean {
  return COMMAND_ACTIONS.has(hook.action.type)
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
export function hookPrompt(
  hook: Hook,
  laws: readonly IronLaw[],
  reader: PromptReader = 'agent',
): string {
  if (hook.action.type === 'check-iron-laws') {
    return reader === 'judge' ? ironLawJudgePrompt(laws) : ironLawCheckPrompt(laws)
  }
  return hook.action.prompt ?? `Check: ${hook.description ?? hook.name}`
}

/**
 * Who reads a generated prompt. `agent`: the model doing the work, told what to check before
 * it finishes (a reminder printed into the session). `judge`: a separate model the harness
 * asks whether the work may stop, which answers `ok` or not — Claude Code's prompt hook.
 */
export type PromptReader = 'agent' | 'judge'

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
 * The same check put to a judge, which sees the transcript and is asked one thing: did this
 * turn break a law. Worded as the reminder above, the judge refused to certify what it could
 * not see — "never claim a verification you did not run" — and blocked every stop of an
 * unfinished task.
 */
export function ironLawJudgePrompt(laws: readonly IronLaw[]): string {
  if (laws.length === 0) return 'Answer {"ok": true}: no Iron Law binds this work.'
  const list = laws.map((law) => `- ${law.name}: ${law.rule}`).join('\n')
  return [
    'Claude has finished a turn and wants to stop. These Iron Laws bind its work:',
    list,
    'Answer {"ok": true} unless the transcript shows the work of this turn breaking one of these laws. Then answer {"ok": false, "reason": "<law>: what was done, and what to correct"}. Unfinished work, missing evidence and checks nobody ran are not violations; do not withhold ok for them. If the input has "stop_hook_active": true, Claude was already sent back once this turn: answer {"ok": true}.',
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
 * the output is printed as it was, so a hook that answers on stdout still answers.
 *
 * The syntax is POSIX shell. Claude Code runs hooks in `sh` and, on Windows, in Git Bash,
 * which it requires; Codex runs `command` through the same shell.
 */
export function failing(
  command: string,
  outcome: FailureOutcome,
  note?: string,
  options: FailingOptions = {},
): string {
  if (outcome === 'ignore') return `${command} || true`
  const code = outcome === 'block' ? 2 : 1
  const prefix = note ? `printf '%s\\n' ${shellQuote(note)} >&2; ` : ''
  // On success the output goes where it went: a hook that answers on stdout — JSON with a
  // decision or context to inject — must not have its answer swallowed by the wrapper.
  const tail = `|| { ${prefix}printf '%s\\n' "$out" >&2; exit ${code}; }; [ -z "$out" ] || printf '%s\\n' "$out"`
  if (!options.stop || code !== 2) return `out=$(${command} 2>&1) ${tail}`
  // Blocking a stop sends the agent back with the output; when it stops again the harness
  // says so (`stop_hook_active`), and blocking a second time on the same failure would only
  // send it round again — Claude Code gives up after 8 rounds, Codex has the same field. So
  // the command still runs, a fix is worth verifying, but a repeat failure is reported (exit
  // 1) rather than blocking. The input is read first and passed on, so a script keeps it.
  const repeat = `[ "$code" = 2 ] || printf '%s\\n' ${shellQuote(STOP_REPEAT_NOTE)} >&2; `
  return `in=$(cat); if printf '%s' "$in" | grep -qE '"stop_hook_active": ?true'; then code=1; else code=2; fi; out=$(printf '%s' "$in" | ${command} 2>&1) || { ${repeat}${prefix}printf '%s\\n' "$out" >&2; exit $code; }; [ -z "$out" ] || printf '%s\\n' "$out"`
}

export interface FailingOptions {
  /**
   * The command runs when the agent stops (`Stop`, `SubagentStop`): block once per turn,
   * and report a repeat of the failure instead of blocking on it again.
   */
  stop?: boolean
}

/** What a repeat failure says before the output, so the user knows why the turn ended. */
export const STOP_REPEAT_NOTE =
  'Still failing after the agent was sent back once; not blocking again this turn.'

/** Where a harness keeps hook scripts and how it runs one. */
export interface ScriptLocation {
  /** Directory the script files go in, repository-relative. */
  dir: string
  /** The command that runs the script at `path` (repository-relative). */
  invoke: (path: string) => string
}

export function hookScriptPath(hook: Hook, location: ScriptLocation): string {
  return `${location.dir}/${hook.id}.sh`
}

/**
 * The command a hook runs: its script, when it has one, else its command (P9-30). A script
 * is a file the compiled output carries, so the command is the harness's way of running
 * that file.
 */
export function effectiveCommand(hook: Hook, location: ScriptLocation): string | undefined {
  if (!isCommandAction(hook)) return undefined
  if (hook.action.script) return location.invoke(hookScriptPath(hook, location))
  return hook.action.command
}

/** The script file itself, for a hook that has one. */
export function hookScriptFile(
  hook: Hook,
  location: ScriptLocation,
  owner: HarnessId,
): GeneratedFile | undefined {
  const script = hook.action.script
  if (!script || !isCommandAction(hook)) return undefined
  // A shebang the author left out is added; one they wrote is kept as the first line.
  const body = script.startsWith('#!') ? script : `#!/usr/bin/env bash\n${script}`
  return generatedFile(hookScriptPath(hook, location), `${body.trimEnd()}\n`, 'text', owner, [
    { kind: 'hook', id: hook.id },
  ])
}

/** Single-quoted for the shell: nothing inside is interpreted. */
export function shellQuote(text: string): string {
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
