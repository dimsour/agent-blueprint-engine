/**
 * Putting the whole Blueprint right (P9-40).
 *
 * Reported from use: the assistant could fix one finding, or every finding of one dimension,
 * and both are told to touch nothing else — which is right for a button beside a row and
 * wrong for the question "what is wrong with this Blueprint, and what should I do about it?".
 * An orphan Iron Law is the case that showed it. The single fix can attach it to an agent, and
 * does; whether it *should* be attached, or duplicates a law the agent already has, or forbids
 * something nothing in the Blueprint does, is a judgement that needs the whole design on the
 * table — and one of its honest answers is a deletion, which no per-finding fix proposes.
 *
 * So this is `fixFindings` with three things changed. Its input is everything both passes
 * raise, not a list it was handed. Its prompt asks for a decision per finding — change, create,
 * delete, keep — with the reason, and those reasons reach the reviewer as notes beside the
 * diff. And it may delete, under one rule the code enforces rather than the prompt: only an
 * artifact nothing refers to, of a kind the graph counts as orphanable. The model reasons;
 * the graph decides whether the deletion is safe.
 *
 * Everything else is shared with the single fix on purpose: the same briefs, the same
 * artifact rendering, the same protection against an answer that comes back half empty, the
 * same throwaway-Blueprint check with one more attempt when the validator disagrees.
 */
import {
  buildDependencyGraph,
  changeOpId,
  type ChangeOp,
  type Diagnostic,
  type DependencyGraph,
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityKind,
  type EntityRef,
  findEntity,
  ORPHANABLE_KINDS,
  refKey,
} from '@agent-blueprint/core'

import { fixBlueprintV1 } from '../prompts/fix-blueprint.v1'
import { type FixDecision, fixBlueprintOutputSchema } from '../schemas/outputs'
import { assembleChangeSet, type Assembly, type Draft } from './assemble'
import { allFindings, fingerprint } from './check'
import {
  artifactsNamedBy,
  briefOf,
  complaintsFrom,
  draftsFrom,
  fixabilityOf,
  kindsFor,
  outcomeOf,
  restoringEmptied,
  verdictOf,
} from './fix-finding'
import { ask, contextFor } from './run'
import type { ChangeSetResult, OperationContext, OperationDeps } from './types'

/**
 * How many findings go in one ask.
 *
 * Every finding brings its brief and the artifact it names, and past a point the ask is longer
 * than the Blueprint. Errors first, then warnings, then by code and artifact so the same
 * Blueprint always gets the same batch; what is left over is said, and the next pass gets it.
 */
export const FIX_BLUEPRINT_BATCH = 12

const SEVERITY_ORDER: Record<Diagnostic['severity'], number> = { error: 0, warning: 1, info: 2 }

export interface FixBlueprintOptions {
  /**
   * The findings to work from. Defaults to everything the validator and the evaluation raise
   * against the Blueprint as it stands, plus whatever the caller already had — the reader's
   * findings, say, which no pass over the model can recompute.
   */
  diagnostics?: readonly Diagnostic[]
}

/** Everything raised, deduplicated, errors and warnings only, in a stable order. */
function findingsFor(
  ctx: OperationContext,
  given: readonly Diagnostic[] | undefined,
): Diagnostic[] {
  const seen = new Set<string>()
  const out: Diagnostic[] = []
  for (const finding of [...(given ?? ctx.diagnostics ?? []), ...allFindings(ctx.blueprint)]) {
    const key = fingerprint(finding)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(finding)
  }
  return out.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.code.localeCompare(b.code) ||
      (a.ref ? refKey(a.ref) : '').localeCompare(b.ref ? refKey(b.ref) : ''),
  )
}

/** The Blueprint's own word for a kind, lower-case, for a sentence. */
function labelOf(kind: EntityKind): string {
  return ENTITY_KIND_INFO[kind].label.toLowerCase()
}

