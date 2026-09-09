# AI layer specification

`packages/ai` turns natural language into reviewable Blueprint changes. The client, structured
output, the prompt catalogue, the context builder and the operations are built (roadmap P6-01 to
P6-04); the settings screen, the proxy route and the review UI are the web app's side of it. It
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
  /** Overrides the preset's auth style; 'bearer' when neither says. */
  authHeader?: 'bearer' | 'api-key' | 'none'
  /** Route requests through the app's proxy (CORS workaround); default false. */
  viaProxy?: boolean
  /** Where that proxy lives; default /api/ai/proxy. */
  proxyPath?: string
  timeoutMs?: number // default 120 000
}

export interface AIClient {
  readonly config: AIClientConfig
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatDelta>
  probe(options?: { signal?: AbortSignal }): Promise<ProbeResult>
}

/** Constructed with the transport injected, so tests hold the network still. */
export function createAIClient(
  config: AIClientConfig,
  deps?: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number },
): AIClient
```

`structured()` is a free function over an `AIClient` rather than a method on it: the client is
transport and knows nothing about schemas, repair or content, which is what makes each of them
testable for what it is.

Requests go to `${baseUrl}/chat/completions` with `Authorization: Bearer <apiKey>` when a key is
set (Azure uses `api-key`; see presets). A query string on the base URL is preserved, because
Azure's `?api-version=` lives there. The client sets `stream: true` only for `stream()`.

Retries are bounded and only for failures a second attempt could fix: 429 (honouring
`Retry-After`), 5xx and a failure to connect, once by default with a 500 ms backoff. A 4xx is
never retried — the same body would be rejected the same way.

### Presets

| Preset id      | Base URL                                                              | Auth header             | Notes                                                                                                                     |
| -------------- | --------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `openai`       | `https://api.openai.com/v1`                                           | `Authorization: Bearer` | JSON schema supported                                                                                                     |
| `anthropic`    | `https://api.anthropic.com/v1/`                                       | `Authorization: Bearer` | Verified 2026-09-09. `response_format` is **ignored**, so this preset always uses the prompt-and-repair path (see below)  |
| `openrouter`   | `https://openrouter.ai/api/v1`                                        | `Authorization: Bearer` | `extraHeaders` may carry `HTTP-Referer` and `X-Title`; JSON schema depends on the routed model                            |
| `ollama`       | `http://localhost:11434/v1`                                           | none                    | Browser calls need `OLLAMA_ORIGINS` to include the app origin (or `viaProxy`); JSON schema support varies by model, probe |
| `lm-studio`    | `http://localhost:1234/v1`                                            | none                    | Enable CORS in LM Studio's server settings, or `viaProxy`                                                                 |
| `vllm`         | user supplied, e.g. `http://localhost:8000/v1`                        | optional                | Guided JSON via `response_format` when the server is started with a supported backend                                     |
| `azure-openai` | `https://<resource>.openai.azure.com/openai/deployments/<deployment>` | `api-key: <key>`        | Append `?api-version=<version>`; `model` is the deployment name                                                           |
| `custom`       | user supplied                                                         | user supplied           | Everything probed                                                                                                         |

### The Anthropic compatibility endpoint (verified 2026-09-09)

Checked against https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk.
Anthropic exposes an OpenAI-compatible chat completions route, and the differences below
change how `AIClient` must behave, so they are settled here rather than discovered at runtime.

| Question                   | Answer                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL                   | `https://api.anthropic.com/v1/`                                                                                                                                     |
| Auth header                | `Authorization: Bearer <key>`. The documented header table lists `authorization` as fully supported; `x-api-key` is the native API's header and is not needed here. |
| `response_format`          | **Ignored.** JSON-schema structured output is not available on this route.                                                                                          |
| `tools[].function.strict`  | Ignored, so tool-call arguments are not guaranteed to match the schema either.                                                                                      |
| `stream`, `stream_options` | Fully supported.                                                                                                                                                    |
| `n`                        | Must be exactly 1.                                                                                                                                                  |
| `temperature`              | Clamped to the range 0 to 1; higher values are capped.                                                                                                              |
| System messages            | Every system and developer message is hoisted to the front and concatenated with newlines, because Claude takes a single system message.                            |
| Workspace-scoped keys      | A personal or service-account key with access to several workspaces must also send `anthropic-workspace-id`; expose it through `extraHeaders`.                      |

Consequences for the client:

1. `probe()` must not conclude that JSON schema works simply because the request is accepted:
   unsupported fields on this route are ignored silently rather than rejected. The preset
   therefore declares `features.jsonSchema: false` outright, and `structured()` uses path B
   (schema in the prompt, parse, validate with Zod, one repair round-trip).
2. Do not send several system messages expecting them to stay in place, and do not rely on
   `n`, `seed`, `logprobs`, `presence_penalty` or `frequency_penalty`.
