/**
 * Clearing findings.
 *
 * Every other operation starts from what the user wants; this one starts from what the
 * validator already worked out, which means almost everything the model needs is already
 * written down somewhere in the product. The catalogue's `remedy` says how this kind of
 * finding is fixed (P9-10). `ValidationRule.description` states the invariant the rule
 * enforces, which is the exact condition under which the finding goes away. The diagnostic's
 * own `data` names the step, the responsibility or the reference the rule objected to. All
 * of it goes in, along with the artifact itself repeated next to the ask — and then the
 * proposal is applied to a throwaway Blueprint and validated, so "did that work?" is answered
 * before the user is shown anything (P9-13).
 *
 * The hard part is not the prompt but knowing when to refuse. A model cannot restore a file
 * that is missing from disk, cannot rename an artifact without breaking every reference to
 * it, and cannot enable a compile target. Offering a button that produces an empty ChangeSet
 * for those teaches the user the feature does not work. `fixabilityOf` says no, and says why,
 * so the UI can show the reason instead of the button.
 */
import {
  applyChangeSet,
  type Blueprint,
  type Diagnostic,
  diagnosticCode,
  type EntityKind,
  ENTITY_KINDS,
  type EntityRef,
  findEntity,
  refKey,
  ruleByCode,
  stableJson,
  validateBlueprint,
} from '@agent-blueprint/core'

import { AIError } from '../client/errors'
import { renderEntity } from '../context/render'
import { type FindingBrief, fixFindingV1 } from '../prompts/fix-finding.v1'
import { fixFindingOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Assembly, type Draft } from './assemble'
import { fingerprint } from './check'
import { aiDiagnosticCode } from './codes'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

/** What a fix may write, or why there is nothing for a model to write. */
export type Fixability =
  { fixable: true; kinds: readonly EntityKind[] } | { fixable: false; reason: string }

/**
 * Codes a model cannot clear by writing artifacts, and what to do instead.
 *
 * Each of these has a real remedy — the catalogue says so — it is just not a remedy made of
 * artifact text. Saying which control does the job is more use than a button that would think
 * for thirty seconds and propose nothing.
 */
const NOT_ARTIFACT_WORK: Record<string, string> = {
  'BP-PROJECT-002': 'This is about a file on disk. Restore it, or save the project.',
  'BP-PROJECT-003': 'This is about a file that will not parse. Fix it in the Source tab.',
  'BP-PROJECT-004': 'Saving the project is the fix.',
  'BP-PROJECT-005': 'Saving the project is the fix.',
  'BP-PROJECT-006': 'Saving the project is the fix.',
  'BP-ID-001':
    'Renaming is a refactor, not a rewrite. Use Rename in the inspector, which carries every reference with it.',
  'BP-ID-002':
    'Renaming is a refactor, not a rewrite. Use Rename in the inspector, which carries every reference with it.',
  'BP-AGENT-002': 'Choose the primary agent in the Blueprint’s settings.',
  'BP-TARGET-001': 'Enable a target in the Compatibility view.',
  'BP-TARGET-002': 'Remove the duplicate target in the Compatibility view.',
  'BP-TARGET-003': 'Correct the target’s options in the Compatibility view.',
  'BP-COMPILE-001': 'Two targets want the same path. Rename one artifact, or turn one target off.',
  'BP-CLAUDE-001': 'Rename either the workflow or the skill from the inspector.',
  'BP-CLAUDE-002': 'Rename either the rule or the skill from the inspector.',
  'BP-CODEX-001': 'Rename either the workflow or the skill from the inspector.',
  'BP-COPILOT-001': 'Rename either the workflow or the skill from the inspector.',
  'BP-OPENCODE-001': 'Rename either the workflow or the skill from the inspector.',
  'BP-PI-001': 'Rename either the workflow or the skill from the inspector.',
  'BP-EVAL-PORT-001':
    'Enable a target in the Compatibility view; there is nothing to score until then.',
}

/**
 * Kinds a fix may write beyond the ones the finding already names.
 *
 * The default — the kind of the artifact the finding is about, plus anything it names as
 * related — covers most of the catalogue, because most findings are "this artifact is
 * missing something". These are the ones where the fix lives somewhere else: a Blueprint with
 * no Iron Laws needs a law written, not the Blueprint edited, and an orphan is usually
 * attached to an agent rather than changed itself.
 */
