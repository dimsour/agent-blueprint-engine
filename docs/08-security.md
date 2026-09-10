# Security

This document sets the rules for handling credentials and secrets in Agent Blueprint. Where another document says something different about a credential, this one is right and the other is corrected (ADR-22). The product is local-first and bring-your-own-key: users paste an AI API key and a GitHub token into a browser app that has no database. That makes the browser the trust boundary, and it makes "never let a secret reach a Blueprint file, an export, or a log" the single most important invariant. Everything below follows from it.

## Invariants

1. **Credentials never enter Blueprint data.** No schema in `packages/core/src/schema/` has a field for a key or token. The MCP tool definition stores environment variable _names_ only (`envVars: string[]` in `packages/core/src/schema/knowledge.ts`); values are supplied by the harness at runtime.
2. **Credentials never enter exports.** ZIP export, generated harness files and GitHub pushes are produced from the Blueprint and the compiler, which have no access to the credential store.
3. **Credentials never enter logs.** Neither the browser code nor the optional Next.js route handlers log request bodies, headers or tokens.
4. **Nothing is stored server-side.** The optional route handlers are stateless relays.
5. **The user is told where a secret is kept and what that means** before it is kept.

## Credential storage in the browser (AI: built, P6-05; GitHub: built, P7-01)

| Item                                         | Default location | Opt-in location               | Namespace                  |
| -------------------------------------------- | ---------------- | ----------------------------- | -------------------------- |
| AI endpoint config (base URL, model, preset) | `localStorage`   |                               | `ab:settings:ai`           |
| AI API key                                   | `sessionStorage` | `localStorage` with a warning | `ab:credentials:ai`        |
| GitHub token (PAT or OAuth)                  | `sessionStorage` | `localStorage` with a warning | `ab:credentials:github`    |
| UI preferences (theme)                       | `localStorage`   |                               | `ab:ui:theme`              |
| Panel widths                                 | `localStorage`   |                               | `react-resizable-panels:*` |
| Project drafts                               | IndexedDB        |                               | database `agent-blueprint` |

Rules:

- The credential namespace `ab:credentials:*` is read by exactly one module, `apps/web/src/lib/credentials.ts`. Nothing else touches `sessionStorage`/`localStorage` for secrets. Writing to one place removes the copy in the other, so switching from "in this browser" back to "until this tab closes" does not leave the key behind.
- The Zustand store is never persisted with credentials in it; persisted slices are allow-listed, not deny-listed.
- Choosing `localStorage` shows this text (or equivalent) before saving: _"The key will stay in this browser profile until you remove it. Anyone with access to this profile, and any browser extension with storage access, can read it. Use a key with the smallest scope you can, and remove it from Settings when you are done."_
- A **Forget credentials** action in Settings clears both namespaces.
- Keys are masked in the UI after entry; there is no "reveal" button.

## Optional server routes

Both routes exist only to work around browser limitations. The app is fully functional without them when the AI endpoint allows CORS and the user pastes a GitHub token.

### `/api/ai/proxy` (built, P6-05)

- Purpose: relay `POST /chat/completions` to a user-configured base URL that does not send CORS headers (typical for a local Ollama or vLLM without `OLLAMA_ORIGINS`).
- The API key arrives in a request header (`x-ab-upstream-authorization`), is forwarded as `Authorization` — or as `api-key` when `x-ab-upstream-auth-header` names it, which is what Azure needs — and is never read into a variable that outlives the request. Those are the only two names the route will set.
- The upstream base URL arrives in a header (`x-ab-upstream-url`) and must match an allow-list configured by the deployment (`AI_PROXY_ALLOWED_HOSTS`, comma-separated; default: `localhost`, `127.0.0.1`, `[::1]`; `*` disables the check). Anything else returns 403, naming the host that was asked for and not the list that would have worked. This prevents the deployed proxy from being used as an open relay.
- Streams the upstream response through; no buffering, no logging of body or headers, no analytics.
- Returns upstream status codes unchanged; error bodies are passed through, not augmented.

### `/api/github/oauth/start` and `/callback` (built, P7-01)

