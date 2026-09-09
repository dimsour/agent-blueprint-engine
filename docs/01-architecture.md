# Architecture

This document describes how the repository is organised, which package may depend on which, how code flows between the UI, the domain model and the file system, and what tooling is installed. It is the map an agent needs before opening a file; the detailed specifications for each area live in the numbered documents next to this one.

## Monorepo layout

```
ai-blueprint-engine/
├── apps/
│   └── web/                        Next.js App Router, React, Tailwind v4, shadcn/ui
├── packages/
│   ├── core/                       @agent-blueprint/core      model, Zod schemas, project format,
│   │                                                          validation, dependency graph, migrations, change-sets
│   ├── exporters/                  @agent-blueprint/exporters HarnessAdapter interface, shared emitters, adapters
│   ├── ai/                         @agent-blueprint/ai        OpenAI-compatible client, prompts, operations → ChangeSet
│   ├── templates/                  @agent-blueprint/templates starter blueprints + per-artifact templates (ChangeSets)
│   └── fixtures/                   @agent-blueprint/fixtures  sample projects used by tests (canonicalize script lives in core/scripts)
├── tooling/
│   ├── tsconfig/                   @agent-blueprint/tsconfig  base.json, library.json, nextjs.json
│   └── eslint-config/              @agent-blueprint/eslint-config  library.js, next.js
├── docs/                           this specification set
├── .github/workflows/ci.yml        install → format:check → lint → typecheck → test → build
├── AGENTS.md / CLAUDE.md           conventions for agents working on this repo
├── package.json                    scripts, packageManager pnpm@10.34.5, engines node >=22
├── pnpm-workspace.yaml             apps/*, packages/*, tooling/*
└── turbo.json                      task graph: build, dev, lint, typecheck, test
```

Status: `core`, `fixtures`, `exporters` and `templates` are implemented (roadmap P0 to P2). `ai` still contains a placeholder entry point and a smoke test (P6). `apps/web` is the IDE (P3).

`@agent-blueprint/templates` has two entry points. The root reads the starter blueprints from disk with `node:fs` and therefore requires Node; `@agent-blueprint/templates/artifacts` holds the per-artifact templates, which are pure data and safe to import in a browser. The IDE's "new from template" imports the second one, so the starter files never reach the client bundle.

## Dependency rules

```
apps/web ──► core, exporters, ai, templates
exporters ──► core
ai ──► core
templates ──► core
fixtures ──► (nothing; node:fs only)
core (dev) ──► fixtures, for tests and scripts/canonicalize-fixtures.ts
core ──► zod, yaml only
```