3. Anthropic documents this layer as a way to test and compare models rather than a
   production surface. The settings UI should say so next to the preset, and users who want
   guaranteed schema conformance from Claude should be pointed at the native API, which the
   `custom` preset cannot express today. Adding a native Anthropic provider is a candidate for
   roadmap P6.

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
  models: string[] // best effort from GET /models; empty when there is no such route
  error?: { code: AIErrorCode; message: string }
}
```

A preset that already declares `jsonSchema: false` wins over the answer. The Anthropic
compatibility route would pass this probe by luck and then return prose for real work, so what
is known about the endpoint beats what one twenty-token reply appeared to show.

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
  /** Which path produced it; path B is the one that can cost extra calls. */
  mode: 'json-schema' | 'prompt'
  usage?: { promptTokens: number; completionTokens: number }
}
```

Path A (`features.jsonSchema`): send `response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }`, parse the content as JSON, `schema.parse`.

The schema is the Zod schema converted to OpenAI's strict dialect, which is narrower than JSON
Schema: every object closes itself to extra keys and lists **every** property as required, so an
optional field is expressed as "or null" instead. What comes back therefore carries explicit
nulls where the Zod schema has optional fields, and `dropNulls` removes them before validation.
No core schema uses `.nullable()`, so "null means absent" is unambiguous.

A 400 naming `response_format` is not a failure of the call: the endpoint has just said it has
no schema mode, and `structured()` switches to path B and asks again.

Path B (fallback): append a system message containing the JSON Schema and the instruction to
answer with a single JSON object and no prose. Extract the first balanced `{…}` block (tolerating
```json fences), `JSON.parse`, `schema.safeParse`. On failure, one repair round-trip: send the
raw output plus the Zod issues formatted as `path: message` lines and ask for a corrected JSON
object. After `repairs` failures the call rejects with `AIError('invalid-output')` carrying the
last raw text so the UI can show it.

One failure is never repaired: an answer containing something shaped like a credential is
rejected immediately. Asking again would produce the same text, and the point is that it must
not reach a ChangeSet.

### Tolerant lists

Operations that answer with many artifacts at once — `generateBlueprint`, `createIronLawsFor`,
and the proposal lists of `findMissing` and `compound` — wrap each element so that a element
which does not validate is kept as raw JSON instead of failing the whole answer. The JSON Schema
sent to the endpoint is unchanged, so the model is still told exactly what a Skill is; what
changes is the cost of getting one field wrong in a list of twenty. The assembler then drops
that one artifact with a note and the rest reach the review. Single-artifact answers stay strict:
there, a repair round trip is the right response.

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

Each operation lives in `packages/ai/src/operations/<name>.ts`, takes an `OperationContext` and
an `OperationDeps` (`{ client, budget?, structured? }`), and returns a `ChangeSet`
(`packages/core/src/changeset/types.ts`) or a typed report, alongside `notes` and
`contextTrimmed`. `ChangeSet`
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

Every result carries two more things than the proposal itself:

- `notes`: what could not be honoured — an artifact that would not parse, a reference to
  something the model never wrote, a duplicate law, a primary agent that does not exist. These
  are shown with the review. An operation that silently loses half an answer is worse than one
  that fails, because the user believes they reviewed the whole thing.
- `contextTrimmed`: true when something the answer depended on did not fit the budget.

| Operation            | Input                                                                                                                                                             | Context sent                                                                                            | Output                                                                                                                                                                                           | Validation before ChangeSet                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generateBlueprint`  | free-text description of the system, wizard answers                                                                                                               | glossary, empty or current Blueprint summary                                                            | `ChangeSet` (source `ai`) with `create` ops for agents, skills, workflows, laws, rules, gates, hooks, tools, memory, requirements; one `update-blueprint` op for name/description/primaryAgentId | each entity through `entitySchemaFor(kind)`; ids slugified with `uniqueSlug`; references resolved (unknown ids dropped with a note); workflow graphs laid out on a grid (`position`) |
| `generateArtifact`   | `kind`, brief                                                                                                                                                     | glossary, related entities (e.g. the agent a skill is for), existing ids of that kind                   | `ChangeSet` with one `create` op (plus `update` ops that attach it, e.g. `agent.skillIds`)                                                                                                       | schema; attachment ops computed by core, not the model                                                                                                                               |
| `improveArtifact`    | `selection`, quick action (`improve`, `rewrite`, `more-specific`, `add-examples`, `add-edge-cases`, `add-verification`, `simplify`, `make-portable`) or free text | the entity, its dependents and dependencies (one hop), diagnostics about it                             | `ChangeSet` with one `update` op                                                                                                                                                                 | schema; id and kind are fixed by the caller and cannot be changed by the model                                                                                                       |
| `createWorkflowFor`  | `agentId` or brief                                                                                                                                                | agent, its skills, gates, laws                                                                          | `ChangeSet` with a `create` workflow op and an `update` op adding it to `agent.workflowIds`                                                                                                      | graph validated by `validateBlueprint` on the tentative Blueprint; new `BP-WF-*` findings and any new error become repair input for exactly one second attempt                       |
| `createIronLawsFor`  | `selection` or brief                                                                                                                                              | agent / workflow, existing laws (to avoid duplicates)                                                   | `ChangeSet` with `create` iron-law ops and attachment `update` ops                                                                                                                               | schema; near-duplicate detection by normalized `rule` text                                                                                                                           |
| `findContradictions` | none                                                                                                                                                              | all laws, rules, skill bodies (budgeted), workflow summaries; deterministic findings from core as prior | `ContradictionReport` → converted to `Diagnostic[]` with code `BP-AI-CONTRA-001` and `related` refs                                                                                              | refs must exist; others dropped                                                                                                                                                      |
| `findMissing`        | none                                                                                                                                                              | Blueprint summary, requirements, orphans, health                                                        | `MissingReport` → `Diagnostic[]` (`BP-AI-MISSING-001`) plus an optional `ChangeSet` of proposed creations                                                                                        | schema on any proposed entity                                                                                                                                                        |
| `evaluate`           | none                                                                                                                                                              | Blueprint summary, core evaluation report                                                               | `AIEvaluationReport` (per-dimension findings with refs and suggestions) merged into the evaluation view as an "AI review" column                                                                 | refs must exist                                                                                                                                                                      |
| `compound`           | pasted notes, transcript excerpt or diff                                                                                                                          | Blueprint summary, glossary                                                                             | `ChangeSet` (source `compound`) proposing skills, laws, references, rules, workflow steps                                                                                                        | schema; every op carries a `note` explaining the evidence                                                                                                                            |

Output shapes are Zod schemas in `packages/ai/src/schemas/` that reuse the core entity schemas so
the model is asked for exactly the fields core accepts (AGENTS.md rule 7). Two fields are taken
out: `metadata`, which belongs to the project reader and preserves unknown keys across a round
trip, and a workflow step's `position`, which is a drawing decision.

### Assembly

`assembleChangeSet` is the gate between an answer and a Blueprint, and every operation goes
through it. In order:

1. Fill in what models reliably omit — an id derived from the name, step ids from labels, edge
   ids by index — then parse with the AI schema for the kind.
2. Give the artifact its final id: an id that matches an existing artifact makes this an update;
   otherwise `uniqueSlug` finds a free one.
3. Parse again with the real core schema, laying out a workflow's steps on a grid (depth from the
   entry step across, siblings down) so it opens as a legible graph and does so identically every
   time.
