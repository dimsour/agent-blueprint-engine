/**
 * Which endpoint the assistant talks to.
 *
 * The endpoint is a preference and lives in `localStorage` with the rest of them; the key is a
 * secret and lives wherever `lib/credentials` was told to put it. Keeping them apart is what
 * makes it safe to persist this at all — everything here could be printed on a poster.
 *
 * `features.jsonSchema` is stored rather than guessed because guessing it is expensive: the
 * wrong answer costs an extra round trip on every structured call, and on the endpoints that
 * accept `response_format` and ignore it, the wrong answer is prose where an object was needed.
 * The probe settles it once, at the moment the user saves.
 */
import {
  AI_PRESETS,
  type AIClient,
  type AIClientConfig,
  createAIClient,
  type PresetId,
} from '@agent-blueprint/ai'

import { readCredential } from '@/lib/credentials'

export const AI_SETTINGS_KEY = 'ab:settings:ai'

/** Everything about the endpoint except the key. Safe to persist, safe to show. */
export interface AISettings {
  presetId: PresetId
  baseUrl: string
  model: string
  /** What the probe found, or what the preset declares when it knows. */
  jsonSchema: boolean
  /** Relay through this app's own route, for endpoints that send no CORS headers. */
  viaProxy: boolean
  /** Extra headers some endpoints want (OpenRouter's HTTP-Referer, a workspace id). */
  extraHeaders: Record<string, string>
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  presetId: 'openai',
  baseUrl: AI_PRESETS.openai.baseUrl,
  model: 'gpt-5-mini',
  jsonSchema: true,
  viaProxy: false,
  extraHeaders: {},
}

/** What choosing a preset fills in. Only the fields the preset actually knows. */
export function settingsForPreset(preset: PresetId, current: AISettings): AISettings {
  const chosen = AI_PRESETS[preset]
  return {
    ...current,
    presetId: preset,
    baseUrl: chosen.baseUrl || (preset === current.presetId ? current.baseUrl : ''),
    jsonSchema: chosen.jsonSchema === 'probe' ? current.jsonSchema : chosen.jsonSchema,
    // A local endpoint is the reason the proxy exists; anything else reaches the browser directly.
    viaProxy: chosen.requiresKey ? false : current.viaProxy,
  }
}

export function readAISettings(): AISettings {
  try {
    const stored = globalThis.localStorage?.getItem(AI_SETTINGS_KEY)
    if (!stored) return DEFAULT_AI_SETTINGS
    const parsed = JSON.parse(stored) as Partial<AISettings>
    return {
      ...DEFAULT_AI_SETTINGS,
      ...parsed,
      // A stored preset id from an older build must not become a lookup of undefined.
      presetId: parsed.presetId && parsed.presetId in AI_PRESETS ? parsed.presetId : 'custom',
      extraHeaders: parsed.extraHeaders ?? {},
    }
  } catch {
    return DEFAULT_AI_SETTINGS
  }
}

export function writeAISettings(settings: AISettings): void {
  try {
    globalThis.localStorage?.setItem(AI_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // A browser that refuses to store preferences still runs the app for this session.
  }
}

export function clientConfig(settings: AISettings, apiKey: string | undefined): AIClientConfig {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    presetId: settings.presetId,
    features: { jsonSchema: settings.jsonSchema },
    ...(apiKey ? { apiKey } : {}),
    ...(settings.viaProxy ? { viaProxy: true } : {}),
    ...(Object.keys(settings.extraHeaders).length > 0
      ? { extraHeaders: settings.extraHeaders }
      : {}),
  }
}

export interface ConfiguredClient {
  client: AIClient
  settings: AISettings
}

/**
 * The client the assistant uses, or nothing when it is not configured yet. Callers show the
 * "set this up in Settings" path rather than failing at the endpoint.
 */
export function configuredClient(): ConfiguredClient | undefined {
  const settings = readAISettings()
  if (!settings.baseUrl || !settings.model) return undefined
  const key = readCredential('ai')?.value
  if (AI_PRESETS[settings.presetId].requiresKey && !key) return undefined
  return { client: createAIClient(clientConfig(settings, key)), settings }
}
