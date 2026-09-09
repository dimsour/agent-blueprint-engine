/**
 * The endpoints people actually use, pre-filled.
 *
 * A preset is only a starting point for the settings form: what the client runs on is always
 * the explicit `AIClientConfig` the user saved. Two fields are more than convenience, though.
 * `authHeader` is wrong-by-default for Azure, which wants `api-key` rather than a bearer
 * token, and `jsonSchema` records what we know without asking: Anthropic's compatibility
 * route accepts `response_format` and ignores it, so probing it would report success and
 * then produce prose. Declaring `false` there is the difference between structured output
 * working and appearing to work.
 */
export const AI_PRESET_IDS = [
  'openai',
  'anthropic',
  'openrouter',
  'ollama',
  'lm-studio',
  'vllm',
  'azure-openai',
  'custom',
] as const

export type PresetId = (typeof AI_PRESET_IDS)[number]

export type AuthHeaderStyle = 'bearer' | 'api-key' | 'none'

export interface AIPreset {
  id: PresetId
  name: string
  /** Empty when the user must supply it (self-hosted, Azure, custom). */
  baseUrl: string
  authHeader: AuthHeaderStyle
  /** Whether the endpoint needs a key at all. */
  requiresKey: boolean
  /**
   * What we know about JSON-schema structured output: `true` or `false` when it is settled
   * for the whole endpoint, `'probe'` when it depends on the model behind it.
   */
  jsonSchema: boolean | 'probe'
  /**
   * Whether this endpoint needs OpenAI's strict dialect, where every property is required and
   * an optional one is expressed as "or null".
   *
   * Only OpenAI's own API does. Everywhere else it is pure cost: the model has to write every
   * optional field of every artifact, mostly as `null`, and on a large schema that is the
   * difference between finishing and not. Measured on a local model drafting a whole Blueprint —
   * 2 650 tokens and done in 86s with the plain schema, still unfinished at 6 000 tokens with
   * the strict one.
   */
  strictSchema: boolean
  /** Shown under the picker. Says what the user has to do outside this app, if anything. */
  note: string
  docsUrl: string
}

export const AI_PRESETS: Record<PresetId, AIPreset> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    authHeader: 'bearer',
    requiresKey: true,
    jsonSchema: true,
    strictSchema: true,
    note: 'Structured output is supported directly.',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (OpenAI compatibility)',
    baseUrl: 'https://api.anthropic.com/v1/',
    authHeader: 'bearer',
    requiresKey: true,
    // Verified 2026-09-09: the route accepts response_format and ignores it, so asking for a
    // schema here would silently return prose. See docs/06-ai-layer.md.
    jsonSchema: false,
    strictSchema: false,
    note: 'A compatibility layer for testing models, not a production surface. response_format is ignored, so schemas are enforced by re-asking.',
    docsUrl: 'https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    authHeader: 'bearer',
    requiresKey: true,
    jsonSchema: 'probe',
    strictSchema: false,
    note: 'Schema support depends on the model routed to. HTTP-Referer and X-Title may be sent as extra headers.',
    docsUrl: 'https://openrouter.ai/docs/api-reference/overview',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    authHeader: 'none',
    requiresKey: false,
    jsonSchema: 'probe',
    strictSchema: false,
    note: 'The browser needs OLLAMA_ORIGINS to include this app, or turn the proxy on.',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
  },
  'lm-studio': {
    id: 'lm-studio',
    name: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    authHeader: 'none',
    requiresKey: false,
    jsonSchema: 'probe',
    strictSchema: false,
    note: "Enable CORS in LM Studio's server settings, or turn the proxy on.",
    docsUrl: 'https://lmstudio.ai/docs/app/api/endpoints/openai',
  },
  vllm: {
    id: 'vllm',
    name: 'vLLM',
    baseUrl: '',
    authHeader: 'none',
    requiresKey: false,
    jsonSchema: 'probe',
    strictSchema: false,
    note: 'Guided JSON works when the server was started with a backend that supports it.',
    docsUrl: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html',
  },
  'azure-openai': {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    baseUrl: '',
    authHeader: 'api-key',
    requiresKey: true,
    jsonSchema: true,
    strictSchema: true,
    note: 'Base URL is https://<resource>.openai.azure.com/openai/deployments/<deployment>?api-version=<version>; the model is the deployment name.',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai/reference',
  },
  custom: {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    authHeader: 'bearer',
    requiresKey: false,
    jsonSchema: 'probe',
    strictSchema: false,
    note: 'Anything that speaks POST /chat/completions.',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
  },
}

export function presetFor(id: PresetId | undefined): AIPreset | undefined {
  return id === undefined ? undefined : AI_PRESETS[id]
}
