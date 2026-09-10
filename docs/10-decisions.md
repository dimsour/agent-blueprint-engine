# Architecture Decision Records

Each record captures a decision that shapes the codebase, why it was taken, and what it costs. Numbers are stable; new records are appended. ADR-1 to ADR-15 correspond to the refinements of the original product brief; ADR-16 onward are engineering decisions made during the foundation phase. All are **accepted** unless stated otherwise.

## ADR-1: Templates and Examples are not Blueprint entities

- **Status**: accepted
- **Context**: The brief listed Templates and Examples among the things a user "visually defines" alongside agents and skills.
- **Decision**: Templates are a library (`packages/templates`) that produces entities as ChangeSets. Examples are sections inside Skill and Iron Law bodies (`examples[]` / `counterexamples[]` on `ironLawSchema`) or References with `kind: 'example'`.
- **Consequences**: Fewer entity kinds to validate, compile and render. Templates can be versioned independently of any project. Users cannot store a private template inside a project (deferred to reusable libraries).
- **Alternatives**: a `templates` collection in the Blueprint (rejected: templates are not part of the compiled system).

## ADR-2: "Evaluations" splits into Requirements, Scenarios and Evaluation Reports

- **Status**: accepted
- **Context**: The brief used "Evaluations" for quality scoring, behavioural tests and requirement verification at once.
- **Decision**: `Requirement` (authored, with declarative `checks`) and `Scenario` (authored behavioural test) are entities (`packages/core/src/schema/quality.ts`). The evaluation report is a computed value, never stored in `blueprint/`.
- **Consequences**: Requirement verification is a deterministic computation over `RequirementCheck` unions, with `ai-judged` as an explicit escape hatch. Reports never go stale in Git. Users must express requirements as checks to get automatic verification.
- **Alternatives**: a single `evaluations` collection (rejected: mixes source and derived data).

## ADR-3: No generic `connections[]` table

- **Status**: accepted
- **Context**: The brief proposed `connections: Connection[]` on the Blueprint.
- **Decision**: Relationships are typed fields (`agent.skillIds`, `workflow.nodes[].config.gateId`, `ironLaw.scope.agentIds`, …). `visitRefs` in `packages/core/src/model/refs.ts` is the single registry of reference sites; the dependency graph is derived from it.
- **Consequences**: One source of truth per relationship; rename and delete are generic. Adding a reference-bearing field requires adding it to `visitRefs` (the fixture reference test catches omissions).
- **Alternatives**: a generic edge table (rejected: two places to keep in sync, semantics lost).

## ADR-4: Entity ids are slugs

- **Status**: accepted
- **Context**: Ids must be stable across renames, Git-friendly and usable as file names; the Agent Skills spec requires a skill's `name` to equal its directory.
- **Decision**: `id` is kebab-case (`SLUG_RE` in `model/ids.ts`, max 64), unique per kind, used as file name and cross-reference. `renameEntity` is the only way to change one; it rewrites all references.
- **Consequences**: Readable diffs and paths. A rename touches every referencing file (visible in Git, intentional). Display `name` is free text and independent.
- **Alternatives**: random ids plus derived slugs (rejected: noise in files, two identifiers to reconcile).

## ADR-5: The on-disk project is the source of truth

- **Status**: accepted
- **Context**: A monolithic `blueprint.json` is easy to load but hostile to Git and hand editing, and unusable by a future CLI without the app.
- **Decision**: `blueprint/` holds `blueprint.yaml` (project-level data and ordered id lists) plus one file per artifact (`packages/core/src/project/layout.ts`). The in-memory `Blueprint` is assembled by `readProject` and written by `writeProject`.
- **Consequences**: One-file diffs per artifact; humans and CLIs can edit the source. The reader must be tolerant (per-artifact diagnostics) and the writer strict.
- **Alternatives**: single JSON file (rejected); JSON per artifact (rejected: Markdown bodies belong in Markdown files).

## ADR-6: Compiled output lands at the repository root in harness-native locations

- **Status**: accepted
- **Context**: The generated repository must be directly usable by a harness and may be an existing code repository.
- **Decision**: Adapters emit `CLAUDE.md`, `.claude/`, `AGENTS.md`, `.agents/`, `.codex/`, `.github/`, `opencode.json`, `.pi/` at the root. `blueprint/build-manifest.json` (`packages/core/src/project/build-manifest.ts`) records every owned path with a sha256 so re-exports prune stale files and never overwrite user files.
- **Consequences**: Push-to-existing-repo works. Ownership must be tracked meticulously; the manifest is the contract.
- **Alternatives**: compile into a subdirectory (rejected: harnesses would not find the files).

