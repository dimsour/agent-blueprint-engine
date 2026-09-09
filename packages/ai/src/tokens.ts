/**
 * How much of the model's attention a piece of text will cost.
 *
 * Deliberately a guess. A real tokenizer is a megabyte of tables per model family, it would
 * have to be right for every endpoint the user might point at, and the only decision it feeds
 * is "does this block still fit" — where being ten percent out costs a truncated paragraph,
 * not a wrong answer. `chars / 3.5` is close enough for English prose and Markdown, and it
 * runs everywhere without a dependency.
 */
export const CHARS_PER_TOKEN = 3.5

/** The marker left behind whenever text was cut, so the model knows it is not seeing all. */
export const TRUNCATION_MARK = '\n[… truncated …]'

export interface ContextBudget {
  maxInputTokens: number
  /** Held back so the answer has room; the context builder may not spend it. */
  reserveForOutput: number
}

export const DEFAULT_BUDGET: ContextBudget = { maxInputTokens: 24_000, reserveForOutput: 6_000 }

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** What the context may spend, once the answer's share is set aside. */
export function inputAllowance(budget: ContextBudget): number {
  return Math.max(0, budget.maxInputTokens - budget.reserveForOutput)
}

/**
 * Cut `text` to roughly `tokens`, marking the cut. Returns it unchanged when it already fits,
 * and returns just the marker when there is no room at all.
 */
export function truncateToTokens(text: string, tokens: number): string {
  if (estimateTokens(text) <= tokens) return text
  const chars = Math.max(0, Math.floor(tokens * CHARS_PER_TOKEN) - TRUNCATION_MARK.length)
  if (chars <= 0) return TRUNCATION_MARK.trim()
  // Prefer a paragraph boundary when one is close, so the model does not read half a sentence.
  const cut = text.slice(0, chars)
  const paragraph = cut.lastIndexOf('\n\n')
  const at = paragraph > chars * 0.6 ? paragraph : cut.length
  return `${cut.slice(0, at).trimEnd()}${TRUNCATION_MARK}`
}