- Enabled only when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set. Without them the UI shows only the PAT path.
- `start` redirects to GitHub with a random `state` stored in a short-lived, `HttpOnly`, `SameSite=Lax` cookie.
- `callback` verifies `state`, exchanges the code for a token, and returns the token to the client page **once** (rendered into a page that posts it to the opener via `postMessage` with a same-origin target, then closes). The token is not set as a cookie and is not stored server-side.
- Requested scopes are the minimum for the feature: `repo` (or fine-grained equivalent) only. No `user:email`, no `admin:*`.
- Logging: the route logs nothing on success; on failure it logs the error class and HTTP status, never the code, state or token.

### `.env`

```
# optional; enables the GitHub OAuth route handlers
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
# optional; hosts the AI proxy may relay to
AI_PROXY_ALLOWED_HOSTS=localhost,127.0.0.1
```

`.env*` is git-ignored except `.env.example`. No other secrets belong in the deployment.

## Secrets in generated files

- The compiler emits only Blueprint content. Still, users write free text, and a pasted key in a skill body is a real risk.
- **Secret scan before export and push** (P5/P7): every generated and source file is scanned for common credential patterns (AWS access keys, GitHub `ghp_`/`github_pat_`, OpenAI `sk-`, Anthropic `sk-ant-`, private key blocks, JWT-looking strings, generic `api[_-]?key\s*[:=]\s*\S{16,}`). A hit blocks the action with the file and line, and the user can override per finding.
- The same scanner is offered as a Hook action (`secret-scan` in `HOOK_ACTION_TYPES`, `packages/core/src/schema/governance.ts`) so that compiled projects can run it inside the harness on every file change.
- Hooks compile to commands. The compiler never embeds a token in a hook command; if a user writes one into `action.command`, the secret scan reports it.

## Threat model

| Threat                                                             | Mitigation                                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key leaks into a Blueprint file and is committed                   | No schema field for secrets; secret scan on export and push; MCP definitions carry env var names only                                                                          |
| Key leaks through the UI's persisted state                         | Persisted store slices are allow-listed; credentials live in their own namespace read by one module                                                                            |
| Deployed AI proxy used as an open relay                            | Upstream host allow-list; default localhost only                                                                                                                               |
| Token stolen via XSS                                               | React escaping; no `dangerouslySetInnerHTML` with user content; Markdown preview rendered through a sanitising renderer; `sessionStorage` default limits lifetime              |
| Token stolen via a malicious browser extension                     | Out of scope technically; mitigated by the explicit warning, minimal scopes, and the Forget action                                                                             |
| OAuth code interception / CSRF                                     | `state` in an `HttpOnly` cookie; same-origin `postMessage`; one-time delivery                                                                                                  |
| Server logs capture credentials                                    | Routes log nothing on success and only error class/status on failure                                                                                                           |
| Compiled hooks execute attacker-controlled commands                | Hook commands come from the user's own Blueprint; the compatibility view and the export preview show every command before it is written; harness trust prompts remain in force |
| Prompt injection through imported Blueprints into the AI assistant | AI output is a ChangeSet reviewed by the user; nothing applies automatically; imported content is treated as data in prompts                                                   |
| Supply-chain: dependency runs postinstall scripts                  | pnpm ignores build scripts unless approved (`pnpm approve-builds`); lockfile frozen in CI                                                                                      |

## Reviewer checklist for credential-touching changes

- [ ] No new field in `packages/core/src/schema/` can hold a secret; MCP config still stores names only.
- [ ] Credentials are read and written only in the credentials module; no other `localStorage`/`sessionStorage` access for secrets.
- [ ] Persisted store configuration allow-lists slices; credentials are not in the list.
- [ ] No `console.*`, telemetry, or error reporter receives a token, key, header set, or request body.
- [ ] Route handlers: host allow-list enforced; `state` verified; token delivered once; no cookie carrying the token; no server-side storage.
- [ ] Export and push paths call the secret scanner and surface hits before writing.
- [ ] Any new warning text about local storage is shown before the secret is stored, not after.
- [ ] Tests cover: key absent from `renderProjectFiles` output, key absent from ZIP, proxy rejects a non-allow-listed host, callback rejects a bad `state`.
