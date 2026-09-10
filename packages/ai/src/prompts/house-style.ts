/**
 * The rules the validator will apply, told to the model before it writes rather than after
 * (P9-14).
 *
 * Reported from use: a generated Blueprint arrived with seven skills that had no
 * `## Instructions` section, six with no `## Verification`, five Iron Laws marked for gate
 * enforcement with no gate mentioning them, an unbounded loop and a hook with no command. Not
 * one of those is a matter of taste. Each is a rule in `packages/core` with a stable code, and
 * the model was never told any of them — it was asked for "a skill" and produced a good essay
 * about a topic, which is exactly what "skill" means in ordinary English.
 *
 * So the constraints go in the system prompt, phrased as construction rules and stated at the
 * level of precision the rule actually checks. `BP-LAW-011` matches the law's **name** inside
 * the gate's text; a prompt that said "wire laws to gates" would not have produced that, and a
 * prompt that says which string must appear where does.
 *
 * Only the kinds an operation may write are included. A prompt for one skill has no use for
 * the workflow rules, and the budget it would spend on them comes out of the artifact.
 *
 * Keep this in step with `packages/core/src/validation` and `evaluation/score.ts`. The pairing
 * is held by `tests/prompts.test.ts`, which fails when a code listed here as covered stops
 * existing — a rule that was renamed or removed leaves the model being told to satisfy a check
 * nothing runs, which is worse than saying nothing.
 */
import type { EntityKind } from '@agent-blueprint/core'

/** One kind's rules, and the codes they exist to prevent. */
interface KindStyle {
  /** The codes this block is written against, so the pairing can be tested. */
  codes: readonly string[]
  rules: readonly string[]
}

const STYLE: Partial<Record<EntityKind, KindStyle>> = {
  skill: {
    codes: [
      'BP-DESC-001',
      'BP-SKILL-010',
      'BP-SKILL-011',
      'BP-EVAL-SKILL-001',
      'BP-EVAL-SKILL-002',
    ],
    rules: [
      'A skill body is instructions, not an essay about a topic. It must contain a heading `## Instructions` followed by the steps the agent takes, in order.',
      'It must also contain a heading `## Verification` saying how anyone would know the skill was applied correctly — the command to run, the output to expect, the check that fails loudly. Both headings are matched literally; a body without them is reported as incomplete.',
      'Under about 200 characters of body, a skill is a title with nothing behind it. Write the steps.',
      'Give it a one-line description and activation conditions — file patterns, intents, agent roles — or attach it to an agent, or nothing can bring it in.',
    ],
  },
  agent: {
    codes: ['BP-DESC-001', 'BP-AGENT-001', 'BP-AGENT-012', 'BP-EVAL-AGENT-001'],
    rules: [
      'An agent states its responsibilities, one line each, and lists the ids of everything it uses.',
      'It states its output requirements: what it owes when it finishes — the shape of the answer, the files it leaves, the evidence it must show. Without them "done" is whatever the model decides.',
      'An agent with tools sets its permissions. Left unset, every harness applies its own defaults, and they differ.',
    ],
  },
  workflow: {
    codes: [
      'BP-WF-001',
      'BP-WF-002',
      'BP-WF-005',
      'BP-WF-011',
      'BP-WF-013',
      'BP-WF-014',
      'BP-EVAL-WF-001',
      'BP-EVAL-VERIFY-001',
    ],
    rules: [
      'A workflow has a `start` step named as its entry, an `end` step, and every path reaches the end. A step that is not an `end` and has no outgoing connection stops the workflow without saying it finished.',
      'At least one `verification`, `gate`, `review` or `human-approval` step sits on the path before the end. A workflow that finishes without checking anything leaves the agent saying so as the only evidence.',
      'Every loop is bounded: mark the connection that closes it `retry`, or give a `retry` step a `maxAttempts`. An unbounded loop compiles to instructions with no stopping condition.',
      'Every `agent`, `skill`, `gate`, `tool` or `delegate` step names the id it runs. A `parallel` step has at least two outgoing connections and a `merge` at least two incoming.',
      'Give the workflow triggers — the intents or agents that start it.',
    ],
  },
  'iron-law': {
    codes: ['BP-LAW-001', 'BP-LAW-011', 'BP-EVAL-LAW-001', 'BP-EVAL-LAW-002'],
    rules: [
      'Every Iron Law carries its rationale, at least one example and at least one counterexample — something that would be mistaken for the right thing. A law stated only in the abstract is applied inconsistently.',
      'A law either applies to everything or names the agents and workflows it governs. Scoped to neither, it reaches no compiled file.',
      "Only mark a law for `gate` enforcement if you are also writing the gate that checks it, and that gate must contain the law's name word for word in its own name, its description or one of its criteria descriptions. That string match is how the check is made. `hook` enforcement needs nothing extra — every adapter generates it.",
    ],
  },
  gate: {
    codes: ['BP-DESC-001', 'BP-GATE-010'],
    rules: [
      'Every gate carries at least one criterion. A gate that checks nothing always passes, which is worse than no gate because it reads as a checkpoint.',
    ],
  },
  hook: {
    codes: ['BP-DESC-001', 'BP-HOOK-010'],
    rules: [
      'A hook whose action is `command`, `run-tests`, `format`, `lint` or `secret-scan` must carry the command to run. Without one it compiles to nothing.',
    ],
  },
  rule: {
    codes: ['BP-LAW-001'],
    rules: [
      'A rule either applies to everything, names the agents and workflows it guides, or carries the path patterns it is about.',
    ],
  },
  requirement: {
    codes: ['BP-REQ-001', 'BP-REQ-003'],
    rules: [
      'Every requirement carries at least one check, or nothing can confirm it. A check looks for something that is really there: `text-mentions` runs a case-insensitive regular expression over the name, description, body, rule, guidance, whenToUse and statement of the kinds it names — never over ids or tags, so a pattern that is a slug matches nothing.',
    ],
  },
}

/** Kinds with no rules of their own beyond the shared ones. */
const NO_EXTRA_RULES: readonly EntityKind[] = ['tool', 'reference', 'memory', 'scenario']

/** Every code the house style is written against, for the test that keeps it honest. */
export const HOUSE_STYLE_CODES: readonly string[] = [
  ...new Set(Object.values(STYLE).flatMap((style) => style?.codes ?? [])),
]

/**
 * The rules for the kinds this operation may write, or an empty string when it writes none.
 *
 * Empty is the right answer for the reporting operations: `findContradictions` proposes
 * nothing, and telling it how to structure a skill body would be budget spent on an
 * instruction it cannot follow.
 */
export function houseStyleFor(kinds: readonly EntityKind[] | undefined): string {
  if (!kinds || kinds.length === 0) return ''
  const blocks = kinds
    .filter((kind, index) => kinds.indexOf(kind) === index && !NO_EXTRA_RULES.includes(kind))
    .map((kind) => {
      const style = STYLE[kind]
      return style ? { kind, rules: style.rules } : undefined
    })
    .filter((entry): entry is { kind: EntityKind; rules: readonly string[] } => entry !== undefined)

  if (blocks.length === 0) return ''
  return [
    'What the validator will check, so write it this way the first time:',
    ...blocks.flatMap(({ kind, rules }) => ['', `${kind}:`, ...rules.map((rule) => `- ${rule}`)]),
  ].join('\n')
}
