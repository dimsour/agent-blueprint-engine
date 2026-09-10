/**
 * The parts every prompt is made of.
 *
 * A template is `{ id, version, system, user(input) }` and nothing more: no branching, no
 * conditionals buried in string concatenation. The version is part of the identity because
 * changing the wording changes the output, and the recorded fixtures that pin an operation's
 * behaviour are recorded against one version. Bump `version` (and copy the file to `.vN.ts`)
 * for any wording change that could move the shape of an answer; leave the old file where it
 * is so its fixtures still mean something.
 *
 * Every system prompt is the same four parts in the same order: the glossary, what this
 * operation is for, the id rules, the hard rules, and the output contract. The contract is
 * about meaning — which artifacts, how many, what may not change — never about JSON syntax,
 * which `structured()` handles on the wire.
 */
import type { EntityKind } from '@agent-blueprint/core'

import { CONCEPT_GLOSSARY, ID_RULES, SAFETY_RULES } from './glossary'
import { houseStyleFor } from './house-style'

export interface PromptTemplate<Input> {
  readonly id: string
  readonly version: number
  readonly system: string
  user(input: Input): string
}

export interface BasePromptInput {
  /** The Blueprint, as assembled by `buildContext`. */
  context: string
  /** What the user typed, when they typed anything. */
  instruction?: string
}

export function systemPrompt(parts: {
  purpose: string
  contract: string
  /**
   * The artifact kinds this operation may write. Their house style — the rules the validator
   * will apply — is composed in, so no template restates them and none of them drifts (P9-14).
   * Omitted by the operations that only report.
   */
  writes?: readonly EntityKind[]
}): string {
  const houseStyle = houseStyleFor(parts.writes)
  return [
    CONCEPT_GLOSSARY,
    '',
    parts.purpose.trim(),
    '',
    ID_RULES,
    '',
    SAFETY_RULES,
    ...(houseStyle ? ['', houseStyle] : []),
    '',
    'Output contract:',
    parts.contract.trim(),
  ].join('\n')
}

/** Context, then the ask. The order matters: the request should be the last thing read. */
export function userPrompt(input: BasePromptInput, ask: string): string {
  const sections = [input.context.trim(), ask.trim()]
  if (input.instruction?.trim())
    sections.push(`What the user asked for:\n${input.instruction.trim()}`)
  return sections.filter(Boolean).join('\n\n---\n\n')
}
