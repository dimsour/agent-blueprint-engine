# Web App

This document specifies `apps/web`: routes, layout, state model, persistence, the creation wizard, the ChangeSet review experience, keyboard interaction and the design language. Today the app contains a single placeholder page (`apps/web/src/app/page.tsx`) that imports `@agent-blueprint/core`; everything else here is the specification for roadmap phases P3 (shell), P4 (graphs), P5 (trust surfaces), P6 (AI) and P7 (GitHub).

## Status

| Area                                                                            | Status                           |
| ------------------------------------------------------------------------------- | -------------------------------- |
| Next.js App Router, Tailwind v4 tokens, shadcn `components.json`, `cn()` helper | present                          |
| Placeholder dashboard page                                                      | present                          |
| Everything below                                                                | planned; phase noted per section |

## Routes

| Route                                                   | Phase                              | Purpose                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                     | P3                                 | Dashboard: Create Blueprint (primary CTA), Templates, Recent Projects, Import (ZIP, folder, JSON manifest), GitHub (open or clone)                                                                                                                              |
| `/new`                                                  | P3 (steps), P6 (AI draft)          | Creation wizard, 10 steps, editing one draft Blueprint in memory                                                                                                                                                                                                |
| `/p/[projectId]`                                        | P3                                 | Workspace. `?view=` selects the centre panel: `overview`, `agents`, `skills`, `workflows`, `laws`, `rules`, `hooks`, `gates`, `tools`, `references`, `memory`, `requirements`, `scenarios`, `compatibility`, `evaluation`, `export`; `&id=` selects an artifact |
| `/settings`                                             | P3 (storage), P6 (AI), P7 (GitHub) | AI endpoint and key, GitHub token, storage preferences                                                                                                                                                                                                          |
| `/api/ai/proxy`                                         | P6, optional                       | Streams to the configured OpenAI-compatible base URL for endpoints without CORS                                                                                                                                                                                 |
| `/api/github/oauth/start`, `/api/github/oauth/callback` | P7, optional                       | OAuth code exchange when `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are set                                                                                                                                                                                      |

`projectId` is the browser-side project handle (IndexedDB key or a File System Access handle id), never the Blueprint slug, so two projects with the same slug can coexist locally.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ◧ Agent Blueprint   dotnet-testing-expert ▾      Save   Validate   Export ▾  GitHub  AI │
├──────────────┬───────────────────────────────────────────────┬───────────────────┤
│ PROJECT      │  [ Visual ]  [ Markdown ]  [ Preview ]        │ INSPECTOR         │
│              │                                               │                   │
│ Overview     │                                               │ Testing Expert    │
│ Agents    1  │        Canvas                                 │ role: worker      │
│ Skills    3  │        · overview graph (derived)             │ skills (3)        │
│ Workflows 2  │        · workflow node editor                 │ workflows (2)     │
│ Iron Laws 3  │        · CodeMirror Markdown editor           │ iron laws (3)     │
│ Rules     1  │        · rendered preview                     │ permissions       │
│ Hooks     1  │                                               │                   │
│ Gates     1  │                                               │ Used by           │
│ Tools     2  │                                               │  write-tests      │
│ References 1 │                                               │  review-tests     │
│ Memory    1  │                                               │                   │
│ Requirements │                                               │ ⚠ 1 warning       │
│ Scenarios    │                                               │                   │
├──────────────┴───────────────────────────────────────────────┴───────────────────┤
│ Health 92   ✓ 19 artifacts   ⚠ 2 warnings   Claude Code ✓   Codex ~ adapted       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar**: logo, project name (switcher), Save, Validate, Export menu, GitHub, AI toggle.
- **Left tree**: one entry per entity kind, in the order of `ENTITY_KINDS` in `packages/core/src/model/kinds.ts`, with counts. Overview first.
- **Centre canvas**: three tabs. `Visual` is the form editor or graph; `Markdown` is a CodeMirror 6 editor showing the exact file the project would write; `Preview` renders the Markdown.
- **Right inspector**: the selected artifact's summary, its outgoing references ("Depends on"), its dependents ("Used by", both from `buildDependencyGraph`), and its diagnostics. Every entry selects the artifact it names, so the panel is also the fastest way to walk the graph. With nothing selected it lists the Blueprint's findings instead.
  - Quick actions: **Rename…** (through `renameEntity`, and the dialog says how many artifacts will be updated), **Duplicate** (a copy under a free slug, references not carried over), **New from template** (a `ChangeSet` from `@agent-blueprint/templates/artifacts`, shown before it is applied), **Delete** (the impact dialog lists the dependents that would lose the reference, and warns when the target is the primary agent).
  - The visual form's Id field commits a rename inline; the inspector's ellipsis action opens the dialog. Both call the same store action.
- **Bottom health bar**: overall score, artifact count, error/warning counts, per-target compatibility status. Clicking any item navigates to the finding's `ref`.

Panels are resizable; the left and right panels collapse. Widths persist in `localStorage` under a UI namespace (never alongside credentials; see `docs/08-security.md`).

## State model (P3)

One Zustand store per open project:

```ts
interface WorkspaceState {
  blueprint: Blueprint // from @agent-blueprint/core, always normalized
  selection: EntityRef | null
  diagnostics: Diagnostic[] // recomputed by validateBlueprint after every change
  dirty: boolean // differs from the last written project
  // actions
  upsert(kind, input) // → core.upsertEntity
  rename(kind, oldId, newId) // → core.renameEntity
  remove(ref) // → core.deleteEntity, after the impact dialog
  applyChangeSet(cs, accept) // → core.applyChangeSet
  setHeader(partial) // → update-blueprint op through applyChangeSet
}
```

Rules:

- The store holds no domain logic. Every action calls a `core` function and replaces `blueprint` with the returned value.
- `zundo` wraps the store for undo/redo (`⌘Z` / `⇧⌘Z`); history is keyed on `blueprint` only.
- `diagnostics` are derived (`validateBlueprint(blueprint)`) and cached per Blueprint identity.
- The `Markdown` tab content is `renderProjectFiles(blueprint)[entityMainPath(sourceDir, kind, id)]`. On edit, the text is parsed with `decodeFrontmatter`, merged with `{ id, body }`, validated with `entitySchemaFor(kind)`, and committed through `upsert`. Parse errors are shown inline and never commit. This guarantees the two views cannot diverge.
- Workflow graphs edit `nodes`, `edges`, `entryNodeId` directly through `upsert('workflow', …)`; node positions are part of the workflow and are saved. The overview graph stores no positions; it is auto-laid-out with `elkjs` every render.

## Persistence tiers (P3)

```ts
interface ProjectStore {
  id: string
  kind: 'indexeddb' | 'filesystem' | 'zip'
  fs(): VirtualFs // backend for readProject / writeProject
  label: string
}
```

| Tier    | Backend                           | Behaviour                                                                                                  |
| ------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Draft   | IndexedDB (`idb`)                 | Autosave the normalized Blueprint JSON every few seconds while dirty; restored on reopen; survives reloads |
| Project | IndexedDB `VirtualFs`             | Explicit Save runs `writeProject`; Recent Projects lists these                                             |
| Folder  | File System Access API (Chromium) | Open a real directory; Save writes straight to disk; the folder can be a Git checkout                      |
| Archive | ZIP (`jszip`)                     | Import reads only `<sourceDir>/`; Export writes source plus compiled output for enabled targets            |

The draft is a convenience; the project written through `writeProject` is the source of truth. Import never trusts the draft over the files.

## Wizard (`/new`, P3 for steps, P6 for AI draft)

| Step | Prompt                  | Creates or edits                                                                       |
| ---- | ----------------------- | -------------------------------------------------------------------------------------- |
| 1    | What are you building?  | Blueprint `name`, `id` (slugified, editable), `description`                            |
| 2    | Who is the agent?       | one `Agent`: name, role, expertise, responsibilities; set as `settings.primaryAgentId` |
| 3    | What should it know?    | `Skill`s from templates or blank; links `agent.skillIds`                               |
| 4    | How should it work?     | `Workflow`s from templates; links `agent.workflowIds`                                  |
| 5    | What must never happen? | `IronLaw`s from category templates; links `agent.ironLawIds`                           |
| 6    | What tools can it use?  | `Tool`s and `agent.permissions`                                                        |
| 7    | How should it remember? | `MemoryDefinition` with scope and categories; links `agent.memoryIds`                  |
| 8    | Where should it run?    | `targets[]` with a harness compatibility preview                                       |
| 9    | Evaluate                | runs `validateBlueprint` and the evaluation report on the draft                        |
| 10   | Finish                  | shows the overview graph; Create writes the project                                    |

Step 1 offers _Generate first draft with AI_ when an endpoint is configured. The draft is a ChangeSet reviewed in step 10 before the project is created.

## ChangeSet review (P6, component in P3 for templates)

Every ChangeSet, whether from AI, a template or Compound, goes through the same panel.

- Header: source, summary, op counts (`+ create`, `~ update`, `- delete`, `⚙ blueprint`).
- One row per op. Create shows the rendered artifact; update shows a per-field diff (`diff` package, word-level for prose fields, line-level for bodies); delete shows the impact from `impactOf`.
- Actions: **Accept all**, per-op accept / reject toggles, **Edit** (opens the `after` state in the normal editor before applying), **Regenerate** (re-runs the operation with the user's note), **Apply** (calls `applyChangeSet` with the accepted op ids).
- Rejected ops are listed after Apply with the reason from `ApplyChangeSetResult.rejected`.
- `⌘⏎` applies.

## Command palette (`⌘K`, P3)

Actions, grouped:

| Group    | Actions                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create   | Blueprint, Agent, Skill, Workflow, Iron Law, Rule, Hook, Gate, Tool, Reference, Memory, Requirement, Scenario                                                                                                                                            |
| AI (P6)  | Generate with AI, Improve, Rewrite, Make more specific, Add examples, Add edge cases, Add verification, Create workflow, Create Iron Laws, Find contradictions, Find missing components, Evaluate Blueprint, Compound knowledge, Make portable, Simplify |
| Verify   | Validate, Show health, Show compatibility                                                                                                                                                                                                                |
| Deliver  | Export ZIP, Browse generated files, Push to GitHub (P7), Switch harness                                                                                                                                                                                  |
| Navigate | every artifact by name, every view                                                                                                                                                                                                                       |

AI actions are context-aware: with an artifact selected they target it; with the overview open they target the whole Blueprint.

## Keyboard shortcuts

| Keys         | Action                |
| ------------ | --------------------- |
| `⌘K`         | Command palette       |
| `⌘S`         | Save                  |
| `⌘E`         | Export                |
| `⌘/`         | Toggle AI assistant   |
| `⌘P`         | Preview tab           |
| `⌘⏎`         | Apply AI changes      |
| `⌘Z` / `⇧⌘Z` | Undo / redo           |
| `Esc`        | Close panel or dialog |

`Ctrl` replaces `⌘` on Windows and Linux.

## Views (P4, P5)

- **Overview graph** (P4): derived from `collectRefs`; nodes coloured by kind; clicking selects; no positions stored.
- **Workflow editor** (P4): `@xyflow/react`; node palette for all `WORKFLOW_NODE_TYPES`; edge kind picker for all `WORKFLOW_EDGE_KINDS`; inline badges for `BP-WF-*` diagnostics; delete shows `impactOf`.
- **Diagnostics panel** (P5): grouped by severity, filter by code, click navigates to `ref`.
- **Evaluation view** (P5): per-dimension score with its findings; overall score.
- **Compatibility view** (P5): concept × harness matrix from adapter `capabilities`, each cell expandable to its explanation.
- **Export view** (P5): per-target file tree, file preview, download Markdown, download ZIP.

## Design language

Register: Linear, Vercel, Raycast, a modern IDE. Dense, quiet, monochrome with one accent. No gradients, no illustrations, no robot imagery, no oversized cards.

Tokens are defined in `apps/web/src/app/globals.css` and exposed to Tailwind through `@theme inline`:

| Token                                | Light                           | Dark                   | Use                                                 |
| ------------------------------------ | ------------------------------- | ---------------------- | --------------------------------------------------- |
| `--background` / `--foreground`      | near-white / near-black (oklch) | inverted               | page                                                |
| `--muted` / `--muted-foreground`     | light grey / mid grey           | dark grey / light grey | secondary surfaces and text                         |
| `--border`                           | light grey                      | dark grey              | all borders (`* { border-color }` in `@layer base`) |
| `--accent` / `--accent-foreground`   | blue-violet                     | lighter blue-violet    | primary actions, selection                          |
| `--success`, `--warning`, `--danger` | green, amber, red               | same                   | diagnostics and health                              |
| `--radius`                           | 0.375rem                        |                        | `radius-sm/md/lg` derived                           |

Dark mode is the `.dark` class on `<html>` (`@custom-variant dark`). Fonts: system sans; monospace stack with JetBrains Mono / Cascadia Code / Consolas fallbacks for ids, paths and code.

Conventions:

- shadcn/ui, `new-york` style, `neutral` base colour, CSS variables on (`apps/web/components.json`). Components are added with `pnpm dlx shadcn@latest add <name>` into `src/components/ui/`.
- Icons from `lucide-react`; 16px in dense UI, 20px in headers.
- Class merging with `cn()` from `src/lib/utils.ts` (`clsx` + `tailwind-merge`).
- Feature components live in `src/components/<area>/` (`blueprint`, `graph`, `editor`, `ai`, `evaluation`, `export`, `github`); hooks in `src/hooks/`; browser adapters (stores, fs backends, GitHub client) in `src/lib/`.
- Server components by default; `'use client'` only where state or browser APIs are needed (the whole workspace is a client tree).
- Severity colours are used only for diagnostics and health, never decoratively.
