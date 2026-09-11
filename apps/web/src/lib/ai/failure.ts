/**
 * What to tell the user when an AI request does not come back (P9-16).
 *
 * Four screens had four copies of the same `instanceof` ladder, and none of them said the one
 * thing that is actionable: a timeout is a setting, and the setting is in Settings. The rest
 * of the taxonomy already reads well — `AIError.message` is written for a person and carries
 * no key, no URL and no stack (docs/06) — so this adds a second line rather than rewording the
 * first.
 *
 * The hint names the field by the label it actually has, which changes with whether streaming
 * is on. A hint pointing at a control that is not on the screen is worse than none.
 */
import { AIError } from '@agent-blueprint/ai'

import { readAISettings } from './settings'

export interface Failure {
  /** What went wrong, in the endpoint's or the client's own words. */
  message: string
  /** What to do about it, when there is something. */
  hint?: string
}

/** Stopping is a decision, not a failure — the caller checks this before reporting anything. */
export function wasStopped(error: unknown): boolean {
  return error instanceof AIError && error.code === 'aborted'
}

export function describeFailure(error: unknown): Failure {
  if (error instanceof AIError) {
    if (error.code === 'timeout') {
      const settings = readAISettings()
      const field = settings.stream ? 'Give up after silence of' : 'Wait for an answer'
      const seconds = Math.round(settings.timeoutMs / 1000)
      return {
        message: error.message,
        hint: `“${field}” is set to ${seconds}s in Settings. Raise it if this endpoint is simply slow, or turn streaming off if it cannot stream.`,
      }
    }
    if (error.code === 'auth') {
      return { message: error.message, hint: 'Check the key in Settings.' }
    }
    if (error.code === 'network') {
      return {
        message: error.message,
        hint: 'A local endpoint usually needs CORS enabled, or the relay turned on in Settings.',
      }
    }
    return { message: error.message }
  }
  if (error instanceof Error) return { message: error.message }
  return { message: 'The endpoint could not be reached.' }
}
