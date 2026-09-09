/**
 * The shape of a conversation with an OpenAI-compatible endpoint.
 *
 * Deliberately smaller than the protocol: no tool calls, no images, no `n`. The operations in
 * this package ask for one JSON object at a time, and a field we do not use is a field that
 * behaves differently on every endpoint (docs/06-ai-layer.md).
 */
import type { AuthHeaderStyle, PresetId } from './presets'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

/** `response_format` as the wire expects it; passed through untouched. */
export interface JsonSchemaResponseFormat {
  type: 'json_schema'
  json_schema: {
    name: string
    schema: Record<string, unknown>
    strict?: boolean
  }
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  responseFormat?: JsonSchemaResponseFormat
  signal?: AbortSignal
  /** Retries for 429, 5xx and network failures. Default 1. */
  retries?: number
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export interface ChatResult {
  content: string
  model: string
  finishReason?: string
  usage?: TokenUsage
}

export interface ChatDelta {
  delta: string
  done: boolean
}

export interface AIClientFeatures {
  /** Endpoint honours `response_format: { type: 'json_schema' }`. */
  jsonSchema?: boolean
  /** Reserved: no operation uses tool calling yet. */
  tools?: boolean
}

export interface AIClientConfig {
  /** For example `https://api.openai.com/v1`. A trailing slash and a query string are fine. */
  baseUrl: string
  /** Omitted for local servers. Never persisted outside the browser credential namespace. */
  apiKey?: string
  model: string
  extraHeaders?: Record<string, string>
  features: AIClientFeatures
  presetId?: PresetId
  /** Overrides the preset. `bearer` when neither says. */
  authHeader?: AuthHeaderStyle
  /**
   * Overrides the preset's `strictSchema`. Off when neither says, because the strict dialect
   * is only required by OpenAI and costs every other endpoint a great deal of output.
   */
  strictSchema?: boolean
  /** Route through the app's own proxy, for endpoints that send no CORS headers. */
  viaProxy?: boolean
  /** Where that proxy lives. Default `/api/ai/proxy`. */
  proxyPath?: string
  /** Default 120 000. */
  timeoutMs?: number
}

export interface ProbeResult {
  reachable: boolean
  /** False on 401 and 403; true when no key was needed. */
  authenticated: boolean
  model: string
  /** True only when a schema-shaped answer came back and validated. */
  jsonSchema: boolean
  latencyMs: number
  /** Best effort from `GET /models`; empty when the endpoint has no such route. */
  models: string[]
  error?: { code: string; message: string }
}

export interface AIClient {
  readonly config: AIClientConfig
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatDelta>
  probe(options?: { signal?: AbortSignal }): Promise<ProbeResult>
}

/** Everything the client touches that a test needs to hold still. */
export interface AIClientDeps {
  fetch?: typeof globalThis.fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}
