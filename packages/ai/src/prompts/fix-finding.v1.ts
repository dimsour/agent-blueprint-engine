/**
 * Making one finding go away.
 *
 * The prompt is assembled per finding rather than written per code, and the parts that make it
 * specific are already in the product. `DIAGNOSTIC_CODES` carries a `remedy` per code — the
 * instructions a person is shown when they press "How to fix" (P9-10). `ValidationRule` carries
 * a `description`, which is the invariant the rule enforces and therefore the exact condition
 * under which it stops firing. The diagnostic itself carries `data`: the nodeId, the
 * responsibility, the relation — whatever the rule looked at when it fired. All three go in,
 * so the model is told what is wrong, what "fixed" means, and where to look.
 *
 * The contract insists on the smallest change that clears the finding, because a model asked
 * to fix a missing description will otherwise rewrite the body it was not asked about, and a
 * review whose diff is mostly noise is a review nobody reads.
 *
 * Kept at v1 through the P9-13 rewrite: the answer's shape did not move — same schema, same
 * fields — and the single recording pinned to it was re-recorded in the same change, so
 * nothing was left meaning something it no longer means.
 */
import type { EntityKind, EntityRef } from '@agent-blueprint/core'

import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'
import { houseStyleFor } from './house-style'

export interface FixFindingInput extends BasePromptInput {
  /** The diagnostic code, so the answer can be traced back to the rule that asked. */
  code: string
  /** What the code means in general, from the catalogue. */
  summary: string
  /** How this kind of finding is fixed, from the catalogue. The steering. */
  remedy: string
  /** What the rule said about this Blueprint, naming the artifact. */
  message: string
  severity: string
  /**
   * The invariant the rule enforces, from `ValidationRule.description`. This is the exit
   * condition: the finding is gone exactly when this sentence is true again.
   */
  invariant?: string | undefined
  /** The artifact the finding is about, when it names one. */
  ref?: EntityRef | undefined
  /** Other artifacts the finding names — the second half of a contradiction, say. */
  related?: readonly EntityRef[] | undefined
  /** What the rule recorded when it fired: `nodeId`, `responsibility`, `relation`, … */
  evidence?: Record<string, unknown> | undefined
  /** The fields of the artifact this code is about, when the code is about particular ones. */
  fields?: readonly string[] | undefined
  /** The kinds this fix is allowed to write. */
  kinds: readonly EntityKind[]
  /** The artifact the finding names, as its source file, repeated next to the ask. */
  current?: string | undefined
  /** The other artifacts the finding names, as their source files. */
  alsoNamed?: string | undefined
  /** Set on a second attempt: what the validator still said after the first one. */
  stillWrong?: readonly string[] | undefined
}

/**
 * One worked fix, in the system prompt.
 *
 * Not per code — sixty examples would be a second catalogue — but one is enough to settle the
 * two things every code shares and no schema can state: the answer is the whole artifact with
 * one thing different, and everything the finding did not mention comes back byte for byte.
 * Weaker and local models get this wrong far more often than strong ones, and this is the
 * cheapest correction available.
 */
const WORKED_EXAMPLE = `Worked example. Given:

  Code: BP-DESC-001 — An agent, skill, workflow, law, gate or hook has no description.
  The finding: Skill "react-testing" has no description.
  The fields this code is about: description
  The artifact as it stands:
    # Skill: react-testing
    ---
    id: react-testing
    name: React testing
    whenToUse: When adding or changing a component test.
    tags: [react, testing]
    ---
    ## Instructions

    Query by role. Assert on what the user would see.

A good answer returns one artifact: the same skill with \`description\` filled in, and
\`id\`, \`name\`, \`whenToUse\`, \`tags\` and the whole body returned unchanged. A bad answer
rewrites the body, drops the tags, renames the id, or returns only the description.`

