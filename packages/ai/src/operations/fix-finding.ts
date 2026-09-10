/**
 * Clearing one finding.
 *
 * Every other operation starts from what the user wants; this one starts from what the
 * validator already worked out. That makes it the cheapest useful thing a model can do here —
 * the problem is stated, the artifact is named, and the catalogue already carries the
 * instructions for fixing it in `remedy`, written for a person in P9-10 and reused verbatim
 * as the steering here. One prompt, one behaviour per code, and no second catalogue.
 *
 * The hard part is not the prompt but knowing when to refuse. A model cannot restore a file
 * that is missing from disk, cannot rename an artifact without breaking every reference to
 * it, and cannot enable a compile target. Offering a button that produces an empty ChangeSet
 * for those teaches the user the feature does not work. `fixabilityOf` says no, and says why,
 * so the UI can show the reason instead of the button.
 */
import {
  type Diagnostic,
  diagnosticCode,
  type EntityKind,
  ENTITY_KINDS,
} from '@agent-blueprint/core'

import { AIError } from '../client/errors'
import { fixFindingV1 } from '../prompts/fix-finding.v1'
import { fixFindingOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Draft } from './assemble'
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
  const notesFromPinning: string[] = []

  const answer = await ask(
    deps,
    fixFindingV1,
    {
      code: diagnostic.code,
      summary: guidance.summary,
      remedy: guidance.remedy,
      message: diagnostic.message,
      kinds: fixability.kinds,
      ...(diagnostic.ref ? { ref: diagnostic.ref } : {}),
      ...(diagnostic.related ? { related: diagnostic.related } : {}),
      ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
    },
    fixFindingOutputSchema(fixability.kinds),
    context,
  )

  /**
   * The artifact the finding is about keeps its id, whatever the model called it.
   *
   * Same trap as `improveArtifact`: a model asked to add a description often tidies the id
   * on the way past, and an id it changed is a create op beside an untouched original —
   * which reads as a duplicate rather than as the fix. Pinned only when exactly one artifact
   * of that kind came back: with two, there is no way to tell which is the edit and which is
   * the new one, and guessing would overwrite the wrong artifact silently.
   */
  const target = diagnostic.ref
  const sameKind = target
    ? answer.value.artifacts.filter((proposal) => proposal.kind === target.kind)
    : []
  const pinnedId = target && sameKind.length === 1 ? target.id : undefined
  const pinned = pinnedId === undefined ? undefined : sameKind[0]
  if (target && sameKind.length > 1) {
    notesFromPinning.push(
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

  const { changeSet, notes } = assembleChangeSet({
    blueprint: ctx.blueprint,
    source: 'ai',
    // Stable, and names the finding rather than the moment: asking twice for the same finding
    // produces the same id, which is what keeps a regenerate from stacking up reviews.
    id: `ai:${fixFindingV1.id}:${diagnostic.code}:${diagnostic.ref?.id ?? 'blueprint'}`,
    summary: `Fix ${diagnostic.code}${diagnostic.ref ? ` on ${diagnostic.ref.kind} "${diagnostic.ref.id}"` : ''}`,
    drafts,
  })

  notes.push(...notesFromPinning)
  if (answer.value.note !== undefined) notes.unshift(answer.value.note)
  if (changeSet.ops.length === 0) {
    notes.push(
      'The model proposed no change. This finding may need a decision rather than an edit — the "How to fix" note says what it is asking for.',
    )
  }
  return { changeSet, notes, contextTrimmed: context.trimmed }
}