const EXTRA_KINDS: Record<string, readonly EntityKind[]> = {
  'BP-EVAL-LAW-003': ['iron-law'],
  'BP-SAFETY-003': ['iron-law'],
  'BP-EVAL-VERIFY-002': ['gate'],
  'BP-EVAL-VERIFY-003': ['hook'],
  'BP-SAFETY-004': ['hook'],
  'BP-EVAL-VERIFY-001': ['workflow'],
  'BP-ORPHAN-001': ['agent'],
  'BP-ORPHAN-002': ['agent'],
  'BP-ORPHAN-003': ['agent'],
  'BP-ORPHAN-004': ['agent'],
  'BP-ORPHAN-005': ['workflow'],
  'BP-ORPHAN-006': ['agent'],
  'BP-ORPHAN-007': ['agent'],
  'BP-ORPHAN-008': ['agent'],
  'BP-AGENT-010': ['workflow'],
  'BP-AGENT-011': ['skill'],
  'BP-LAW-011': ['gate'],
  'BP-REQ-004': ['requirement'],
  'BP-SAFETY-002': ['iron-law'],
}

/** Findings about nothing in particular, where the fix is a new artifact of a stated kind. */
function kindsFor(diagnostic: Diagnostic): readonly EntityKind[] {
  const named: EntityKind[] = []
  if (diagnostic.ref) named.push(diagnostic.ref.kind)
  for (const related of diagnostic.related ?? []) named.push(related.kind)
  for (const extra of EXTRA_KINDS[diagnostic.code] ?? []) named.push(extra)
  // Nothing named it and nothing extended it: an AI finding about the whole Blueprint, say.
  // Everything is on the table, which is the honest answer even though it is a wide schema.
  const kinds = named.length > 0 ? named : ENTITY_KINDS
  return [...new Set(kinds)]
}

export function fixabilityOf(diagnostic: Diagnostic): Fixability {
  const reason = NOT_ARTIFACT_WORK[diagnostic.code]
  if (reason !== undefined) return { fixable: false, reason }
  return { fixable: true, kinds: kindsFor(diagnostic) }
}

