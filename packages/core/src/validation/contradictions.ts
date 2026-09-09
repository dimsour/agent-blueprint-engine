/**
 * Deterministic contradiction detection.
 *
 * The question is narrow on purpose: two artifacts that state opposite obligations about the
 * same thing. "Always use Library X" against "Never use Library X" is a contradiction; "write
 * tests" against "review tests" is not. The heuristic looks only at sentences that carry an
 * obligation (a modal verb), compares their subjects, and requires a strong overlap before it
 * says anything, because a false contradiction costs the user more than a missed one.
 *
 * An AI pass (docs/06-ai-layer.md) can add more findings later with the same codes and
 * `data.source: 'ai'`; this pass never needs a model and always produces the same result.
 */
import type { Blueprint, EntityRef, IronLaw, Rule, Skill, Workflow } from '../model/types'
import type { Diagnostic } from './types'
import { extractSentences, findModal, jaccard, nounPhraseTokens, type Polarity } from './text'

/** Overlap needed before two opposite statements are considered to be about one subject. */
export const CONTRADICTION_JACCARD_THRESHOLD = 0.5
export const CONTRADICTION_MIN_SHARED_TOKENS = 2

/**
 * Tokens too common in this domain to establish that two sentences are about the same
 * thing. "Never write a test that sleeps" and "Always write a test first" share `test` and
 * `write` without disagreeing about anything.
 */
const GENERIC_TOKENS = new Set(['test', 'code', 'file', 'change', 'work', 'task', 'write', 'use'])

/** Headings under which a sentence states what *not* to do, so its polarity is inverted. */
const NEGATIVE_HEADINGS = /counterexample|not acceptable|do not|avoid|anti-pattern|bad example/

interface Statement {
  ref: EntityRef
  /** Agents and workflows this artifact applies to; empty means everywhere. */
  scope: { agentIds: string[]; workflowIds: string[] }
  sentence: string
  polarity: Polarity
  tokens: Set<string>
}

function statementsOf(
  ref: EntityRef,
  scope: Statement['scope'],
  texts: readonly (string | undefined)[],
): Statement[] {
  const out: Statement[] = []
  for (const text of texts) {
    if (!text) continue
    for (const { sentence, heading } of extractSentences(text)) {
      const modal = findModal(sentence)
      if (!modal) continue
      const tokens = nounPhraseTokens(sentence, modal)
      if (tokens.size === 0) continue
      // A sentence quoted as a counterexample states the opposite of the artifact's rule.
      const inverted = NEGATIVE_HEADINGS.test(heading)
      const polarity: Polarity = inverted
        ? modal.polarity === 'positive'
          ? 'negative'
          : 'positive'
        : modal.polarity
      out.push({ ref, scope, sentence, polarity, tokens })
    }
  }
  return out
}

function scopeOf(entity: IronLaw | Rule): Statement['scope'] {
  return entity.scope.all
    ? { agentIds: [], workflowIds: [] }
    : { agentIds: entity.scope.agentIds, workflowIds: entity.scope.workflowIds }
}

function skillScope(skill: Skill): Statement['scope'] {
  return { agentIds: [], workflowIds: skill.activation.workflowIds }
}

function workflowScope(workflow: Workflow): Statement['scope'] {
  return { agentIds: [], workflowIds: [workflow.id] }
}

/** Every obligation the Blueprint states, with where it applies. */
export function collectStatements(blueprint: Blueprint): Statement[] {
  const out: Statement[] = []
  for (const law of blueprint.ironLaws) {
    out.push(...statementsOf({ kind: 'iron-law', id: law.id }, scopeOf(law), [law.rule, law.body]))
  }
  for (const rule of blueprint.rules) {
    out.push(
      ...statementsOf({ kind: 'rule', id: rule.id }, scopeOf(rule), [rule.guidance, rule.body]),
    )
  }
  for (const skill of blueprint.skills) {
    out.push(
      ...statementsOf({ kind: 'skill', id: skill.id }, skillScope(skill), [
        skill.whenToUse,
        skill.body,
      ]),
    )
  }
  for (const workflow of blueprint.workflows) {
    out.push(
      ...statementsOf({ kind: 'workflow', id: workflow.id }, workflowScope(workflow), [
        workflow.body,
      ]),
    )
  }
  return out
}

/** Two scopes that name different agents or different workflows never meet. */
function scopesOverlap(a: Statement['scope'], b: Statement['scope']): boolean {
  const disjoint = (left: string[], right: string[]) =>
    left.length > 0 && right.length > 0 && !left.some((id) => right.includes(id))
  return !disjoint(a.agentIds, b.agentIds) && !disjoint(a.workflowIds, b.workflowIds)
}

function sharedTokens(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((token) => b.has(token))
}

/**
 * Finds pairs of statements that oblige opposite things about the same subject. Emits
 * `BP-LAW-010` when both are Iron Laws (a conflict between two absolutes is worse) and
 * `BP-CONTRA-001` otherwise. One finding per pair, ordered by artifact id.
 */
export function findContradictions(blueprint: Blueprint): Diagnostic[] {
  const statements = collectStatements(blueprint)
  const out: Diagnostic[] = []
  const reported = new Set<string>()

  for (let i = 0; i < statements.length; i += 1) {
    for (let j = i + 1; j < statements.length; j += 1) {
      const a = statements[i]
      const b = statements[j]
      if (!a || !b) continue
      if (a.ref.kind === b.ref.kind && a.ref.id === b.ref.id) continue
      if (a.polarity === b.polarity) continue
      if (!scopesOverlap(a.scope, b.scope)) continue

      const shared = sharedTokens(a.tokens, b.tokens)
      if (shared.length < CONTRADICTION_MIN_SHARED_TOKENS) continue
      if (shared.every((token) => GENERIC_TOKENS.has(token))) continue
      if (jaccard(a.tokens, b.tokens) < CONTRADICTION_JACCARD_THRESHOLD) continue

      const [first, second] =
        `${a.ref.kind}:${a.ref.id}` <= `${b.ref.kind}:${b.ref.id}` ? [a, b] : [b, a]
      const key = `${first.ref.kind}:${first.ref.id}|${second.ref.kind}:${second.ref.id}|${shared.sort().join(',')}`
      if (reported.has(key)) continue
      reported.add(key)

      const bothLaws = a.ref.kind === 'iron-law' && b.ref.kind === 'iron-law'
      out.push({
        code: bothLaws ? 'BP-LAW-010' : 'BP-CONTRA-001',
        severity: 'warning',
        message: `"${first.sentence}" (${first.ref.kind} ${first.ref.id}) and "${second.sentence}" (${second.ref.kind} ${second.ref.id}) tell the agent opposite things about the same subject.`,
        ref: first.ref,
        related: [second.ref],
        data: { sentences: [first.sentence, second.sentence], shared },
      })
    }
  }

  return out
}
