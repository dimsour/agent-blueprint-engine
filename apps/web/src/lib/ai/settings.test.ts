import { AI_PRESETS } from '@agent-blueprint/ai'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clientConfig,
  DEFAULT_AI_SETTINGS,
  readAISettings,
  settingsForPreset,
  writeAISettings,
} from './settings'

beforeEach(() => localStorage.clear())

/**
 * How long to wait for an answer (P6-10).
 *
 * The single 120-second default was right for a hosted API and wrong for a local model
 * drafting a whole Blueprint: P6-09 measured runs past two minutes, where all the user saw was
 * "No answer within 120s" for a request that was working.
 */
describe('the request timeout', () => {
  it('is longer for a local endpoint than a hosted one', () => {
    expect(AI_PRESETS.ollama.timeoutMs).toBeGreaterThan(AI_PRESETS.openai.timeoutMs)
    expect(AI_PRESETS['lm-studio'].timeoutMs).toBeGreaterThan(AI_PRESETS.openai.timeoutMs)
    expect(AI_PRESETS.vllm.timeoutMs).toBeGreaterThan(AI_PRESETS.anthropic.timeoutMs)
  })

  it('is re-seeded by the preset, because the preset knows and the user does not', () => {
    const hosted = settingsForPreset('openai', DEFAULT_AI_SETTINGS)
    const local = settingsForPreset('ollama', hosted)

    expect(hosted.timeoutMs).toBe(AI_PRESETS.openai.timeoutMs)
    expect(local.timeoutMs).toBe(AI_PRESETS.ollama.timeoutMs)
  })

  it('reaches the client, which is the only reason it exists', () => {
    const settings = { ...DEFAULT_AI_SETTINGS, timeoutMs: 45_000 }
    expect(clientConfig(settings, undefined).timeoutMs).toBe(45_000)
  })

  it('survives a round trip through storage', () => {
    writeAISettings({ ...DEFAULT_AI_SETTINGS, timeoutMs: 300_000 })
    expect(readAISettings().timeoutMs).toBe(300_000)
  })

  it('falls back to the default for settings stored before it existed', () => {
    localStorage.setItem(
      'ab:settings:ai',
      JSON.stringify({ presetId: 'openai', baseUrl: 'https://x/v1', model: 'm' }),
    )
    expect(readAISettings().timeoutMs).toBe(DEFAULT_AI_SETTINGS.timeoutMs)
  })
})