## ADR-7: A Blueprint designates a primary agent

- **Status**: accepted
- **Context**: Root instruction files (`CLAUDE.md`, `AGENTS.md`) can carry one persona; harnesses model the others as subagents.
- **Decision**: `settings.primaryAgentId`. Its persona becomes the root file; other agents compile to subagents. Validation rule `BP-AGENT-002` warns when several agents exist without a primary.
- **Consequences**: Single-agent Blueprints are trivial. Multi-agent Blueprints must choose; the compiler falls back to the first agent with a warning.
- **Alternatives**: infer from role `orchestrator` (rejected: implicit; kept as a UI suggestion only).

## ADR-8: Workflows compile to orchestration skills

- **Status**: accepted
- **Context**: No harness has a native workflow graph primitive; all support Agent-Skills-spec `SKILL.md` and slash-command invocation.
- **Decision**: Each workflow compiles to an invocable skill describing ordered steps, delegation targets, parallel groups, gates and failure behaviour (`emitWorkflowSkill`).
- **Consequences**: Workflows become usable everywhere; capability matrices mark them "adapted", not "native". The graph's semantics must be serialisable to prose deterministically.
- **Alternatives**: harness-specific orchestration code (rejected for MVP; possible per-adapter enhancement later).

## ADR-9: Agent Skills spec is the shared skill format

- **Status**: accepted
- **Context**: Claude Code, Codex, Copilot, OpenCode and Pi all read `SKILL.md` per the agentskills.io spec.
- **Decision**: One shared emitter writes skills; Claude Code reads `.claude/skills/`, the others `.agents/skills/`. `SKILL_DESCRIPTION_MAX_LENGTH` (1024) and slug rules are validated in core (`BP-SKILL-001`).
- **Consequences**: Skills are truly portable. Blueprint-specific extras (activation, references) are folded into spec-compatible fields or `metadata` on output.
- **Alternatives**: per-harness skill formats (rejected: duplication without benefit).

## ADR-10: Permissions are abstract operations

- **Status**: accepted
- **Context**: Each harness has its own permission syntax and granularity.
- **Decision**: `PERMISSION_OPERATIONS` (`fs.read` … `mcp`) with allow / ask / deny plus pattern overrides (`packages/core/src/schema/agent.ts`). Adapters lower them; where lowering loses precision the compatibility view says "limited".
- **Consequences**: One permission model in the UI. Lowering tables must be maintained per adapter.
- **Alternatives**: store harness syntax directly (rejected: leaks harness concepts into the core model).

## ADR-11: Hooks and Gates are abstract with per-harness lowering

- **Status**: accepted
- **Context**: Hook events and enforcement mechanisms differ per harness; some cannot enforce at all.
- **Decision**: `HOOK_TRIGGERS` and `HOOK_ACTION_TYPES` are harness-neutral; a `Gate` is a reusable checkpoint referenced by workflow gate nodes. Executable gate criteria compile to stop hooks where available, otherwise to instructions (adapted).
- **Consequences**: Governance is portable with honest degradation. Adapters need a trigger lowering table each.
- **Alternatives**: expose raw harness hook events (rejected).

## ADR-12: The AI layer speaks OpenAI-compatible chat completions via fetch

- **Status**: accepted
- **Context**: The user wants to bring any key: OpenAI, Anthropic's compatibility endpoint, OpenRouter, or a local model (Ollama, LM Studio, vLLM).
- **Decision**: `packages/ai` uses `fetch` against a configurable base URL, with presets and a probe for JSON-schema support; structured output falls back to prompt-guided JSON plus Zod validation and one repair pass. No vendor SDK.
- **Consequences**: Works in the browser and Node; local models are first-class. Provider-specific features (native tool use variants) are not exploited.
- **Alternatives**: vendor SDKs per provider (rejected: bundle size, server-only assumptions).

## ADR-13: CodeMirror 6 instead of Monaco

- **Status**: accepted
- **Context**: The brief allowed either.
- **Decision**: CodeMirror 6 behind an editor interface.
- **Consequences**: Small bundle, SSR-friendly, good Markdown/YAML modes. Monaco could be swapped in behind the interface if users demand VS Code parity.
- **Alternatives**: Monaco (rejected: several MB, worker setup, weaker SSR story).

## ADR-14: Local-first storage tiers

