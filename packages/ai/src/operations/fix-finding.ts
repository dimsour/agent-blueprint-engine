/**
 * Clearing one finding.
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
  validateBlueprint,
} from '@agent-blueprint/core'

import { AIError } from '../client/errors'
import { renderEntity } from '../context/render'
import { fixFindingV1 } from '../prompts/fix-finding.v1'
import { fixFindingOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Assembly, type Draft } from './assemble'
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
/**
 * Which fields of an artifact a code is actually about (P9-13).
 *
 * The remedy says it in prose — "Write one sentence in the Description field" — and prose is
 * what a model paraphrases. Naming the fields is what turns "improve this skill" into "change
 * description and return the rest untouched", which is the difference between a diff the user
 * reads in a second and one they have to audit.
 *
 * Absent means the code is not about particular fields: a contradiction is about what two
 * artifacts say, and a Blueprint with no Iron Laws is about none of them.
 */
const FIELDS_BY_CODE: Record<string, readonly string[]> = {
  'BP-DESC-001': ['description'],
  'BP-AGENT-001': ['responsibilities'],
  'BP-AGENT-011': ['skillIds'],
  'BP-AGENT-012': ['permissions'],
  'BP-SKILL-001': ['description', 'body'],
  'BP-SKILL-010': ['activation'],
  'BP-SKILL-011': ['body'],
  'BP-WF-001': ['entryNodeId', 'nodes'],
  'BP-WF-002': ['nodes', 'edges'],
  'BP-WF-003': ['edges'],
  'BP-WF-004': ['nodes'],
  'BP-WF-005': ['nodes'],
  'BP-WF-010': ['edges'],
  'BP-WF-011': ['nodes', 'edges'],
  'BP-WF-012': ['edges'],
  'BP-WF-013': ['nodes', 'edges'],
  'BP-WF-014': ['nodes', 'edges'],
  'BP-LAW-001': ['scope'],
  'BP-LAW-011': ['criteria'],
  'BP-GATE-010': ['criteria'],
  'BP-HOOK-010': ['action'],
  'BP-REF-001': ['skillIds', 'workflowIds', 'ironLawIds', 'ruleIds', 'toolIds', 'referenceIds'],
  'BP-REQ-001': ['checks'],
  'BP-REQ-002': ['checks'],
  'BP-REQ-003': ['checks'],
  'BP-REQ-005': ['checks'],
  'BP-CODEX-002': ['body'],
  'BP-EVAL-SKILL-001': ['body'],
  'BP-EVAL-SKILL-002': ['body'],
  'BP-EVAL-AGENT-001': ['outputRequirements'],
  'BP-EVAL-WF-001': ['triggers'],
  'BP-EVAL-LAW-001': ['rationale'],
  'BP-EVAL-LAW-002': ['examples', 'counterexamples'],
  'BP-EVAL-COMPLEX-001': ['nodes', 'edges'],
  'BP-EVAL-COMPLEX-002': ['description', 'whenToUse'],
  'BP-EVAL-COMPLEX-003': ['skillIds'],
  'BP-SAFETY-001': ['permissions'],
  'BP-SAFETY-002': ['permissions'],
  'BP-ORPHAN-001': ['activation', 'skillIds'],
  'BP-ORPHAN-002': ['workflowIds', 'triggers'],
  'BP-ORPHAN-003': ['scope', 'ironLawIds'],
  'BP-ORPHAN-004': ['scope', 'paths', 'ruleIds'],
  'BP-ORPHAN-005': ['nodes'],
  'BP-ORPHAN-006': ['toolIds'],
  'BP-ORPHAN-007': ['referenceIds'],
  'BP-ORPHAN-008': ['memoryIds'],
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

/**
 * A finding, identified well enough to tell whether a fix cleared it.
 *
 * Code and artifact, not the message: a message often carries a count or a name the fix
 * legitimately changes, and a finding that came back reworded is still the same finding.
 */
function fingerprint(finding: Diagnostic): string {
  return `${finding.code}|${finding.ref ? refKey(finding.ref) : ''}`
}

interface Outcome {
  /**
   * Whether `validateBlueprint` can decide this code at all. Only codes the catalogue marks
   * `source: 'validation'` come from the rules; the quality findings are computed by the
   * evaluation pass and the reader's come from files, so re-running the validator says
   * nothing about either. Claiming "cleared" for one of those would be a lie by omission.
   */
  checked: boolean
  /** The finding is no longer raised against the Blueprint this proposal would produce. */
  cleared: boolean
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
function outcomeOf(blueprint: Blueprint, diagnostic: Diagnostic, assembly: Assembly): Outcome {
  const checked = diagnosticCode(diagnostic.code)?.source === 'validation'
  if (assembly.changeSet.ops.length === 0) {
    return { checked, cleared: false, introduced: [] }
  }
  const before = new Set(validateBlueprint(blueprint).map(fingerprint))
  const applied = applyChangeSet(blueprint, assembly.changeSet)
  const after = validateBlueprint(applied.blueprint)
  return {
    checked,
    cleared: !after.some((finding) => fingerprint(finding) === fingerprint(diagnostic)),
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
function complaintsFrom(diagnostic: Diagnostic, outcome: Outcome): string[] {
  const lines: string[] = []
  if (outcome.checked && !outcome.cleared) {
    lines.push(`${diagnostic.code} is still raised: ${diagnostic.message}`)
  }
  for (const finding of outcome.introduced) {
    if (finding.severity !== 'error') continue
    lines.push(`Your change introduced ${finding.code}: ${finding.message}`)
  }
  return lines
}

/** What to tell the user. A fix that did not fix it has to say so before it is applied. */
function verdictOf(diagnostic: Diagnostic, outcome: Outcome, empty: boolean): string[] {
  if (empty) {
    return [
      'The model proposed no change. This finding may need a decision rather than an edit — the "How to fix" note says what it is asking for.',
    ]
  }
  const lines = [
    !outcome.checked
      ? `Not re-checked: ${diagnostic.code} comes from the quality review rather than the validator, so whether this closes it is a judgement.`
      : outcome.cleared
        ? `Checked: applying this clears ${diagnostic.code}.`
        : `Checked: ${diagnostic.code} is still raised after this change. It may be worth applying anyway, but it does not close the finding on its own.`,
  ]
  if (outcome.introduced.length > 0) {
    lines.push(
      `It also introduces ${outcome.introduced.length} new ${outcome.introduced.length === 1 ? 'finding' : 'findings'}: ${outcome.introduced.map((finding) => finding.code).join(', ')}.`,
    )
  }
  return lines
}

export interface FixFindingOptions {
  diagnostic: Diagnostic
}

export async function fixFinding(
  deps: OperationDeps,
  ctx: OperationContext,
  { diagnostic }: FixFindingOptions,
): Promise<ChangeSetResult> {
  const fixability = fixabilityOf(diagnostic)
  if (!fixability.fixable) {
    throw new AIError('bad-request', fixability.reason)
  }

  // The artifact the finding is about, so the context builder puts it in full rather than as
  // one line of a roster. Without this the model is asked to revise something it can only see
  // summarised, which is how a "fix" comes back having invented the body it replaced.
  const context = contextFor(
    { ...ctx, ...(diagnostic.ref ? { selection: diagnostic.ref } : {}) },
    deps,
    fixFindingV1.system,
  )
  const guidance = guidanceFor(diagnostic)
  const invariant = invariantFor(diagnostic.code)

  /**
   * The artifact again, immediately before the ask.
   *
   * It is already in the context, thousands of tokens earlier, under a heading about what the
   * user is looking at. Repeating it next to the instruction is the difference between
   * "revise the skill you read a while ago" and "here it is, change this field" — and it
   * costs one artifact's worth of budget, which is the cheapest accuracy available here.
   */
  const current = diagnostic.ref ? sourceOf(ctx.blueprint, diagnostic.ref) : undefined
  const alsoNamed = (diagnostic.related ?? [])
    .map((ref) => sourceOf(ctx.blueprint, ref))
    .filter((text): text is string => text !== undefined)
    .join('\n\n')

  const base = {
    code: diagnostic.code,
    summary: guidance.summary,
    remedy: guidance.remedy,
    message: diagnostic.message,
    severity: diagnostic.severity,
    kinds: fixability.kinds,
    // The invariant the rule enforces, which is the exit condition. Evaluation-only codes have
    // no rule behind them, and there the summary is all there is.
    ...(invariant !== undefined ? { invariant } : {}),
    ...(diagnostic.ref ? { ref: diagnostic.ref } : {}),
    ...(diagnostic.related ? { related: diagnostic.related } : {}),
    ...(diagnostic.data ? { evidence: diagnostic.data } : {}),
    ...(FIELDS_BY_CODE[diagnostic.code] ? { fields: FIELDS_BY_CODE[diagnostic.code] } : {}),
    ...(current !== undefined ? { current } : {}),
    ...(alsoNamed !== '' ? { alsoNamed } : {}),
    ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
  }

  const notes: string[] = []

  const attempt = async (stillWrong?: readonly string[]): Promise<Assembly> => {
    const answer = await ask(
      deps,
      fixFindingV1,
      { ...base, ...(stillWrong ? { stillWrong } : {}) },
      fixFindingOutputSchema(fixability.kinds),
      context,
    )

    /**
     * The artifact the finding is about keeps its id, whatever the model called it.
     *
     * Same trap as improveArtifact: a model asked to add a description often tidies the id on
     * the way past, and an id it changed is a create op beside an untouched original — which
     * reads as a duplicate rather than as the fix. Pinned only when exactly one artifact of
     * that kind came back: with two, there is no way to tell which is the edit and which is
     * the new one, and guessing would overwrite the wrong artifact silently.
     */
    const target = diagnostic.ref
    const sameKind = target
      ? answer.value.artifacts.filter((proposal) => proposal.kind === target.kind)
      : []
    const pinnedId = target && sameKind.length === 1 ? target.id : undefined
    const pinned = pinnedId === undefined ? undefined : sameKind[0]
    if (target && sameKind.length > 1) {
      notes.push(
        `The model returned ${sameKind.length} ${target.kind} artifacts, so none was assumed to be "${target.id}". Check the review for a duplicate before applying.`,
      )
    }

    const drafts: Draft[] = answer.value.artifacts.map((proposal) => ({
      kind: proposal.kind,
      value:
        proposal === pinned && pinnedId !== undefined && isRecord(proposal.artifact)
          ? { ...proposal.artifact, id: pinnedId }
          : proposal.artifact,
      ...(proposal.note !== undefined ? { note: proposal.note } : {}),
    }))

    const assembly = assembleChangeSet({
      blueprint: ctx.blueprint,
      source: 'ai',
      // Stable, and names the finding rather than the moment: asking twice for the same
      // finding produces the same id, which keeps a regenerate from stacking up reviews.
      id: `ai:${fixFindingV1.id}:${diagnostic.code}:${diagnostic.ref?.id ?? 'blueprint'}`,
      summary: `Fix ${diagnostic.code}${diagnostic.ref ? ` on ${diagnostic.ref.kind} "${diagnostic.ref.id}"` : ''}`,
      drafts,
    })
    if (answer.value.note !== undefined) notes.push(answer.value.note)
    return assembly
  }

  let assembly = await attempt()
  let outcome = outcomeOf(ctx.blueprint, diagnostic, assembly)

  // One more attempt, not a loop: a model that cannot clear a finding when told exactly what
  // is still wrong will not manage it on the fifth try, and the user is waiting. Only when
  // there is something concrete to say — an answer with no ops gets its own note instead.
  const complaints = complaintsFrom(diagnostic, outcome)
  if (complaints.length > 0 && assembly.changeSet.ops.length > 0) {
    const retry = await attempt(complaints)
    const retryOutcome = outcomeOf(ctx.blueprint, diagnostic, retry)
    // Kept only if it is actually better. A second attempt that clears no more and breaks
    // more than the first is not an improvement, and the user would never know.
    const better =
      (retryOutcome.cleared && !outcome.cleared) ||
      (retryOutcome.cleared === outcome.cleared &&
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
      ...verdictOf(diagnostic, outcome, assembly.changeSet.ops.length === 0),
    ],
    contextTrimmed: context.trimmed,
  }
}