/** "an iron law", "a skill": the kind with its article, for a sentence. */
function aKind(kind: EntityKind): string {
  const label = labelOf(kind)
  return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`
}

/** "the iron law "x"", for a sentence about an artifact. */
function nameOf(ref: EntityRef): string {
  return `the ${labelOf(ref.kind)} "${ref.id}"`
}

/**
 * How the artifacts the findings name sit in the graph: what each uses, what uses it, and —
 * for one nothing uses — what holds the other artifacts of its kind, which is where it would
 * be wired if it belongs anywhere. This is the evidence the decision is made on, and it comes
 * from the graph rather than from the model's reading of the roster.
 */
function connectionsOf(
  graph: DependencyGraph,
  ctx: OperationContext,
  findings: readonly Diagnostic[],
): string {
  const named = new Map<string, EntityRef>()
  for (const finding of findings) {
    for (const ref of [finding.ref, ...(finding.related ?? [])]) {
      if (ref && findEntity(ctx.blueprint, ref.kind, ref.id)) named.set(refKey(ref), ref)
    }
  }
  const lines: string[] = []
  for (const ref of named.values()) {
    const usedBy = graph.dependentsOf(ref)
    const uses = graph.dependenciesOf(ref)
    lines.push(`- ${nameOf(ref)}:`)
    lines.push(
      usedBy.length === 0
        ? '  - used by nothing'
        : `  - used by ${usedBy.map((edge) => `${nameOf(edge.from)} (${edge.relation})`).join(', ')}`,
    )
    if (uses.length > 0) {
      lines.push(
        `  - uses ${uses.map((edge) => `${nameOf(edge.to)} (${edge.relation})`).join(', ')}`,
      )
    }
    const scope = scopeOf(ctx, ref)
    if (scope) lines.push(`  - ${scope}`)
    if (usedBy.length === 0 && ORPHANABLE_KINDS.includes(ref.kind)) {
      lines.push(...holdersOf(ctx, ref.kind))
    }
  }
  return lines.join('\n')
}

/**
 * What a law's or a rule's own scope reaches. The compiler reads this, not the agents' lists,
 * to decide whose instructions it goes into, so it is the first thing to say about one.
 */
function scopeOf(ctx: OperationContext, ref: EntityRef): string | undefined {
  if (ref.kind !== 'iron-law' && ref.kind !== 'rule') return undefined
  const entity = findEntity(ctx.blueprint, ref.kind, ref.id) as
    { scope: { all: boolean; agentIds: string[]; workflowIds: string[] } } | undefined
  if (!entity) return undefined
  const { scope } = entity
  if (scope.all) return 'its scope applies it to every agent, so it is in every compiled file'
  const reaches = [
    ...scope.agentIds.map((id) => `the agent "${id}"`),
    ...scope.workflowIds.map((id) => `the workflow "${id}"`),
  ]
  return reaches.length === 0
    ? 'its scope names no agent and no workflow and is not set to all, so it reaches no compiled file'
    : `its scope applies it to ${reaches.join(', ')}`
}

/** Which agents hold which artifacts of a kind, so the model can see where an orphan fits. */
function holdersOf(ctx: OperationContext, kind: EntityKind): string[] {
  const field = LIST_FOR_KIND[kind]
  if (!field) return []
  return ctx.blueprint.agents.map((agent) => {
    const held = (agent as unknown as Record<string, string[]>)[field] ?? []
    return held.length === 0
      ? `  - the agent "${agent.id}" holds no ${labelOf(kind)}`
      : `  - the agent "${agent.id}" holds the ${labelOf(kind)}s: ${held.join(', ')}`
  })
}

const LIST_FOR_KIND: Partial<Record<EntityKind, string>> = {
  skill: 'skillIds',
  workflow: 'workflowIds',
  'iron-law': 'ironLawIds',
  rule: 'ruleIds',
  tool: 'toolIds',
  reference: 'referenceIds',
  memory: 'memoryIds',
}

/** A decision, as one line of the review. */
function decisionLine(decision: FixDecision): string {
  const where = decision.ref ? ` on ${nameOf(decision.ref)}` : ''
  return `${decision.code}${where} — ${decision.action}: ${decision.reason}`
}

/**
 * The deletions the model asked for that the graph agrees are safe, as ops.
 *
 * Three refusals, each reported: a kind that is not one of ours, an artifact that does not
 * exist, and — the one that matters — an artifact something still refers to. An agent is never
 * deletable here, whatever the graph says: a Blueprint with nobody in it is not a fix.
 */
function deletionsFrom(
  graph: DependencyGraph,
  ctx: OperationContext,
  deletions: readonly { kind: string; id: string; reason: string }[],
  notes: string[],
): ChangeOp[] {
  const ops: ChangeOp[] = []
  const seen = new Set<string>()
  for (const deletion of deletions) {
    const kind = ENTITY_KINDS.find((candidate) => candidate === deletion.kind)
    if (!kind) {
      notes.push(
        `Ignored a deletion of "${deletion.id}": "${deletion.kind}" is not a kind of artifact.`,
      )
      continue
    }
    const ref: EntityRef = { kind, id: deletion.id }
    if (seen.has(refKey(ref))) continue
    seen.add(refKey(ref))

    const entity = findEntity(ctx.blueprint, kind, deletion.id)
    if (!entity) {
      notes.push(`Ignored a deletion of ${nameOf(ref)}: there is no such artifact.`)
      continue
    }
    if (!ORPHANABLE_KINDS.includes(kind)) {
      notes.push(
        `Kept ${nameOf(ref)}: ${aKind(kind)} is not something this fix deletes. Remove it from the inspector if you mean to.`,
      )
      continue
    }
    const holders = graph.dependentsOf(ref)
    if (holders.length > 0) {
      notes.push(
        `Kept ${nameOf(ref)}: ${holders.length === 1 ? 'something still refers' : `${holders.length} artifacts still refer`} to it — ${holders.map((edge) => nameOf(edge.from)).join(', ')}.`,
      )
      continue
    }
    const body = { type: 'delete', kind, entityId: deletion.id, before: entity } as const
    ops.push({ id: changeOpId(body), ...body, note: deletion.reason })
  }
  return ops
}

/**
 * Everything raised against the Blueprint, decided on in one ask.
 *
 * Nothing raised is a result, not an error: the panel offers this button whatever the state of
 * the Blueprint, and "there is nothing to fix" is the answer it should show.
 */
export async function fixBlueprint(
  deps: OperationDeps,
  ctx: OperationContext,
  options: FixBlueprintOptions = {},
): Promise<ChangeSetResult> {
  const notes: string[] = []
  const all = findingsFor(ctx, options.diagnostics)
  const considered = all.filter((finding) => finding.severity !== 'info')
  const suggestions = all.length - considered.length

  const fixable: Diagnostic[] = []
  for (const finding of considered) {
    const fixability = fixabilityOf(finding)
    if (fixability.fixable) fixable.push(finding)
    else notes.push(`${finding.code} was left alone: ${fixability.reason}`)
  }

  const empty = (summary: string): ChangeSetResult => ({
    changeSet: { id: `ai:${fixBlueprintV1.id}:nothing`, source: 'ai', summary, ops: [] },
    notes,
    contextTrimmed: false,
  })
  // Suggestions stay with the row that raised them: a whole-Blueprint pass over what is merely
  // advisable would be a rewrite, and the per-finding control is right there for the ones the
  // author wants.
  const leftAsSuggestions = () => {
    if (suggestions === 0) return
    notes.push(
      `${suggestions} ${suggestions === 1 ? 'suggestion was' : 'suggestions were'} left for the artifact they are about; this fix works on errors and warnings.`,
    )
  }
  if (all.length === 0) return empty('Nothing is raised against this Blueprint.')
  if (considered.length === 0) {
    leftAsSuggestions()
    return empty('Nothing above a suggestion is raised against this Blueprint.')
  }
  if (fixable.length === 0) {
    leftAsSuggestions()
    return empty('Nothing here can be cleared by writing artifacts.')
  }

  const batch = fixable.slice(0, FIX_BLUEPRINT_BATCH)
  if (fixable.length > batch.length) {
    notes.push(
      `Working on the ${batch.length} most severe of ${fixable.length} findings; run this again for the rest once these are applied.`,
    )
  }
  leftAsSuggestions()

  const graph = buildDependencyGraph(ctx.blueprint)
  const kinds = [...new Set(batch.flatMap((finding) => kindsFor(finding)))]
  const context = contextFor(ctx, deps, fixBlueprintV1.system)
  const artifacts = artifactsNamedBy(ctx.blueprint, batch)
  const base = {
    findings: batch.map(briefOf),
    connections: connectionsOf(graph, ctx, batch),
    kinds,
    ...(artifacts !== '' ? { artifacts } : {}),
    ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
  }

  let answered = false
  const attempt = async (
    stillWrong?: readonly string[],
  ): Promise<{ assembly: Assembly; decisions: string[] }> => {
    const answer = await ask(
      deps,
      fixBlueprintV1,
      { ...base, ...(stillWrong ? { stillWrong } : {}) },
      fixBlueprintOutputSchema(kinds),
      context,
    )
    const { value } = answer
    answered = value.artifacts.length > 0 || value.deletions.length > 0

    const attemptNotes: string[] = []
    // Two guards, in order. Whatever came back empty is restored first, for every artifact
    // that exists — the agent returned to hold an orphan has no finding to say which of its
    // fields were in play. Then the single fix's own rule: an artifact a finding names may
    // change the fields that code is about and no other, so a law asked about its scope does
    // not come back with its severity raised (reported from use).
    const drafts: Draft[] = draftsFrom(
      ctx.blueprint,
      batch,
      value.artifacts.map((proposal) => ({
        ...proposal,
        artifact: restoringEmptied(ctx.blueprint, proposal.kind, proposal.artifact, attemptNotes),
      })),
      attemptNotes,
    )
    const assembly = assembleChangeSet({
      blueprint: ctx.blueprint,
      source: 'ai',
      id: `ai:${fixBlueprintV1.id}:${batch.map(fingerprint).sort().join('+')}`,
      summary: value.note ?? `Fix ${batch.length} ${batch.length === 1 ? 'finding' : 'findings'}`,
      drafts,
    })
    const deletions = deletionsFrom(graph, ctx, value.deletions, attemptNotes)
    // The artifact an op deletes cannot also be one an op updates: the deletion wins, and the
    // reviewer is told the update was dropped rather than shown two rows about one artifact.
    const deleted = new Set(
      deletions.flatMap((op) => (op.type === 'delete' ? [`${op.kind}:${op.entityId}`] : [])),
    )
    const ops = [
      ...assembly.changeSet.ops.filter((op) => {
        if (op.type === 'update-blueprint') return true
        if (!deleted.has(`${op.kind}:${op.entityId}`)) return true
        attemptNotes.push(
          `Dropped a change to ${nameOf({ kind: op.kind, id: op.entityId })}: it is also being deleted.`,
        )
        return false
      }),
      ...deletions,
    ]
    return {
      assembly: {
        changeSet: { ...assembly.changeSet, ops },
        notes: [...assembly.notes, ...attemptNotes],
      },
      decisions: value.decisions.map(decisionLine),
    }
  }

  let { assembly, decisions } = await attempt()
  let outcome = outcomeOf(ctx.blueprint, batch, assembly)

  // One more attempt when the validator disagrees, kept only when it is better — the same
  // rule as the single fix, for the same reason: the user is waiting.
  const complaints = complaintsFrom(batch, outcome)
  if (complaints.length > 0 && answered) {
    const retry = await attempt(complaints)
    const retryOutcome = outcomeOf(ctx.blueprint, batch, retry.assembly)
    const better =
      retryOutcome.standing.size < outcome.standing.size ||
      (retryOutcome.standing.size === outcome.standing.size &&
        retryOutcome.introduced.length < outcome.introduced.length)
    if (better) {
      assembly = retry.assembly
      decisions = retry.decisions
      outcome = retryOutcome
    }
  }

  return {
    changeSet: assembly.changeSet,
    notes: [
      ...decisions,
      ...notes,
      ...assembly.notes,
      ...verdictOf(batch, outcome, assembly.changeSet.ops.length === 0),
    ],
    contextTrimmed: context.trimmed,
  }
}