4. Build a tentative Blueprint and run `visitRefs` over the artifacts this answer produced.
   References to an id that had to move follow it — but only when nothing else ended up with the
   original id, since a model that writes two skills called `xunit` means the first one.
   References to something that does not exist are removed, each with a note.
5. Wire what was created into an agent, when the caller named one. The attachment is computed
   rather than asked for: the model cannot know the id an artifact ended up with, and an agent
   rewritten by a model is a diff nobody reads.
6. Emit ops, skipping any whose `before` and `after` are identical.

The ChangeSet id is the operation that produced it (`ai:generate-blueprint`), never a random
value: the same answer against the same Blueprint produces the same ChangeSet.

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

Level 1 is the caller's `preamble` and is never dropped. In practice the operations do not use
it: the glossary is already in the system message, so `contextFor` subtracts the system prompt's
estimated tokens from the budget instead of repeating it in the request.

An artifact is rendered as the file it is stored as — YAML frontmatter, then the Markdown body —
because the model is being asked to write those fields back, and showing it the real file is the
shortest path between what it reads and what it must produce.

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
- Model output containing strings that match common secret patterns (AWS keys, GitHub tokens, `sk-` prefixes) is rejected with `invalid-output` before it can enter a `ChangeSet`, and without a repair round trip.

## Diagnostic codes

The AI layer emits two codes, catalogued alongside the deterministic ones in
`docs/05-validation-evaluation.md`. Both carry `data.source: 'ai'` so the UI can mark them and a
filter can remove them.

| Code                | Severity                  | Meaning                                               |
| ------------------- | ------------------------- | ----------------------------------------------------- |
| `BP-AI-CONTRA-001`  | warning                   | Two instructions that cannot both be followed.        |
| `BP-AI-MISSING-001` | warning or info, by claim | Something the Blueprint implies but does not specify. |

## Testing strategy

- Unit tests with a fake `fetch`: request shape for each preset, SSE parsing, path A / path B selection, repair loop, error mapping.
- Recorded fixtures: `packages/ai/tests/__recordings__/<operation>/<case>.json` holding request and response pairs captured once against OpenAI and once against a local Ollama model; operations are tested by replaying them, and the resulting `ChangeSet` is snapshot-tested and applied to the fixture Blueprint with `applyChangeSet`, then `validateBlueprint` must report no errors.
- Contract tests (`pnpm --filter @agent-blueprint/ai test:live`) run only when `AI_TEST_BASE_URL` is set; they execute `probe()` and one `structured()` call against a local Ollama and are excluded from CI.
- No live network calls in CI; the fake `fetch` is installed globally in the Vitest setup file.
