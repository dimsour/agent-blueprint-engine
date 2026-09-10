# Agent Blueprint — instructions for AI coding agents

Agent Blueprint is a visual IDE for designing, validating and compiling AI agent systems:
"Design once. Test it. Compile it everywhere." This file is the entry point for any agent
(or human) working in this repository. Read it fully before changing anything.

## 1. Read these first

| Document                           | What it settles                                                       |
| ---------------------------------- | --------------------------------------------------------------------- |
| `docs/00-vision.md`                | Product philosophy and the concept glossary. Use these words exactly. |
| `docs/01-architecture.md`          | Monorepo layout, package boundaries, data flow.                       |
| `docs/02-domain-model.md`          | The canonical Blueprint model, field by field.                        |
| `docs/03-project-format.md`        | The on-disk source-of-truth format (`blueprint/`).                    |
| `docs/04-compiler.md`              | Harness adapters and the compile pipeline.                            |
| `docs/05-validation-evaluation.md` | Diagnostic codes, scoring, requirement checks.                        |
| `docs/06-ai-layer.md`              | OpenAI-compatible AI client, ChangeSet contract.                      |
| `docs/07-web-app.md`               | Routes, layout, state, persistence, shortcuts.                        |
| `docs/08-security.md`              | Credential handling. Non-negotiable.                                  |
| `docs/09-roadmap.md`               | The task backlog. Pick work from here.                                |
| `docs/10-decisions.md`             | ADRs. Do not re-litigate them; add a new ADR to change one.           |
| `docs/harness/*.md`                | Verified file conventions of each target harness, with sources.       |

## 2. Repository map

```
apps/web/            Next.js IDE (App Router, React 19, Tailwind v4, shadcn/ui)
packages/core/       @agent-blueprint/core      model, schemas, project format, validation, graph, migrations, change-sets
packages/exporters/  @agent-blueprint/exporters harness adapters (claude-code, codex, copilot, opencode, pi)
packages/ai/         @agent-blueprint/ai        OpenAI-compatible client, prompts, operations → ChangeSet
packages/templates/  @agent-blueprint/templates starter blueprints and artifact templates as ChangeSets
packages/fixtures/   @agent-blueprint/fixtures  canonical sample projects used by tests everywhere
tooling/             shared tsconfig and eslint configs
docs/                the specification set above
```

## 3. Hard rules

1. **Packages are framework-free.** Nothing under `packages/*` imports `react`, `next`, or the web app. ESLint enforces it (`tooling/eslint-config/library.js`); do not disable the rule.
2. **The Blueprint model is harness-independent.** No Claude-, Codex- or Copilot-specific concept goes into `packages/core`. Harness specifics live in `packages/exporters/<harness>/` and `docs/harness/`.
3. **Generation is deterministic.** No timestamps, random ids, or unstable ordering in anything written to disk or exported. Same input → identical bytes. Tests assert this; keep them green.
4. **Ids are slugs and renames are refactors.** Never change an entity `id` except through `renameEntity`. Never build a second relationship table; add reference sites to `packages/core/src/model/refs.ts`.
5. **Credentials never touch Blueprint data.** No API keys or tokens in the model, in `blueprint/`, in exports, in logs, or in fixtures. See `docs/08-security.md`.
6. **AI never modifies a Blueprint silently.** Every AI or template output is a `ChangeSet` that the user reviews and applies.
7. **One definition per shape.** Types are inferred from the Zod schemas in `packages/core/src/schema`. Do not hand-write parallel interfaces.
8. **Do not widen scope.** Implement the task you picked; note follow-ups in the roadmap instead of doing them.

## 4. Commands

```bash
pnpm install                 # Node 22, pnpm 10 (see .nvmrc / package.json#packageManager)
pnpm check                   # lint + typecheck + test for every package (what CI runs, minus build)
pnpm lint | typecheck | test | build
pnpm --filter @agent-blueprint/core test          # one package
pnpm --filter @agent-blueprint/core fixtures:canonicalize   # rewrite fixtures in canonical form after editing them by hand
pnpm --filter @agent-blueprint/templates starters:seed       # regenerate the starter blueprints from the templates
pnpm dev                     # Next.js dev server for apps/web
pnpm --filter web test:e2e   # Playwright (run `pnpm --filter web exec playwright install chromium` once)
pnpm format                  # prettier
```

## 5. How to pick up a task

1. Open `docs/09-roadmap.md`, choose the lowest-numbered task in the earliest phase whose dependencies are done.
2. Read the docs the task points at and the code it touches. Run `pnpm check` before you start so you know the baseline is green.
3. Work on a branch named `<phase>-<task-id>-<slug>` (for example `p1-03-contradiction-heuristics`).
4. Definition of done, all of it:
   - acceptance criteria of the task met and covered by tests (positive and negative cases)
   - `pnpm check` green; `pnpm build` green when `apps/web` is touched
   - determinism and round-trip tests still pass; fixtures re-canonicalized if their format changed
   - docs updated in the same change (the relevant `docs/*.md`, the diagnostic code catalogue, an ADR when a decision changed)
   - no new dependency without a one-line justification in the PR description