- **Status**: accepted
- **Context**: No database; the project must be reopenable and portable.
- **Decision**: File System Access API for real folders (Chromium), IndexedDB for projects and drafts elsewhere, ZIP import/export everywhere; all through `VirtualFs`.
- **Consequences**: The same reader/writer serves every tier. Non-Chromium browsers lose direct folder editing but keep ZIP.
- **Alternatives**: browser storage only (rejected: brief forbids browser state as the only source of truth).

## ADR-15: Compound loop input is text

- **Status**: accepted
- **Context**: The app is not the runtime, so it cannot observe agent work directly.
- **Decision**: "Turn this into reusable knowledge" takes pasted notes, a transcript or a diff and returns a ChangeSet.
- **Consequences**: Works with any harness today. Automatic capture is deferred to CI or telemetry integrations.
- **Alternatives**: harness plugins that stream sessions (deferred).

## ADR-16: Workspace packages are consumed as source

- **Status**: accepted
- **Context**: A build step per package slows iteration and complicates Vitest and Next.js setups.
- **Decision**: `exports` point at `src/index.ts`; Next uses `transpilePackages`; `typecheck` is `tsc --noEmit`; no `dist/`.
- **Consequences**: Zero build for dev and test. Publishing or a CLI needs an emit step and `publishConfig.exports` later.
- **Alternatives**: `tsc -b` project references with `dist/` (rejected for now).

## ADR-21: Fixture projects are kept in canonical form by a script in core

- **Status**: accepted
- **Context**: The byte-identity test (`renderProjectFiles(read(fixture)) === fixture files`) requires fixtures to be exactly what the writer produces, which nobody can author by hand reliably.
- **Decision**: `packages/fixtures` holds only data and a reader (`readFixtureFiles`, `node:fs`). `packages/core/scripts/canonicalize-fixtures.ts` (run with `pnpm --filter @agent-blueprint/core fixtures:canonicalize`, via `tsx`) reads each fixture, writes it back through `renderProjectFiles`, and deletes stale artifact files. Contributors edit a fixture by hand, run the script, and review the resulting diff.
- **Consequences**: Fixtures double as golden files for the project format; a writer change shows up as a fixture diff in review. `fixtures` has no runtime dependency on `core`, avoiding a cycle (`core` depends on `fixtures` at dev time only).
- **Alternatives**: script inside `fixtures` depending on `core` (rejected: dependency cycle at dev time, confusing ownership).

## ADR-17: TypeScript pinned to 5.9

- **Status**: accepted
- **Context**: TypeScript 7 (the native compiler) is the latest release, but `typescript-eslint` declares `<6.1.0` and other tooling has not caught up.
- **Decision**: `typescript: 5.9.3` in every `package.json`; revisit when typescript-eslint, Next and Vitest support 7.
- **Consequences**: Predictable tooling. Slower type checks than TS 7 would give.
- **Alternatives**: TypeScript 7 (rejected until peers support it).

## ADR-18: Frontmatter is canonical per-artifact metadata; the manifest holds only project-level data

- **Status**: accepted
- **Context**: Storing artifact metadata both in `blueprint.yaml` and in each file invites drift.
- **Decision**: Every field except `id` (file name) and `body` (file body) lives in the artifact's frontmatter or YAML file. `blueprint.yaml` holds `name`, `version`, `description`, `settings`, `targets` and ordered id lists under `artifacts` (`manifestSchema`). Files present but unlisted are appended with a warning (`BP-PROJECT-004`); listed but missing files are errors (`BP-PROJECT-002`).
- **Consequences**: Editing a skill touches one file. Ordering remains user-controlled. Source `SKILL.md` frontmatter uses Blueprint field names (`name` is the display name); the compiled `SKILL.md` is what conforms to the Agent Skills spec.
- **Alternatives**: manifest as the full index of metadata (rejected: drift).

## ADR-19: Schema defaults are omitted on write and restored on read

