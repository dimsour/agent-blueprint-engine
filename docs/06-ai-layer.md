# AI layer specification

`packages/ai` (planned, roadmap P6) turns natural language into reviewable Blueprint changes. It
depends only on `@agent-blueprint/core`, speaks the OpenAI-compatible chat completions protocol
over `fetch`, and never modifies a Blueprint itself: every operation returns a `ChangeSet` or a
report that the UI shows for review.

Two rules shape everything below:

1. **BYOK, any endpoint.** The user supplies a base URL, an optional key and a model. OpenAI,
   Anthropic's compatibility endpoint, OpenRouter, a local Ollama or LM Studio, vLLM and Azure
   OpenAI all work through the same client.
2. **Nothing enters the Blueprint unvalidated.** Model output is parsed with the core Zod
   schemas before it becomes a `ChangeOp`; the review UI shows a diff; the user accepts per op.

## AIClient

```ts
export interface AIClientConfig {
  baseUrl: string // e.g. https://api.openai.com/v1
  apiKey?: string // omitted for local servers
  model: string
  extraHeaders?: Record<string, string>
  features: {
    jsonSchema?: boolean // supports response_format: { type: 'json_schema' }
    tools?: boolean // supports tool calling (reserved; unused in MVP)
  }
  presetId?: PresetId
  /** Route requests through the app's proxy (CORS workaround); default false. */
  viaProxy?: boolean
  timeoutMs?: number // default 120 000
}

export interface AIClient {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatDelta>
  structured<T>(
    schema: ZodType<T>,
    messages: ChatMessage[],
    options?: StructuredOptions,
  ): Promise<StructuredResult<T>>
  probe(): Promise<ProbeResult>
}
```

Requests go to `${baseUrl}/chat/completions` with `Authorization: Bearer <apiKey>` when a key is
set (Azure uses `api-key`; see presets). The client sets `stream: true` only for `stream()`.

### Presets

| Preset id      | Base URL                                                              | Auth header                                                                                                                                  | Notes                                                                                                                     |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `openai`       | `https://api.openai.com/v1`                                           | `Authorization: Bearer`                                                                                                                      | JSON schema supported                                                                                                     |
| `anthropic`    | `https://api.anthropic.com/v1`                                        | `Authorization: Bearer` (the compatibility route accepts the Anthropic key here; verify against current docs, some clients need `x-api-key`) | Uses the OpenAI-compatible `/chat/completions` route; `response_format` support must be probed                            |
| `openrouter`   | `https://openrouter.ai/api/v1`                                        | `Authorization: Bearer`                                                                                                                      | `extraHeaders` may carry `HTTP-Referer` and `X-Title`; JSON schema depends on the routed model                            |
| `ollama`       | `http://localhost:11434/v1`                                           | none                                                                                                                                         | Browser calls need `OLLAMA_ORIGINS` to include the app origin (or `viaProxy`); JSON schema support varies by model, probe |
| `lm-studio`    | `http://localhost:1234/v1`                                            | none                                                                                                                                         | Enable CORS in LM Studio's server settings, or `viaProxy`                                                                 |
| `vllm`         | user supplied, e.g. `http://localhost:8000/v1`                        | optional                                                                                                                                     | Guided JSON via `response_format` when the server is started with a supported backend                                     |
| `azure-openai` | `https://<resource>.openai.azure.com/openai/deployments/<deployment>` | `api-key: <key>`                                                                                                                             | Append `?api-version=<version>`; `model` is the deployment name                                                           |
| `custom`       | user supplied                                                         | user supplied                                                                                                                                | Everything probed                                                                                                         |

Presets only pre-fill the form; the stored config is always the explicit `AIClientConfig`.

### probe()

Sends a minimal request with `response_format: { type: 'json_schema', json_schema: { name: 'probe', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } } }`
and `max_tokens: 20`. Result:

```ts
export interface ProbeResult {
  reachable: boolean
  authenticated: boolean // false on 401/403
  model: string
  jsonSchema: boolean // true when the response parses and validates
  latencyMs: number
  error?: AIError
}
```

The settings screen runs `probe()` on save and stores `features.jsonSchema` from it.

### structured()

```ts
export interface StructuredOptions {
  temperature?: number // default 0.2
  maxTokens?: number
  /** Repair attempts after a validation failure; default 1. */
  repairs?: number
}

export interface StructuredResult<T> {
  value: T
  raw: string
  repaired: boolean
  usage?: { promptTokens: number; completionTokens: number }
}
```

Path A (`features.jsonSchema`): send `response_format: { type: 'json_schema', json_schema: { name, schema: zodToJsonSchema(schema), strict: true } }`, parse the content as JSON, `schema.parse`.