function about(input: FixFindingInput): string {
  if (!input.ref) return 'It is about the Blueprint as a whole, rather than one artifact.'
  const others = (input.related ?? []).map((ref) => `${ref.kind} "${ref.id}"`)
  const first = `It is about the ${input.ref.kind} "${input.ref.id}".`
  return others.length > 0 ? `${first} It also names ${others.join(' and ')}.` : first
}

/** `data` as lines, so a nodeId the rule recorded is as readable as the message. */
function evidence(input: FixFindingInput): string[] {
  const entries = Object.entries(input.evidence ?? {}).filter(([, value]) => value !== undefined)
  if (entries.length === 0) return []
  return [
    '',
    'What the rule recorded when it fired — this is where to look, not a guess:',
    ...entries.map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`),
  ]
}

function section(title: string, body: string | undefined): string[] {
  return body ? ['', `## ${title}`, '', body] : []
}

export const fixFindingV1: PromptTemplate<FixFindingInput> = {
  id: 'fix-finding',
  version: 1,
  system: systemPrompt({
    purpose: `You are clearing one specific finding raised against a Blueprint by its validator.

You are given the finding, what its code means, the invariant the rule enforces, whatever the
rule recorded when it fired, and the artifact itself. Do exactly what the finding asks and
nothing else. The user pressed a button next to one line in a list; they are expecting the
change that line asked for, and everything else in the diff is something they did not ask for
and have to read anyway.

Work in this order. Read the invariant — that is the condition under which the rule stops
firing, so it is what "fixed" means here. Read the evidence, which names the exact step,
responsibility or reference the rule objected to. Then read the artifact as it stands and
decide the smallest edit that makes the invariant true.

If the fix needs an artifact that does not exist yet, write it. If it needs an existing one
changed, return that artifact complete, with only the part the finding is about different.

${WORKED_EXAMPLE}`,
    contract: `- Return only the artifacts the fix needs. An empty list is the right answer when the finding cannot be cleared by writing artifacts; say so in \`note\`.
- Return each changed artifact complete, not a patch. Every field the finding did not mention comes back exactly as it was given, including the body, the tags and every list of references.
- Do not rename anything. An id is how the rest of the Blueprint refers to an artifact, and renaming one here breaks those references silently.
- Do not fix anything the finding did not raise. Another rule will raise that one, with its own button.
- Write the substance, not a placeholder. "TODO", "Description here" and a sentence that restates the name clear the rule and help nobody.
- \`note\` says what you changed and why it makes the invariant true, in one or two sentences.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      [
        'Clear this finding.',
        '',
        '## The finding',
        '',
        `Code: ${input.code} — ${input.summary}`,
        `Severity: ${input.severity}`,
        `Message: ${input.message}`,
        about(input),
        ...evidence(input),
        ...section(
          'What "fixed" means',
          input.invariant
            ? `The rule enforces this: ${input.invariant}\n\nThe finding is gone exactly when that is true again. Nothing else counts as clearing it.`
            : undefined,
        ),
        ...section('How this kind of finding is fixed', input.remedy),
        ...section(
          'What to change',
          [
            input.fields && input.fields.length > 0
              ? `The finding is about these fields: ${input.fields.join(', ')}. Change those; return the rest untouched.`
              : undefined,
            `You may write or revise artifacts of these kinds: ${input.kinds.join(', ')}.`,
          ]
            .filter(Boolean)
            .join('\n'),
        ),
        ...section(
          'What the validator will check about what you write',
          houseStyleFor(input.kinds),
        ),
        ...section('The artifact as it stands', input.current),
        ...section('Also named by the finding', input.alsoNamed),
        ...section(
          'Your previous attempt did not clear it',
          input.stillWrong && input.stillWrong.length > 0
            ? [
                'The validator ran again on your answer and still says:',
                ...input.stillWrong.map((line) => `- ${line}`),
                '',
                'Try again. Keep whatever you got right and change what these name.',
              ].join('\n')
            : undefined,
        ),
      ].join('\n'),
    ),
}