- **Status**: accepted
- **Context**: Schema defaults (`[]`, `{}`, `required: true`, `scope.all: true`, `enabled: true`, `sourceDir: blueprint`) would clutter every file and make diffs noisy; a file should contain only what the author decided.
- **Decision**: Before writing, `stripDefaults(value, schema)` (`packages/core/src/project/strip-defaults.ts`) walks the Zod definition and drops any value that equals its `.default()` / `.prefault()` value (prefault defaults are normalized through the inner schema first), then `pruneEmpty` removes remaining `undefined`, empty strings, arrays and objects. Reading applies the same defaults through the schema. Two exceptions are written always: the manifest's `version`, and workflow graph JSON uses `stableJson` (schema key order) rather than sorted keys so `id`, `type`, `label` read naturally.
- **Consequences**: Minimal files; `write(read(write(x)))` is byte-identical (tested in `packages/core/tests/project.test.ts`). Changing a schema default silently changes the meaning of files that omit the field, so default changes require a migration (ADR in `packages/core/src/migrations/index.ts` header). A field whose meaningful value equals its default cannot be distinguished from an omitted one (by design).
- **Alternatives**: prune empties only, keep scalar defaults explicit (rejected after seeing `enabled: true`, `all: true`, `onSuccess: continue` repeated in every file).

## ADR-20: Workflow node config is a flat optional bag

- **Status**: accepted
- **Context**: A discriminated union per node type is type-safe but forces the editor to reshape config when a node changes type.
- **Decision**: `workflowNodeConfigSchema` has optional fields for every node type; validation rule `BP-WF-005` reports type-appropriate fields that are missing (see the comment in `packages/core/src/schema/workflow.ts`).
- **Consequences**: Changing a node's type keeps its settings; the editor is simpler. Type checking cannot prove a node is complete; validation does.
- **Alternatives**: discriminated union (rejected for editor ergonomics; can be layered as a derived view later).

## ADR-22: docs/08 wins wherever a document touches credentials

- **Status**: accepted
- **Context**: `docs/06-ai-layer.md` and `docs/08-security.md` both specified `/api/ai/proxy`, and they disagreed. docs/06 said the base URL arrives as `x-blueprint-base-url`, the credential is copied from the request's own `Authorization` / `api-key`, and the route returns 404 unless `AI_PROXY_ENABLED` is set. docs/08 said `x-ab-upstream-url` and `x-ab-upstream-authorization`, gated by a host allow-list (`AI_PROXY_ALLOWED_HOSTS`, localhost by default). Both were written before the route existed, so neither was wrong on evidence; the conflict only had to be settled when it was built (P6-05).
- **Decision**: docs/08 is authoritative wherever a document touches credential handling, and the other document is corrected to match rather than the difference being split. Concretely: `x-ab-upstream-url` and `x-ab-upstream-authorization`, plus one addition — `x-ab-upstream-auth-header`, so Azure's `api-key` style can be relayed too, and the route will set no other header name. The host allow-list is the only gate; there is no separate `AI_PROXY_ENABLED`.
- **Consequences**: One gate to reason about instead of two that can disagree about whether the relay is on. The credential never travels as this app's own `Authorization`, so a deployment can put its own auth in front of the app without the two colliding. Adding a header the route will set now means changing docs/08 first. The cost is deliberate friction: a deployment that wants the relay for a non-local endpoint has to name that host, and the refusal says which host was asked for rather than which ones would have worked.
- **Alternatives**: keep both switches (rejected: `AI_PROXY_ENABLED` unset by default disables the one case the route exists for — a local endpoint during development — while the allow-list already leaves a public deployment inert for everything else). Forward `Authorization` as received (rejected: it is a header a deployment may already use). Treat the two documents as equal and reconcile case by case (rejected: it makes every future conflict a fresh argument, and the wrong outcome on a credential question is not recoverable).

## ADR-23: GitHub is spoken over `fetch`, not Octokit

- **Status**: accepted
- **Context**: The plan and the P7 backlog both named Octokit. By the time P7 was built the AI layer had been through the same question and answered it the other way (ADR-12), and the shape of what P7 actually needs was clear: `/user`, repository and branch listing, one create, the Git tree read, and the four Git Data calls a commit is made of.
- **Decision**: `apps/web/src/lib/github/client.ts` is a `fetch` wrapper — one request function, hand-written status mapping, narrow response types for the fields used. No `@octokit/*` dependency.
- **Consequences**: Nothing is added to a bundle the user downloads for a feature many users will not use. Errors are constructed here, so there is no path by which a request's headers reach a message, a `toString()` or a stack — the failure mode that puts a token in a toast, and the reason this was not a close call. Pagination, retries and throttling are ours to write; only the pagination is needed, and it is a `Link` header. GitHub's own types are not available, so response shapes are declared where they are used and are only as correct as the docs they were read from.
- **Alternatives**: `octokit` (rejected: hundreds of kilobytes for a dozen endpoints, and a dependency between a token and a log line that we would have to trust rather than read). `@octokit/core` with plugins (rejected: the same trade-off, smaller).