5. Commit messages: imperative subject, body explains why. Reference the task id.

## 6. Conventions

- TypeScript strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`; ESM only; `import { type X }` inline type imports; extensionless relative imports inside packages (bundler resolution; Turbopack cannot map `.js` to `.ts`).
- Prettier: no semicolons, single quotes, width 100. Run `pnpm format`.
- Tests: Vitest, colocated in `tests/` per package, fixtures from `@agent-blueprint/fixtures`. Golden-file tests for anything that generates files.
- Diagnostics have stable codes (`BP-<AREA>-<NNN>`) documented in `docs/05-validation-evaluation.md`. Never reuse a code for a different meaning.
- Public API of a package is what its `package.json` `exports` names. The web app imports those entry points only, never `src/` internals (lint-enforced). `@agent-blueprint/templates` has a second entry, `/artifacts`, for the browser-safe artifact templates; the root reads starter blueprints with `node:fs`.
- Prefer small pure functions over classes; pass `VirtualFs` for IO; keep Node-only APIs out of `core` (fixtures and scripts may use `node:fs`).

## 7. Status

Phases P0 to P7 are complete: the model, the compiler, the templates, the web IDE, the graphs, the trust surfaces, the AI layer and GitHub. P6-09 checked the AI layer against four endpoint implementations and found seven bugs, all fixed (docs/06). P8 (hardening) is in progress: P8-01 to P8-03 gave Copilot, OpenCode and Pi full adapters, so all five harnesses map what they can and report what they cannot; binary assets, migrations, accessibility and performance are still to do.

- `@agent-blueprint/core`: model, project format, validation (structural, semantic, orphans, contradictions, requirements), dependency graph, evaluation and health, change-sets, migrations.
- `@agent-blueprint/exporters`: the compiler. All five harnesses have a full adapter: each maps every concept its harness can express and reports the rest as a compatibility issue naming what was lost and where the intent was written instead.
- `@agent-blueprint/templates`: 29 artifact templates that produce reviewable change-sets, and 10 starter blueprints stored as real source projects.
- `apps/web` also carries the AI surfaces: Settings holds the endpoint and the key (session by default, browser storage with the warning shown first, read by one module), `/api/ai/proxy` relays to allow-listed hosts only, every ChangeSet goes through one per-field review that can be edited before it is applied, the assistant (⌘/) offers the operations the current selection suits and explains the rest, the wizard can draft a first Blueprint, and the evaluation view can ask a model for a second opinion that is badged and does not move the score.
- `apps/web`: the IDE shell, local-first storage (IndexedDB, ZIP, File System Access), the workspace store with undo/redo, the dashboard, and the workspace with a project tree, inspector and health bar. Every artifact kind has a visual form and a source tab that shows the project file itself, with a Markdown preview. The inspector explains the selected artifact’s place in the dependency graph and offers rename, duplicate, delete-with-impact and new-from-template. A command palette (⌘K / Ctrl+K) creates artifacts, navigates to them, validates, saves, undoes, toggles compile targets and opens the push dialog, listing anything not built yet as disabled with the reason. A ten-step wizard at `/new` builds a first Blueprint from templates, scores it, and writes the project. Projects export as a deterministic ZIP of the source and import back from a ZIP, a folder or a manifest, with the diagnostics shown before anything is stored. `?view=` and `&id=` make an artifact linkable. The Blueprint has a derived overview graph, and a workflow is edited as the drawing it is, with positions written by a deterministic tidy. The health bar opens the findings behind each count, and the evaluation, compatibility and export views make the product’s claims checkable: the export view shows the compiled output before it is written and refuses to download while an error stands. Writing back to a folder on disk is the one storage tier still to build (P3-13).
- `apps/web` also carries GitHub: a token proved against the API before it is stored and kept where the AI key is kept, optional sign-in through a deployment-registered OAuth app, and a push that shows what it would do first — every path added, changed or removed, the compiler errors that block it, the files it does not own and will not overwrite unasked, and anything shaped like a credential, which blocks until it is accepted. The push is one tree, one commit and one move of the branch, never forced. A repository's `blueprint/` can also be opened as a local project through the same import preview a ZIP goes through.
- `@agent-blueprint/ai`: the OpenAI-compatible client (eight presets, probe, streaming, bounded retries, redacted errors), structured output over both the JSON-schema and prompt paths with one repair round trip, a versioned prompt catalogue carrying the concept glossary, a budgeted context builder, and ten operations that turn model output into reviewable ChangeSets or diagnostics — every one of them going through one assembler that validates, renames, resolves references and notes whatever it had to drop. `tests/live.test.ts` is the contract test against a real endpoint, excluded from `pnpm test`; run against local and hosted endpoints, with results and the bugs it found in docs/06.

See `docs/09-roadmap.md` for what comes next.
