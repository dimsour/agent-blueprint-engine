/**
 * Putting the whole Blueprint right (P9-40).
 *
 * `fixFindings` clears the findings it is handed and is told to touch nothing else, which is
 * the right contract for a button beside one row. This is the other button: everything the
 * validator and the evaluation raised, with the whole design in view, and a decision asked for
 * on each — change something, write something, delete something, or leave it and say why.
 *
 * The case it exists for is the orphan. "Nothing uses the Iron Law `deterministic-tests`" has
 * three honest answers and one of them is a deletion: the agent that should be bound by it was
 * never wired to it; it duplicates a law the agent already has; or nothing in this Blueprint
 * does the thing it forbids. Which one is true can only be decided with the rest of the
 * Blueprint on the table, which is why this is not a loop over the single-finding fix.
 *
 * The model reasons; the code checks. A deletion is honoured only for an artifact nothing
 * refers to, and the proposal is applied to a throwaway Blueprint and re-validated before the
 * user sees it, as every fix is.
 */
import type { EntityKind } from '@agent-blueprint/core'

import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'
import { type FindingBrief, findingSection } from './fix-finding.v1'
import { houseStyleFor } from './house-style'

export interface FixBlueprintInput extends BasePromptInput {
  /** Everything raised against the Blueprint that an artifact edit could clear. */
  findings: readonly FindingBrief[]
  /**
   * How the artifacts the findings name are connected: what each one uses, what uses it, and
   * for an orphan, what holds the other artifacts of its kind. The evidence for "why".
   */
  connections: string
  /** The kinds this fix may write. */
  kinds: readonly EntityKind[]
  /** The artifacts the findings name, as their source files. */
  artifacts?: string | undefined
  /** Set on a second attempt: what the validator still said after the first one. */
  stillWrong?: readonly string[] | undefined
}

function section(title: string, body: string | undefined): string[] {
  return body ? ['', `## ${title}`, '', body] : []
}

export const fixBlueprintV1: PromptTemplate<FixBlueprintInput> = {
  id: 'fix-blueprint',
  version: 1,
  system: systemPrompt({
    purpose: `You are putting a whole Blueprint right. You are given everything its validator and its
evaluation raised, the artifacts those findings name, and how those artifacts are connected to
the rest of the design. Decide what to do about each finding with the whole Blueprint in view,
not one finding at a time.

For every finding, one of four decisions:

- **change** an artifact that exists, returning it whole with only what the finding is about
  different;
- **create** an artifact that is missing;
- **delete** an artifact nothing needs;
- **keep** things as they are, because the finding asks for a decision only the author can make.

The typical case is an orphan: an artifact nothing refers to. Ask why. Was the agent that should
hold it never wired to it? Then the fix is that agent, returned with the artifact added to the
right list — that is a change to the agent, not to the orphan. Does it duplicate something the
agent already has? Then delete it, and say which artifact already covers it. Does nothing in this
Blueprint do the thing it is about? Then delete it, and say so. Is it plainly wanted and you
cannot tell where it belongs? Then keep it and say what the author has to decide. "How the
artifacts are connected" is the evidence: read it before deciding.

A deletion is honoured only for an artifact nothing refers to; asking to delete one that is in
use is refused and reported. Deleting is never the fix for a finding about the artifact's own
content — a missing description is filled in, not removed.

For every other kind of finding, do what the single-finding contract does: read the invariant,
which is what "fixed" means; read where the rule looked; make the smallest edit that makes the
invariant true. Several findings often name one artifact — return it once, with all of them
addressed in that one version.`,
    contract: `- Return a decision for **every** finding you were given, in \`decisions\`, with its code and the artifact it is about, the action, and the reason in one or two sentences. A reader who did not run the validator has to be able to follow it.
- Return the artifacts your changes and creations need in \`artifacts\`, each one exactly once and complete — every field you were not changing exactly as it was given, including the body, the tags and every list of references. An empty list is not "unchanged".
- Return the artifacts to remove in \`deletions\`, each with the reason. Only artifacts nothing refers to.
- Do not rename anything. An id is how the rest of the Blueprint refers to an artifact.
- Do not fix anything the findings did not raise, and do not restructure what works.
- Write the substance, not a placeholder. "TODO" and a sentence that restates the name clear the rule and help nobody.
- \`note\` sums up what the Blueprint looks like after this, in a sentence or two.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      [
        input.findings.length === 1
          ? 'Decide what to do about this finding, with the whole Blueprint in view.'
          : `Decide what to do about these ${input.findings.length} findings, with the whole Blueprint in view, in one answer.`,
        '',
        '## The findings',
        '',
        input.findings.map(findingSection).join('\n\n'),
        ...section('How the artifacts are connected', input.connections),
        ...section(
          'What you may write',
          [
            `Artifacts of these kinds: ${input.kinds.join(', ')}.`,
            'Each artifact once, whole, with every finding about it addressed in that one version. Deletions go in `deletions`, not in `artifacts`.',
          ].join('\n'),
        ),
        ...section(
          'What the validator will check about what you write',
          houseStyleFor(input.kinds),
        ),
        ...section('The artifacts as they stand', input.artifacts),
        ...section(
          'Your previous attempt did not clear them',
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
