/**
 * What a failed AI request tells the user (P9-16).
 *
 * A timeout is the one failure that is a setting rather than a fault, and the setting is two
 * clicks away. Saying so at the moment it happens is the whole point — which is also why the
 * waiting text no longer says it on every request that has not failed.
 */
import { AIError } from '@agent-blueprint/ai'
import { beforeEach, describe, expect, it } from 'vitest'

import { describeFailure, wasStopped } from '@/lib/ai/failure'
import { AI_SETTINGS_KEY } from '@/lib/ai/settings'

function configure(settings: Record<string, unknown>) {
  localStorage.setItem(
    AI_SETTINGS_KEY,
    JSON.stringify({
      presetId: 'custom',
      baseUrl: 'https://stub.test/v1',
      model: 'stub',
      jsonSchema: true,
      viaProxy: false,
      extraHeaders: {},
      ...settings,
    }),
  )
}

beforeEach(() => localStorage.clear())

describe('describeFailure', () => {
  it('names the timeout field, by the label it currently has', () => {
    configure({ stream: true, timeoutMs: 120_000 })
    const failure = describeFailure(new AIError('timeout', 'Nothing arrived within 120s.'))

    expect(failure.message).toBe('Nothing arrived within 120s.')
    expect(failure.hint).toContain('Give up after silence of')
    expect(failure.hint).toContain('120s')
  })

  it('names the other label when the endpoint is not streaming', () => {
    // The field is the same setting and means something different, so a hint pointing at
    // "Give up after silence of" would be pointing at a control that is not on the screen.
    configure({ stream: false, timeoutMs: 300_000 })
    const failure = describeFailure(new AIError('timeout', 'No answer within 300s.'))

    expect(failure.hint).toContain('Wait for an answer')
    expect(failure.hint).toContain('300s')
  })

  it('points at the key for an auth failure and the relay for a network one', () => {
    configure({})
    expect(describeFailure(new AIError('auth', 'Invalid API key.')).hint).toContain('key')
    expect(describeFailure(new AIError('network', 'Could not reach it.')).hint).toContain('CORS')
  })

  it('adds nothing it cannot back up', () => {
    configure({})
    // There is no advice for a 500 that is better than the endpoint's own words.
    expect(
      describeFailure(new AIError('server', 'The endpoint returned 503.')).hint,
    ).toBeUndefined()
    expect(describeFailure(new Error('boom')).message).toBe('boom')
    expect(describeFailure('something else').message).toBe('The endpoint could not be reached.')
  })

  it('knows a stop from a failure', () => {
    expect(wasStopped(new AIError('aborted', 'Cancelled.'))).toBe(true)
    expect(wasStopped(new AIError('timeout', 'Nothing arrived.'))).toBe(false)
    expect(wasStopped(new Error('boom'))).toBe(false)
  })
})
