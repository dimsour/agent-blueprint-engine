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
- Public API of a package is its `src/index.ts`. The web app imports package roots only, never `src/` internals (lint-enforced).
- Prefer small pure functions over classes; pass `VirtualFs` for IO; keep Node-only APIs out of `core` (fixtures and scripts may use `node:fs`).

## 7. Status

Phases P0, P1 and P2 are complete. P3 (the web IDE) is under way.

- `@agent-blueprint/core`: model, project format, validation (structural, semantic, orphans, contradictions, requirements), dependency graph, evaluation and health, change-sets, migrations.
- `@agent-blueprint/exporters`: the compiler. Claude Code and Codex map every concept; Copilot, OpenCode and Pi emit the portable artifacts and report what they cannot represent.
- `@agent-blueprint/templates`: 29 artifact templates that produce reviewable change-sets, and 10 starter blueprints stored as real source projects.
- `apps/web`: the IDE shell, local-first storage (IndexedDB, ZIP, File System Access), the workspace store with undo/redo, the dashboard and the workspace with a project tree, inspector and health bar. Entity forms, the Markdown editor, the command palette and the wizard are still to come.
- `@agent-blueprint/ai` has not been started (P6).

See `docs/09-roadmap.md` for what comes next.