/** What the model is told about the code: the catalogue's words, deterministic or not. */
function guidanceFor(diagnostic: Diagnostic): { summary: string; remedy: string } {
  const entry = diagnosticCode(diagnostic.code) ?? aiDiagnosticCode(diagnostic.code)
  if (entry) return { summary: entry.summary, remedy: entry.remedy }
  // A code from an adapter, or from a core newer than this build. The message is all there is.
  return {
    summary: 'A finding raised against this Blueprint.',
    remedy: 'Change what the finding describes, and nothing else.',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The id a model wrote on an artifact, when it wrote one that is a string. */
function idOf(artifact: unknown): string | undefined {
  if (!isRecord(artifact)) return undefined
  const id = artifact.id
  return typeof id === 'string' ? id : undefined
}
/**
 * Which fields of an artifact a code is about, from the catalogue.
 *
 * It lived here as a table from P9-13 to P9-20, when the editor needed the same answer to mark
 * the fields on the form. One list, in core, read by both: the finding is shown beside the
 * control that fixes it, and the fix may change that control and no other.
 */
function fieldsFor(code: string): readonly string[] | undefined {
  return diagnosticCode(code)?.fields
}

/**
 * The exit condition for codes whose rule is registered under a different code (P9-13).
 *
 * `ValidationRule.description` is the invariant a rule enforces, and it is the best sentence
 * in the product for telling a model what "fixed" means. But one rule may emit several codes —
 * the workflow-structure rule is registered as `BP-WF-001` and raises five — so `ruleByCode`
 * finds nothing for the rest. These are the fixable ones it misses, each written as the
 * condition under which the finding goes away rather than as the complaint.
 *
 * `tests/operations.test.ts` fails if a fixable validation code has neither, so the two
 * sources cannot quietly stop covering the catalogue between them.
 */
const INVARIANT_BY_CODE: Record<string, string> = {
  'BP-WF-002': 'A workflow with steps must have an end step for its paths to reach.',
  'BP-WF-003': 'Every connection must run between two steps that exist.',
  'BP-WF-004': 'Step ids must be unique within their workflow.',
  'BP-WF-005':
    'A step that runs something — an agent, a skill, a gate, a tool — must say which one.',
  'BP-LAW-010': 'Two Iron Laws must not oblige opposite things about the same subject.',
  'BP-ORPHAN-002': 'Every workflow must be reachable: held by an agent, or triggered.',
  'BP-ORPHAN-003': 'Every Iron Law must apply to something — an agent, a workflow, or all of them.',
  'BP-ORPHAN-004': 'Every rule must apply to something — an agent, a workflow, paths, or all.',
  'BP-ORPHAN-005': 'Every gate must be reached by a workflow step.',
  'BP-ORPHAN-006': 'Every tool must be held by an agent or used by a workflow step.',
  'BP-ORPHAN-007': 'Every reference must be attached to the agent or skill that reads it.',
  'BP-ORPHAN-008': 'Every memory definition must be attached to an agent.',
  'BP-REQ-002': 'Every check of a requirement must pass, not merely some of them.',
  'BP-REQ-003': 'A requirement must carry at least one check, or nothing can confirm it.',
  'BP-REQ-004': 'A requirement should be verifiable without a model where that is possible.',
  'BP-REQ-005': 'Every requirement check must be able to run — a valid pattern, a real field.',
  'BP-CODEX-002': 'The composed AGENTS.md must fit within the Codex instruction budget.',
  'BP-PORT-001': 'Every feature the Blueprint uses must be expressible on each enabled target.',
  'BP-PORT-002': 'A feature carried as instructions rather than natively should be a choice.',
}

/** What "fixed" means, from the rule itself where there is one and the table where not. */
export function invariantFor(code: string): string | undefined {
  return ruleByCode(code)?.description ?? INVARIANT_BY_CODE[code]
}

/** One artifact as its source file, or nothing when the finding names one that is gone. */
function sourceOf(blueprint: Blueprint, ref: EntityRef): string | undefined {
  const entity = findEntity(blueprint, ref.kind, ref.id)
  return entity ? renderEntity(ref.kind, entity) : undefined
}

interface Outcome {
  /**
   * The findings `validateBlueprint` can decide at all, by fingerprint.
   *
   * Only codes the catalogue marks `source: 'validation'` come from the rules; the quality
   * findings are computed by the evaluation pass and the reader's come from files, so
   * re-running the validator says nothing about either. Claiming "cleared" for one of those
   * would be a lie by omission.
   */
  checkable: Set<string>
  /** Of those, the ones still raised against the Blueprint this proposal would produce. */
  standing: Set<string>
  /** Findings the proposal introduced that were not there before. */
  introduced: Diagnostic[]
}

/**
 * Did it work?
 *
 * The validator is right there, so asking it costs nothing next to another round trip — and
 * it is the only honest answer to "the AI fix does not always work". A proposal that leaves
 * the finding standing earns one more attempt with the validator's own words; one that clears
 * the finding but breaks something else says so in the review rather than being found later.
 */
function outcomeOf(
  blueprint: Blueprint,
  diagnostics: readonly Diagnostic[],
  assembly: Assembly,
): Outcome {
  const checkable = new Set(
    diagnostics
      .filter((diagnostic) => diagnosticCode(diagnostic.code)?.source === 'validation')
      .map(fingerprint),
  )
  if (assembly.changeSet.ops.length === 0) {
    return { checkable, standing: new Set(checkable), introduced: [] }
  }
  const before = new Set(validateBlueprint(blueprint).map(fingerprint))
  const applied = applyChangeSet(blueprint, assembly.changeSet)
  const after = validateBlueprint(applied.blueprint)
  const stillThere = new Set(after.map(fingerprint))
  return {
    checkable,
    standing: new Set([...checkable].filter((key) => stillThere.has(key))),
    introduced: after.filter(
      (finding) => !before.has(fingerprint(finding)) && finding.severity !== 'info',
    ),
  }
}

/**
 * What to tell the model on a second attempt: the finding it left, and anything it broke.
 *
 * A new warning is reported but is not on its own worth another round trip — adding an Iron
 * Law that nothing is scoped to yet raises one, and asking again would only produce a
 * different law with the same warning. A new error is: a fix that breaks the Blueprint is
 * worse than no fix.
 */
function complaintsFrom(diagnostics: readonly Diagnostic[], outcome: Outcome): string[] {
  const lines: string[] = []
  for (const diagnostic of diagnostics) {
    if (!outcome.standing.has(fingerprint(diagnostic))) continue
    lines.push(`${diagnostic.code} is still raised: ${diagnostic.message}`)
  }
  for (const finding of outcome.introduced) {
    if (finding.severity !== 'error') continue
    lines.push(`Your change introduced ${finding.code}: ${finding.message}`)
  }
  return lines
}

/** One finding, with everything the catalogue and the rules already know about its code. */
function briefOf(diagnostic: Diagnostic): FindingBrief {
  const guidance = guidanceFor(diagnostic)
  const invariant = invariantFor(diagnostic.code)
  return {
    code: diagnostic.code,
    summary: guidance.summary,
    remedy: guidance.remedy,
    message: diagnostic.message,
    severity: diagnostic.severity,
    // The invariant the rule enforces, which is the exit condition. Evaluation-only codes have
    // no rule behind them, and there the summary is all there is.
    ...(invariant !== undefined ? { invariant } : {}),
    ...(diagnostic.ref ? { ref: diagnostic.ref } : {}),
    ...(diagnostic.related ? { related: diagnostic.related } : {}),
    ...(diagnostic.data ? { evidence: diagnostic.data } : {}),
    ...(fieldsFor(diagnostic.code) ? { fields: fieldsFor(diagnostic.code) } : {}),
  }
}

/** Every artifact the findings name, each once, as its source file. */
function artifactsNamedBy(blueprint: Blueprint, diagnostics: readonly Diagnostic[]): string {
  const seen = new Set<string>()
  const rendered: string[] = []
  for (const diagnostic of diagnostics) {
    for (const ref of [diagnostic.ref, ...(diagnostic.related ?? [])]) {
      if (!ref || seen.has(refKey(ref))) continue
      seen.add(refKey(ref))
      const source = sourceOf(blueprint, ref)
      if (source) rendered.push(source)
    }
  }
  return rendered.join('\n\n')
}

/** What the user is told about a batch: which of the findings this actually closes. */
function verdictOf(diagnostics: readonly Diagnostic[], outcome: Outcome, empty: boolean): string[] {
  if (empty) {
    return [
      diagnostics.length === 1
        ? 'The model proposed no change. This finding may need a decision rather than an edit — the "How to fix" note says what it is asking for.'
        : 'The model proposed no change. These findings may need decisions rather than edits — each one\'s "How to fix" note says what it is asking for.',
    ]
  }

  const checked = diagnostics.filter((diagnostic) => outcome.checkable.has(fingerprint(diagnostic)))
  const cleared = checked.filter((diagnostic) => !outcome.standing.has(fingerprint(diagnostic)))
  const standing = checked.filter((diagnostic) => outcome.standing.has(fingerprint(diagnostic)))
  const unchecked = diagnostics.length - checked.length

  const lines: string[] = []
  if (cleared.length > 0) {
    const all = cleared.length === diagnostics.length && unchecked === 0
    lines.push(
      all
        ? `Checked: applying this clears ${codeList(cleared)}.`
        : `Checked: applying this clears ${cleared.length} of ${diagnostics.length} — ${codeList(cleared)}.`,
    )
  }
  if (standing.length > 0) {
    lines.push(
      `Still raised after this change: ${codeList(standing)}. Worth applying anyway, but it does not close ${standing.length === 1 ? 'that one' : 'those'}.`,
    )
  }
  if (unchecked > 0) {
    lines.push(
      `${unchecked} of these come from the quality review rather than the validator, so whether this closes them is a judgement, not a check.`,
    )
  }
  if (outcome.introduced.length > 0) {
    lines.push(
      `It also introduces ${outcome.introduced.length} new ${outcome.introduced.length === 1 ? 'finding' : 'findings'}: ${outcome.introduced.map((found) => found.code).join(', ')}.`,
    )
  }
  return lines
}

/** Codes and the artifacts they are about, deduplicated, for a sentence. */
function codeList(diagnostics: readonly Diagnostic[]): string {
  const labels = diagnostics.map(
    (diagnostic) => `${diagnostic.code}${diagnostic.ref ? ` on "${diagnostic.ref.id}"` : ''}`,
  )
  return [...new Set(labels)].join(', ')
}

export interface FixFindingOptions {
  diagnostic: Diagnostic
}

export interface FixFindingsOptions {
  diagnostics: readonly Diagnostic[]
}

/** One finding. The single-finding case of `fixFindings`, and the only difference is the list. */
export async function fixFinding(
  deps: OperationDeps,
  ctx: OperationContext,
  { diagnostic }: FixFindingOptions,
): Promise<ChangeSetResult> {
  const fixability = fixabilityOf(diagnostic)
  // Thrown rather than noted: a caller asking to fix exactly this one is asking a question
  // whose answer is no, and `fixabilityOf` is how the UI knows not to offer the button.
  if (!fixability.fixable) throw new AIError('bad-request', fixability.reason)
  return fixFindings(deps, ctx, { diagnostics: [diagnostic] })
}

/**
 * Several findings, in one ask (P9-17).
 *
 * Not a loop over `fixFinding`, and the reason is not speed. Two findings so often name the
 * same artifact — a skill with no `## Instructions` usually has no `## Verification` either —
 * that fixing them one at a time means two edits to one file, where the second is computed
 * from a Blueprint that does not yet have the first in it and silently overwrites it. One ask
 * produces one version of that artifact with both addressed, which is also the only version a
 * reviewer can sensibly read.
 */
export async function fixFindings(
  deps: OperationDeps,
  ctx: OperationContext,
  { diagnostics }: FixFindingsOptions,
): Promise<ChangeSetResult> {
  const notes: string[] = []
  const fixable: Diagnostic[] = []
  for (const diagnostic of diagnostics) {
    const fixability = fixabilityOf(diagnostic)
    if (fixability.fixable) fixable.push(diagnostic)
    else notes.push(`${diagnostic.code} was left alone: ${fixability.reason}`)
  }

  if (fixable.length === 0) {
    throw new AIError(
      'bad-request',
      diagnostics.length === 0
        ? 'There is nothing to fix.'
        : 'None of these can be cleared by writing artifacts.',
    )
  }

  const kinds = [...new Set(fixable.flatMap((diagnostic) => kindsFor(diagnostic)))]

  /**
   * The artifact in full, rather than as one line of a roster.
   *
   * With one finding the context builder is told to select it, which is what puts it in whole.
   * With several there is no one selection to make, so the artifacts go in beside the ask
   * instead — which is where they were repeated anyway, for the reason P9-13 records.
   */
  const [first] = fixable
  const only = fixable.length === 1 ? first : undefined
  const context = contextFor(
    { ...ctx, ...(only?.ref ? { selection: only.ref } : {}) },
    deps,
    fixFindingV1.system,
  )
  const artifacts = artifactsNamedBy(ctx.blueprint, fixable)

  const base = {
    findings: fixable.map(briefOf),
    kinds,
    ...(artifacts !== '' ? { artifacts } : {}),
    ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
  }

  /** Whether the last answer contained any artifact at all, as opposed to none. */
  let answered = false

  const attempt = async (stillWrong?: readonly string[]): Promise<Assembly> => {
    const answer = await ask(
      deps,
      fixFindingV1,
      { ...base, ...(stillWrong ? { stillWrong } : {}) },
      fixFindingOutputSchema(kinds),
      context,
    )

    answered = answer.value.artifacts.length > 0
    const drafts = draftsFrom(ctx.blueprint, fixable, answer.value.artifacts, notes)
    const assembly = assembleChangeSet({
      blueprint: ctx.blueprint,
      source: 'ai',
      // Stable, and names what is being fixed rather than the moment: asking twice for the
      // same findings produces the same id, which keeps a regenerate from stacking reviews.
      id: `ai:${fixFindingV1.id}:${fixable.map(fingerprint).sort().join('+')}`,
      summary: only
        ? `Fix ${only.code}${only.ref ? ` on ${only.ref.kind} "${only.ref.id}"` : ''}`
        : `Fix ${fixable.length} findings`,
      drafts,
    })
    if (answer.value.note !== undefined) notes.push(answer.value.note)
    return assembly
  }

  let assembly = await attempt()
  let outcome = outcomeOf(ctx.blueprint, fixable, assembly)

  // One more attempt, not a loop: a model that cannot clear a finding when told exactly what
  // is still wrong will not manage it on the fifth try, and the user is waiting. Gated on
  // having answered rather than on having produced ops — an artifact that came back with
  // nothing changed in the fields the finding was about is a wrong answer worth correcting,
  // where an empty list is a model declining, which gets its own note instead.
  const complaints = complaintsFrom(fixable, outcome)
  if (complaints.length > 0 && answered) {
    const retry = await attempt(complaints)
    const retryOutcome = outcomeOf(ctx.blueprint, fixable, retry)
    // Kept only if it is actually better: more of the findings closed, or the same number
    // closed with less broken. A second answer nobody can tell apart is not an improvement.
    const better =
      retryOutcome.standing.size < outcome.standing.size ||
      (retryOutcome.standing.size === outcome.standing.size &&
        retryOutcome.introduced.length < outcome.introduced.length)
    if (better) {
      assembly = retry
      outcome = retryOutcome
    }
  }

  return {
    changeSet: assembly.changeSet,
    notes: [
      ...notes,
      ...assembly.notes,
      ...verdictOf(fixable, outcome, assembly.changeSet.ops.length === 0),
    ],
    contextTrimmed: context.trimmed,
  }
}

/**
 * The artifacts the model wrote, with the ids the findings named put back where they belong.
 *
 * Same trap as `improveArtifact`: a model asked to add a description tidies the id on the way
 * past, and an id it changed is a create op beside an untouched original — which reads as a
 * duplicate rather than as the fix. Pairing is only safe when it is unambiguous: exactly one
 * artifact of a kind came back under an id nothing recognises, and exactly one finding of that
 * kind is missing an answer. Anything less certain is reported rather than guessed at, because
 * guessing here overwrites the wrong artifact silently.
 */
function draftsFrom(
  blueprint: Blueprint,
  diagnostics: readonly Diagnostic[],
  proposals: readonly { kind: EntityKind; artifact: unknown; note?: string | undefined }[],
  notes: string[],
): Draft[] {
  const pinned = new Map<unknown, string>()

  const refs = diagnostics
    .map((diagnostic) => diagnostic.ref)
    .filter((ref): ref is EntityRef => ref !== undefined)

  for (const kind of new Set(refs.map((ref) => ref.kind))) {
    const returned = proposals.filter((proposal) => proposal.kind === kind)
    const returnedIds = new Set(returned.map((proposal) => idOf(proposal.artifact)))
    const named = refs.filter((ref) => ref.kind === kind).map((ref) => ref.id)

    const unanswered = [...new Set(named)].filter((id) => !returnedIds.has(id))
    const strays = returned.filter((proposal) => {
      const id = idOf(proposal.artifact)
      return (
        id !== undefined && !named.includes(id) && findEntity(blueprint, kind, id) === undefined
      )
    })

    const [stray] = strays
    const [orphaned] = unanswered
    if (
      stray !== undefined &&
      orphaned !== undefined &&
      strays.length === 1 &&
      unanswered.length === 1
    ) {
      pinned.set(stray, orphaned)
    } else if (unanswered.length > 0 && strays.length > 0) {
      notes.push(
        `The model returned ${strays.length} new ${kind} artifacts while ${unanswered.length} it was asked about came back unchanged, so nothing was assumed to be a rename. Check the review for a duplicate before applying.`,
      )
    }
  }

  return proposals.map((proposal) => {
    const id = pinned.get(proposal)
    const named =
      id !== undefined && isRecord(proposal.artifact)
        ? { ...proposal.artifact, id }
        : proposal.artifact
    return {
      kind: proposal.kind,
      value: onlyWhatWasAsked(blueprint, diagnostics, proposal.kind, named, notes),
      ...(proposal.note !== undefined ? { note: proposal.note } : {}),
    }
  })
}

/** Nothing in it: missing, an empty string, an empty list, or an object with no keys. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (isRecord(value)) return Object.values(value).every(isEmpty)
  return false
}

/**
 * A fix changes what the finding was about and nothing else (P9-18).
 *
 * Reported from use: asked to add a `## Verification` section to a skill, a model returned the
 * skill with the section added — and with `activation` emptied, `referenceIds` and
 * `allowedToolIds` gone and `tags` dropped. It had answered the question and lost half the
 * artifact doing it. The prompt says to return every other field exactly as given, and a
 * prompt is advice; this is the part that holds.
 *
 * The rule is the same one the rest of the operation already knows. `FIELDS_BY_CODE` says
 * which fields each code is about, so when every finding about an artifact names its fields,
 * those are the only fields that may change: the proposal is merged onto the artifact as it
 * stands, and everything outside that list comes back untouched. That also keeps what the
 * model was never shown — `metadata` the reader preserved, a workflow's hand-tidied positions
 * — which the AI schemas strip and a wholesale replacement would therefore silently drop.
 *
 * Where a finding has no field list — a contradiction, an orphan — there is no allow-list to
 * apply, so the weaker rule stands in: anything the model left empty or omitted is restored,
 * and anything it filled in wins. That cannot invent content; it can only give back what was
 * already there.
 */
function onlyWhatWasAsked(
  blueprint: Blueprint,
  diagnostics: readonly Diagnostic[],
  kind: EntityKind,
  proposed: unknown,
  notes: string[],
): unknown {
  const id = idOf(proposed)
  if (id === undefined || !isRecord(proposed)) return proposed

  // A create: there is nothing to preserve, and nothing to compare against.
  const original = findEntity(blueprint, kind, id)
  if (!original) return proposed

  const about = diagnostics.filter(
    (diagnostic) => diagnostic.ref?.kind === kind && diagnostic.ref.id === id,
  )
  if (about.length === 0) return proposed

  const lists = about.map((diagnostic) => fieldsFor(diagnostic.code))
  const allowed = lists.every((list) => list !== undefined)
    ? new Set(lists.flatMap((list) => list ?? []))
    : undefined

  const merged: Record<string, unknown> = { ...(original as unknown as Record<string, unknown>) }
  const rejected: string[] = []
  const restored: string[] = []

  for (const [field, value] of Object.entries(proposed)) {
    if (field === 'id') continue
    if (allowed) {
      if (allowed.has(field)) {
        merged[field] = value
      } else if (subfieldsAllowed(allowed, field).length > 0) {
        // `action.command`: the model may change one key inside the object and no other.
        merged[field] = mergeSubfields(merged[field], value, subfieldsAllowed(allowed, field))
      } else if (!equal(value, merged[field])) {
        rejected.push(field)
      }
      continue
    }
    if (isEmpty(value) && !isEmpty(merged[field])) restored.push(field)
    else merged[field] = value
  }

  if (rejected.length > 0) {
    notes.push(
      `Kept ${rejected.join(', ')} on "${id}" as ${rejected.length === 1 ? 'it was' : 'they were'}: the ${about.length === 1 ? 'finding was' : 'findings were'} about ${[...(allowed ?? [])].join(', ')}.`,
    )
  }
  if (restored.length > 0) {
    notes.push(
      `Put back ${restored.join(', ')} on "${id}", which came back empty and was not what the ${about.length === 1 ? 'finding was' : 'findings were'} about.`,
    )
  }
  return merged
}

/** The keys inside `field` the allow-list names as `field.key`. */
function subfieldsAllowed(allowed: ReadonlySet<string>, field: string): string[] {
  return [...allowed]
    .filter((entry) => entry.startsWith(`${field}.`))
    .map((entry) => entry.slice(field.length + 1))
}

/** The original object with only the named keys taken from the proposal. */
function mergeSubfields(original: unknown, proposed: unknown, keys: readonly string[]): unknown {
  if (!isRecord(original) || !isRecord(proposed)) return original
  const merged: Record<string, unknown> = { ...original }
  for (const key of keys) if (key in proposed) merged[key] = proposed[key]
  return merged
}

/** Deep enough for the shapes an entity holds: strings, numbers, arrays and plain objects. */
function equal(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b)
}
