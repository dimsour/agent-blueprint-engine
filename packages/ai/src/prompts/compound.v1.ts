/**
 * Experience in, reusable knowledge out.
 *
 * The user pastes what actually happened — session notes, a transcript, a diff, a postmortem —
 * and gets back artifacts that would have prevented the next occurrence. This is the operation
 * that closes the loop the product is named for, and the one where inventing is most costly:
 * a law derived from nothing that happened is a law nobody will keep.
 */
import { type BasePromptInput, type PromptTemplate, systemPrompt, userPrompt } from './compose'

export interface CompoundInput extends BasePromptInput {
  /** Notes, transcript or diff, pasted by the user. */
  notes: string
}

export const compoundV1: PromptTemplate<CompoundInput> = {
  id: 'compound',
  version: 1,
  system: systemPrompt({
    writes: ['skill', 'iron-law', 'rule', 'reference', 'memory', 'workflow'],
    purpose: `You are turning an account of real work into artifacts that make the next run of it better.

Read the notes for what was learned the hard way: a mistake that had to be corrected, a step
someone had to be told twice, a check that caught something, a piece of context that was
missing at the start. Each of those has a home — a skill for how to do it, an Iron Law for what
must not happen again, a reference for knowledge that was needed, a rule for a preference, a
workflow step for a check that should be routine.

Everything you propose must be traceable to the notes. If the notes do not support it, leave it
out: a plausible-sounding artifact nobody can trace back is how a Blueprint fills with text
that no one trusts.

Prefer changing an existing artifact to adding a new one. Most lessons belong in something
that already exists.`,
    contract: `- Every proposal carries a note saying which part of the pasted text it came from.
- Update an existing artifact where one covers the ground; create one only where none does.
- Do not include names of people, credentials, customer data or anything else from the notes
  that is not about how the work should be done.
- Few and well-evidenced beats many and plausible.`,
  }),
  user: (input) =>
    userPrompt(
      input,
      `Turn this into reusable knowledge for the Blueprint:\n\n${input.notes.trim()}`,
    ),
}
