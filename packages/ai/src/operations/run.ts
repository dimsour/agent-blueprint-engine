/**
 * The shape every operation shares: build the context, ask, validate.
 *
 * Keeping it in one place is what makes the operations readable — each one is then a prompt,
 * a schema and the rule for turning the answer into ops, with no transport or budgeting in
 * the middle of it.
 *
 * The system prompt is charged against the budget rather than added to the context. The
 * glossary is long and it is already in the system message; counting it twice would either
 * duplicate it in the request or leave the budget believing there is room that is not there.
 */
import type * as z from 'zod'

import { buildContext, type BuiltContext } from '../context/build'
import type { BasePromptInput, PromptTemplate } from '../prompts/compose'
import { structured } from '../structured'
import { DEFAULT_BUDGET, estimateTokens } from '../tokens'
import type { OperationContext, OperationDeps } from './types'

export interface Asked<T> {
  value: T
  raw: string
  context: BuiltContext
}

export function contextFor(
  ctx: OperationContext,
  deps: OperationDeps,
  systemPrompt: string,
): BuiltContext {
  const budget = deps.budget ?? DEFAULT_BUDGET
  return buildContext({
    blueprint: ctx.blueprint,
    ...(ctx.selection ? { selection: ctx.selection } : {}),
    ...(ctx.diagnostics ? { diagnostics: ctx.diagnostics } : {}),
    budget: {
      ...budget,
      maxInputTokens: Math.max(0, budget.maxInputTokens - estimateTokens(systemPrompt)),
    },
  })
}

export async function ask<Input extends BasePromptInput, T>(
  deps: OperationDeps,
  template: PromptTemplate<Input>,
  input: Omit<Input, 'context'>,
  schema: z.ZodType<T>,
  context: BuiltContext,
): Promise<Asked<T>> {
  const result = await structured(
    deps.client,
    schema,
    [
      { role: 'system', content: template.system },
      { role: 'user', content: template.user({ ...input, context: context.text } as Input) },
    ],
    { name: template.id, ...deps.structured },
  )
  return { value: result.value, raw: result.raw, context }
}
