/**
 * What went wrong, in terms the UI can act on.
 *
 * Every failure the client can produce is one of these codes, because the settings screen and
 * the assistant panel react differently to each: a `network` failure on localhost means
 * "turn the proxy on", an `auth` failure means "your key is wrong", and `unsupported` means
 * "this endpoint ignores JSON schema, use the prompt path instead".
 *
 * Nothing here ever carries a key. `redact` runs over every message and every body excerpt
 * before it is stored on the error, so an error that reaches a log or a toast cannot leak one
 * (docs/08-security.md).
 */

export const AI_ERROR_CODES = [
  'network',
  'auth',
  'rate-limit',
  'server',
  'timeout',
  'aborted',
  'bad-request',
  'unsupported',
  'invalid-output',
  'context-too-large',
] as const

export type AIErrorCode = (typeof AI_ERROR_CODES)[number]

export interface AIErrorOptions {
  status?: number
  /** Response body or model output, already redacted, kept short for display. */
  raw?: string
  /** How long the server asked us to wait, when it said. */
  retryAfterMs?: number
  cause?: unknown
}

export class AIError extends Error {
  readonly code: AIErrorCode
  readonly status?: number
  readonly raw?: string
  readonly retryAfterMs?: number

  constructor(code: AIErrorCode, message: string, options: AIErrorOptions = {}) {
    super(redact(message), options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'AIError'
    this.code = code
    if (options.status !== undefined) this.status = options.status
    if (options.raw !== undefined) this.raw = redact(options.raw)
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[\w.\-+/=]{8,}/gi,
  /("?(?:api[-_]?key|authorization|x-api-key|api_key)"?\s*[:=]\s*"?)[\w.\-+/=]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{12,}/g,
  /\bsk-ant-[A-Za-z0-9_-]{12,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
]

/** Replace anything that looks like a credential with `[redacted]`. */
export function redact(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    // A pattern without a capture group hands the callback an offset here, not a prefix.
    out = out.replace(pattern, (_match: string, prefix: unknown) =>
      typeof prefix === 'string' ? `${prefix}[redacted]` : '[redacted]',
    )
  }
  return out
}

/** True when the text carries something that looks like a credential. */
export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(text)
  })
}

/**
 * Turn an HTTP failure into a code. The body matters for two of them: a 400 that names
 * `response_format` means the endpoint has no JSON-schema mode, and a 400 about the context
 * length is worth distinguishing because the fix is to send less, not to give up.
 */
export function errorForStatus(status: number, body: string): AIErrorCode {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  if (status === 400 || status === 404 || status === 422) {
    const text = body.toLowerCase()
    if (text.includes('response_format') || text.includes('json_schema')) return 'unsupported'
    if (
      text.includes('context length') ||
      text.includes('context_length') ||
      text.includes('maximum context') ||
      text.includes('too many tokens') ||
      // LM Studio's wording, which matches none of the above: "request (5865 tokens) exceeds
      // the available context size (3328 tokens)", type `exceed_context_size_error`. Without
      // this the most actionable failure a local endpoint produces arrives as a shrug.
      text.includes('context size') ||
      text.includes('exceed_context_size')
    ) {
      return 'context-too-large'
    }
    return 'bad-request'
  }
  return 'server'
}

/** `Retry-After` in seconds or as an HTTP date; undefined when absent or unparseable. */
export function retryAfterMs(header: string | null, now: number): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(header)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}
