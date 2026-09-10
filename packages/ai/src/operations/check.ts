/**
 * Checking a proposal before the user is shown it.
 *
 * Three operations already had a version of this — `createWorkflowFor` since P6, `fixFinding`
 * since P9-13 — and the shape is always the same: apply the proposal to a throwaway Blueprint,
 * run the rules the IDE runs, and compare with what was wrong before. What differs is only
 * which findings are worth another round trip.
 *
 * Both passes matter. `validateBlueprint` catches the structural rules; the quality findings
 * the evaluation pass computes — a skill with no `## Instructions`, a workflow that never
 * verifies anything — never come from the validator at all, and those were the bulk of what a
 * generated Blueprint arrived with (P9-14). Portability is not asked for: it needs the
 * adapters, which `packages/ai` does not depend on, and a `BP-PORT-*` note is not a defect a
 * model can write its way out of.
 */
import {
  applyChangeSet,
  type Blueprint,
  type ChangeSet,
  type Diagnostic,
  evaluateBlueprint,
  refKey,
  validateBlueprint,
} from '@agent-blueprint/core'

/**
 * Code and artifact, not the message.
 *
 * A message often carries a count or a name that a legitimate change moves, and a finding that
 * came back reworded is still the same finding.
 */
export function fingerprint(finding: Diagnostic): string {
  return `${finding.code}|${finding.ref ? refKey(finding.ref) : ''}`
}

/** Everything wrong with a Blueprint, from both passes, deduplicated. */
export function allFindings(blueprint: Blueprint): Diagnostic[] {
  const validation = validateBlueprint(blueprint)
  const report = evaluateBlueprint(blueprint, { diagnostics: validation })
  const seen = new Set(validation.map(fingerprint))
  const quality = report.dimensions
    .flatMap((dimension) => dimension.findings)
    .filter((finding) => {
      const key = fingerprint(finding)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return [...validation, ...quality]
}

/**
 * What is wrong with the Blueprint this proposal would produce that was not wrong before.
 *
 * "Before" matters: a Blueprint with six existing problems should not have them read back to
 * the model as though it had caused them, and asking it to fix what it was not asked to touch
 * is how a draft turns into a rewrite.
 */
export function findingsIntroduced(blueprint: Blueprint, changeSet: ChangeSet): Diagnostic[] {
  if (changeSet.ops.length === 0) return []
  const before = new Set(allFindings(blueprint).map(fingerprint))
  const applied = applyChangeSet(blueprint, changeSet)
  return allFindings(applied.blueprint).filter((finding) => !before.has(fingerprint(finding)))
}

/** Two of a kind teach what one does not; the seventh identical line teaches nothing. */
const MAX_PER_CODE = 2

/** A hard ceiling as well, so a wide failure cannot crowd out the answer it is asking for. */
const MAX_COMPLAINTS = 16

/**
 * The findings worth reading back to the model, as lines for the prompt.
 *
 * The discriminator is whether the finding names an artifact. One that does is about something
 * the model wrote and got wrong — a skill with no instructions, a law scoped to nothing — and
 * it can write that properly instead. One that does not is about what the Blueprint as a whole
 * does not contain: no gates, no secret-scanning hook, no export target enabled. Those are
 * real advice and they belong in the health bar, but a model asked to draft a PR-review crew
 * from one sentence should not bolt a secrets hook onto it unasked — that is the padding the
 * prompt spends a paragraph forbidding. Errors are the exception: an error without an artifact
 * is still a Blueprint that will not compile.
 *
 * `BP-PORT-*` is excluded outright. It says a concept is adapted rather than native on some
 * harness, which is a fact about the harness and not a mistake anyone can write their way out
 * of. `BP-EVAL-PORT-001` likewise: it means the evaluator was given no adapter data, which is
 * a property of where it ran, not of the Blueprint.
 */
export function complaintsFor(findings: readonly Diagnostic[]): string[] {
  const worth = findings.filter(
    (finding) =>
      !finding.code.startsWith('BP-PORT-') &&
      finding.code !== 'BP-EVAL-PORT-001' &&
      (finding.severity === 'error' || finding.ref !== undefined),
  )

  const perCode = new Map<string, number>()
  const lines: string[] = []
  let dropped = 0
  for (const finding of worth) {
    const seen = perCode.get(finding.code) ?? 0
    if (seen >= MAX_PER_CODE || lines.length >= MAX_COMPLAINTS) {
      dropped += 1
      continue
    }
    perCode.set(finding.code, seen + 1)
    lines.push(`- ${finding.code}: ${finding.message}`)
  }
  if (dropped > 0) {
    lines.push(`- …and ${dropped} more of the same kinds, on other artifacts. Fix those too.`)
  }
  return lines
}