Path B (fallback): append a system message containing the JSON Schema and the instruction to
answer with a single JSON object and no prose. Extract the first balanced `{…}` block (tolerating
```json fences), `JSON.parse`, `schema.safeParse`. On failure, one repair round-trip: send the
raw output plus the Zod issues formatted as `path: message` lines and ask for a corrected JSON
object. After `repairs` failures the call rejects with `AIError('invalid-output')` carrying the
last raw text so the UI can show it.

Both paths validate with the same Zod schema, so the operations below cannot receive a
malformed object.

### Streaming

`stream()` parses server-sent events (`data: {…}` lines, `[DONE]` terminator) and yields
`{ delta: string, done: boolean }`. Used by the assistant panel for chat replies; structured
operations do not stream.

### Error taxonomy

| `AIError.code`      | Cause                                  | UI behaviour                                        |
| ------------------- | -------------------------------------- | --------------------------------------------------- |
| `network`           | fetch failed, CORS, DNS                | Suggest `viaProxy` for local endpoints              |
| `auth`              | 401 / 403                              | Point to settings                                   |
| `rate-limit`        | 429                                    | Retry with backoff once, then surface               |
| `server`            | 5xx                                    | Surface, allow retry                                |
| `timeout`           | exceeded `timeoutMs`                   | Surface                                             |
| `unsupported`       | 400 mentioning `response_format`       | Set `features.jsonSchema = false`, retry via path B |
| `invalid-output`    | schema validation failed after repairs | Show raw output, offer regenerate                   |
| `context-too-large` | 400 token limit                        | Reduce context budget and retry once                |

## Operations

Each operation lives in `packages/ai/src/operations/<name>.ts`, takes an `OperationContext`,
and returns a `ChangeSet` (`packages/core/src/changeset/types.ts`) or a typed report. `ChangeSet`
ops carry full `before` / `after` entities; op ids follow `changeOpId` (`create:skill:xunit`) so
the UI can key rows and the user can accept individually via `applyChangeSet(bp, cs, { accept })`.

```ts
export interface OperationContext {
  blueprint: Blueprint
  /** The artifact the user is looking at, if any. */
  selection?: EntityRef
  /** Free text from the user. */
  instruction?: string
  /** Diagnostics already computed by core, so the model does not re-derive them. */
  diagnostics?: Diagnostic[]
}
```

| Operation            | Input                                                                                                                                                             | Context sent                                                                                            | Output                                                                                                                                                                                           | Validation before ChangeSet                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generateBlueprint`  | free-text description of the system, wizard answers                                                                                                               | glossary, empty or current Blueprint summary                                                            | `ChangeSet` (source `ai`) with `create` ops for agents, skills, workflows, laws, rules, gates, hooks, tools, memory, requirements; one `update-blueprint` op for name/description/primaryAgentId | each entity through `entitySchemaFor(kind)`; ids slugified with `uniqueSlug`; references resolved (unknown ids dropped with a note); workflow graphs laid out on a grid (`position`) |
| `generateArtifact`   | `kind`, brief                                                                                                                                                     | glossary, related entities (e.g. the agent a skill is for), existing ids of that kind                   | `ChangeSet` with one `create` op (plus `update` ops that attach it, e.g. `agent.skillIds`)                                                                                                       | schema; attachment ops computed by core, not the model                                                                                                                               |
| `improveArtifact`    | `selection`, quick action (`improve`, `rewrite`, `more-specific`, `add-examples`, `add-edge-cases`, `add-verification`, `simplify`, `make-portable`) or free text | the entity, its dependents and dependencies (one hop), diagnostics about it                             | `ChangeSet` with one `update` op                                                                                                                                                                 | schema; id and kind are fixed by the caller and cannot be changed by the model                                                                                                       |
| `createWorkflowFor`  | `agentId` or brief                                                                                                                                                | agent, its skills, gates, laws                                                                          | `ChangeSet` with a `create` workflow op and an `update` op adding it to `agent.workflowIds`                                                                                                      | graph validated by `validateBlueprint` on the tentative Blueprint; errors become repair input                                                                                        |
| `createIronLawsFor`  | `selection` or brief                                                                                                                                              | agent / workflow, existing laws (to avoid duplicates)                                                   | `ChangeSet` with `create` iron-law ops and attachment `update` ops                                                                                                                               | schema; near-duplicate detection by normalized `rule` text                                                                                                                           |
| `findContradictions` | none                                                                                                                                                              | all laws, rules, skill bodies (budgeted), workflow summaries; deterministic findings from core as prior | `ContradictionReport` → converted to `Diagnostic[]` with code `BP-AI-CONTRA-001` and `related` refs                                                                                              | refs must exist; others dropped                                                                                                                                                      |
| `findMissing`        | none                                                                                                                                                              | Blueprint summary, requirements, orphans, health                                                        | `MissingReport` → `Diagnostic[]` (`BP-AI-MISSING-001`) plus an optional `ChangeSet` of proposed creations                                                                                        | schema on any proposed entity                                                                                                                                                        |
| `evaluate`           | none                                                                                                                                                              | Blueprint summary, core evaluation report                                                               | `AIEvaluationReport` (per-dimension findings with refs and suggestions) merged into the evaluation view as an "AI review" column                                                                 | refs must exist                                                                                                                                                                      |
| `compound`           | pasted notes, transcript excerpt or diff                                                                                                                          | Blueprint summary, glossary                                                                             | `ChangeSet` (source `compound`) proposing skills, laws, references, rules, workflow steps                                                                                                        | schema; every op carries a `note` explaining the evidence                                                                                                                            |

Output shapes are Zod schemas in `packages/ai/src/schemas/` that reuse the core entity input
schemas (`EntityInputTypeMap`) so the model is asked for exactly the fields core accepts. The
operation then constructs `before` from the current Blueprint and `after` from the parsed value.

## Context budgeting

```ts
export interface ContextBudget {
  maxInputTokens: number // from settings; default 24 000
  reserveForOutput: number // default 6 000
}
```

Token estimate: `Math.ceil(chars / 3.5)` (no tokenizer dependency). The context builder adds
blocks in priority order and stops when the budget is reached:

1. Glossary and output contract (always).
2. The selected entity in full.
3. One-hop dependencies and dependents of the selection (bodies truncated to 1 500 chars each).
4. Diagnostics relevant to the selection.
5. Blueprint summary: name, description, primary agent, and for every entity kind the id, name and description (never bodies).
6. Workflow summaries as ordered step labels.
7. Remaining bodies, largest first, truncated to fit.

Truncation is marked with `[… truncated …]` so the model knows. The builder records what was
omitted; the UI shows a "context trimmed" note when anything from levels 2–4 was cut.

## Prompt catalogue

- Templates live in `packages/ai/src/prompts/<operation>.v<N>.ts`, exporting `{ id, version, system, user(ctx) }`. Bumping `N` is required for any wording change that affects output shape; old versions stay for recorded-fixture tests.
- Every system prompt embeds the concept glossary from `docs/00-vision.md` (Blueprint, Agent, Skill, Workflow, Iron Law vs Rule, Hook, Gate, Tool vs Permission, Reference, Memory, Requirement, Scenario) so the model keeps the distinctions.
- Every prompt ends with an **Output contract** section: the JSON shape, the id rules (kebab-case, unique, reuse existing ids when updating), the "no secrets, no credentials" rule, and "do not invent tools or harness features".
- Quick actions are short instruction fragments composed onto the `improveArtifact` template.

## Proxy route (optional)

`apps/web/src/app/api/ai/proxy/route.ts` forwards `POST` bodies to `x-blueprint-base-url` +
`/chat/completions`, copying `Authorization` / `api-key` from the request headers, and streams
the response back. Rules: only used when `viaProxy` is on; allowed only for base URLs the user
configured (the client sends the URL, the route validates it is `http(s)` and not the app's own
origin); no request or response bodies are logged; no keys are stored server-side; the route
returns 404 when `AI_PROXY_ENABLED` is not set, so a default Vercel deployment stays inert.

## Security rules

- Keys live only in browser storage under the `credentials.ai` namespace (`sessionStorage` by default, `localStorage` when the user opts in, with a banner explaining that anyone with access to the browser profile can read it).
- Keys are excluded from every export, ZIP, GitHub push and persisted UI state.
- `AIClient` redacts `Authorization` / `api-key` in any error it throws or logs.
- Prompts never include credentials from the Blueprint (none exist by design: `mcp.envVars` holds names only).
- Model output containing strings that match common secret patterns (AWS keys, GitHub tokens, `sk-` prefixes) is rejected with `invalid-output` before it can enter a `ChangeSet`.

## Testing strategy

- Unit tests with a fake `fetch`: request shape for each preset, SSE parsing, path A / path B selection, repair loop, error mapping.
- Recorded fixtures: `packages/ai/tests/__recordings__/<operation>/<case>.json` holding request and response pairs captured once against OpenAI and once against a local Ollama model; operations are tested by replaying them, and the resulting `ChangeSet` is snapshot-tested and applied to the fixture Blueprint with `applyChangeSet`, then `validateBlueprint` must report no errors.
- Contract tests (`pnpm --filter @agent-blueprint/ai test:live`) run only when `AI_TEST_BASE_URL` is set; they execute `probe()` and one `structured()` call against a local Ollama and are excluded from CI.
- No live network calls in CI; the fake `fetch` is installed globally in the Vitest setup file.