| Rule                                                                                        | Enforced by                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/*` never import `react`, `react-dom`, `next` or `apps/**`                         | `tooling/eslint-config/library.js`: `no-restricted-imports` with `paths` for the three modules and `patterns` for `react/*`, `react-dom/*`, `next/*`, `@/*`, `**/apps/**` |
| `apps/web` imports packages only through their root entry, never `@agent-blueprint/*/src/*` | `tooling/eslint-config/next.js`: `no-restricted-imports` pattern                                                                                                          |
| `exporters` and `ai` depend on `core` only                                                  | `dependencies` in their `package.json`; no other workspace package is declared                                                                                            |
| No DOM types in packages                                                                    | `tooling/tsconfig/library.json` sets `lib: ["ES2023"]` and `types: ["node"]`; only `nextjs.json` adds `DOM`                                                               |

`core` also avoids Node-only APIs: file access goes through `VirtualFs` (below), hashing uses Web Crypto (`crypto.subtle` in `packages/core/src/project/serialize.ts`), and `structuredClone` is used for deep copies. The one exception is `packages/fixtures`, which reads its projects from disk with `node:fs` because it is test infrastructure.

## How packages are consumed

Workspace packages are consumed as **TypeScript source**. Each `package.json` exports:

```json
"exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }
```

- Vitest resolves TypeScript natively, so tests import `../src/index.js` or `@agent-blueprint/fixtures` without a build.
- Next.js compiles the packages itself via `transpilePackages` in `apps/web/next.config.ts`.
- `typecheck` is `tsc -p tsconfig.json` with `noEmit: true` (from `tooling/tsconfig/base.json`); there is no `dist/`.
- A published or CLI build (roadmap, deferred) would add a `tsc` emit and a `publishConfig.exports` pointing at `dist/`. See ADR-16 in `docs/10-decisions.md`.

All packages are ESM (`"type": "module"`) with `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `strict` enabled. Relative imports inside a package are extensionless (`import ... from './ids'`): `moduleResolution: Bundler` allows it and Turbopack cannot map a `.js` specifier to a `.ts` source when it compiles `transpilePackages`.

## Data flow

### Authoring (roadmap P3; store and UI not yet implemented)

```
┌────────────┐   actions / ChangeSets   ┌──────────────────┐   pure functions   ┌──────────────────┐
│  React UI  │ ───────────────────────► │  Zustand store   │ ────────────────► │ @agent-blueprint │
│ (apps/web) │ ◄─────────────────────── │ {blueprint,      │ ◄──────────────── │      /core       │
└────────────┘   selectors              │  selection,      │   new Blueprint   └──────────────────┘
                                        │  diagnostics,    │
                                        │  dirty} + zundo  │
                                        └────────┬─────────┘
                                                 │ Save / autosave
                                                 ▼
                                        ┌──────────────────┐
                                        │  ProjectStore    │  IndexedDB · File System Access · ZIP
                                        │  (VirtualFs)     │
                                        └──────────────────┘
```

The store never contains logic of its own. Every mutation is either a `core` function (`upsertEntity`, `renameEntity`, `deleteEntity`, `applyChangeSet`) or a reducer that calls one. The Markdown editor tab displays `renderProjectFiles(blueprint)[path]`, and edits are parsed back with `decodeFrontmatter` and the entity schema, so Visual and Markdown views cannot drift.

### Save and load (implemented)

```
Blueprint ──normalizeBlueprint──► renderProjectFiles ──► { path: content } ──writeProject──► VirtualFs
VirtualFs ──readProject──► migrate raw manifest/entities ──► entity schemas ──► normalizeBlueprint ──► Blueprint + Diagnostic[]
```

Key functions, all in `packages/core/src/project/`:

| Function                                                                                                                      | File                | Role                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `renderProjectFiles(bp)`                                                                                                      | `write.ts`          | Pure: Blueprint → sorted map of file contents                                            |
| `writeProject(bp, fs)`                                                                                                        | `write.ts`          | Writes changed files only; prunes stale artifact files inside known directories          |
| `readProject(fs, { sourceDir })`                                                                                              | `read.ts`           | Tolerant reader; per-artifact error diagnostics; unknown keys preserved under `metadata` |
| `encodeFrontmatter` / `decodeFrontmatter`, `canonicalJson` (sorted keys), `stableJson` (schema order), `toYaml`, `pruneEmpty` | `serialize.ts`      | Deterministic encodings                                                                  |
| `stripDefaults(value, schema)`                                                                                                | `strip-defaults.ts` | Removes values equal to their Zod default before writing; the reader restores them       |
| `entityMainPath`, `parseEntityPath`, `workflowGraphPath`, `skillResourcePath`                                                 | `layout.ts`         | Path conventions and their inverse                                                       |

### Compile (roadmap P2; interface designed, see `docs/04-compiler.md`)

```
Blueprint
  └─ normalizeBlueprint
       └─ validateBlueprint (core rules)
            └─ for each enabled TargetConfig:
                 adapter.validate(bp, options)      → Diagnostic[]
                 adapter.compile(bp, options)       → { files: GeneratedFile[], issues: CompatibilityIssue[] }
                      └─ mergeFileSets (shared emitters own shared paths such as AGENTS.md)
                           └─ build-manifest.json (path → sha256, per target; types in core/project/build-manifest.ts)
                                └─ writer over VirtualFs (ZIP, local folder, GitHub tree)
```

### AI (roadmap P6; contract designed, see `docs/06-ai-layer.md`)

```
UI context (selection + blueprint summary)
  └─ AIClient.structured(schema, messages)   OpenAI-compatible /chat/completions via fetch
       └─ ChangeSet (core/changeset/types.ts)
            └─ review UI: accept all / per op / reject / edit / regenerate
                 └─ applyChangeSet(bp, cs, { accept })   → new Blueprint, normalized
```

`applyChangeSet` is the only path by which AI output reaches the Blueprint. It validates each op through the entity schema, applies accepted ops in order, reports rejected ops with reasons, and normalizes the result.

## VirtualFs

```ts
interface VirtualFs {
  read(path): Promise<string | undefined>
  write(path, content): Promise<void>
  delete(path): Promise<void>
  exists(path): Promise<boolean>
  list(prefix?): Promise<string[]> // sorted
}
```

Paths are POSIX-style and relative; `normalizePath` rejects `..`. Content is UTF-8 text (binary skill assets are a known gap; see the roadmap).

| Backend                            | Status                                     | Used for                                             |
| ---------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `MemoryFs`                         | implemented (`core/project/virtual-fs.ts`) | tests, in-memory editing, diffing before save        |
| ZIP (`jszip`)                      | planned (P3)                               | import / export                                      |
| IndexedDB (`idb`)                  | planned (P3)                               | browser persistence of projects and drafts           |
| File System Access API             | planned (P3)                               | opening a real folder in Chromium; writes go to disk |
| GitHub tree (Octokit Git Data API) | planned (P7)                               | preview and atomic push                              |
| Node `fs`                          | planned (CLI, deferred)                    | `blueprint validate                                  | build | export` |

Because every backend implements the same five methods, `readProject` and `writeProject` are backend-agnostic and tested once against `MemoryFs`.

## Toolchain

Versions are pinned in `package.json` files and locked in `pnpm-lock.yaml`.

| Tool            | Version                    | Note                                                                                    |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| Node            | 22 (`.nvmrc`)              | `crypto.subtle`, `structuredClone` available                                            |
| pnpm            | 10.34.5 (`packageManager`) | `.npmrc`: `auto-install-peers=true`, `strict-peer-dependencies=false`                   |
| Turborepo       | 2.10.12                    | task graph in `turbo.json`; `^lint`, `^typecheck`, `^test` dependencies                 |
| TypeScript      | 5.9.3                      | pinned; TypeScript 7 exists but typescript-eslint, Next and Vitest tooling target 5.x   |
| ESLint          | 10.10.0                    | flat config; `typescript-eslint` 8.70 type-checked presets; `eslint-config-next` 16.3.4 |
| Prettier        | 3.9.6                      | `.prettierrc`: no semicolons, single quotes, width 100, LF                              |
| Vitest          | 5.0.0                      | per-package `vitest.config.ts`, node environment                                        |
| Zod             | 4.5.4                      | `.prefault()` for nested defaults, `z.partialRecord` for permission maps                |
| yaml            | 2.9.0                      | manifest, frontmatter, YAML artifacts                                                   |
| Next.js / React | 16.3.4 / 19.2.8            | App Router, `transpilePackages`                                                         |
| Tailwind        | 4.3.3                      | `@tailwindcss/postcss`; tokens in `apps/web/src/app/globals.css`                        |
| tsx             | 4.23.13                    | runs `packages/core/scripts/canonicalize-fixtures.ts`                                   |

Planned UI dependencies (not installed yet): `@xyflow/react` 12, `@codemirror/*` 6, `zustand` 5 + `zundo`, `cmdk`, `jszip`, `idb`, `elkjs`, `diff`, `octokit`.

## Scripts

| Command                                                     | What it runs                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                 | `turbo run lint` → `eslint .` in every package and app                                                         |
| `pnpm typecheck`                                            | `turbo run typecheck` → `tsc -p tsconfig.json` (noEmit)                                                        |
| `pnpm test`                                                 | `turbo run test` → `vitest run`                                                                                |
| `pnpm build`                                                | `turbo run build` → only `apps/web` has a build (`next build`)                                                 |
| `pnpm check`                                                | lint, typecheck, test in sequence                                                                              |
| `pnpm format` / `pnpm format:check`                         | Prettier over the repo (fixture project files are ignored via `.prettierignore` so their bytes stay canonical) |
| `pnpm --filter @agent-blueprint/core test`                  | one package                                                                                                    |
| `pnpm --filter @agent-blueprint/core fixtures:canonicalize` | rewrite fixture projects in canonical form after hand edits                                                    |
| `pnpm dev`                                                  | `next dev` for `apps/web`                                                                                      |

CI (`.github/workflows/ci.yml`) runs the same commands on Ubuntu with `pnpm install --frozen-lockfile`.

## Adding a package

1. Copy the shape of `packages/templates`: `package.json` (ESM, `exports` → `src/index.ts`, scripts `lint`/`typecheck`/`test`), `tsconfig.json` extending `@agent-blueprint/tsconfig/library.json`, `eslint.config.js` re-exporting `@agent-blueprint/eslint-config/library`, `vitest.config.ts`.
2. Declare workspace dependencies as `workspace:*`.
3. Add `transpilePackages` entry in `apps/web/next.config.ts` if the web app consumes it.
4. Run `pnpm install`, then `pnpm check`.
