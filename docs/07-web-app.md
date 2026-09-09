# Web App

This document specifies `apps/web`: routes, layout, state model, persistence, the creation wizard, the ChangeSet review experience, keyboard interaction and the design language. Phases P3, P4 and P5 are built: the dashboard, the workspace, the editors, the inspector, the command palette, the wizard, ZIP import and export, the overview graph and the workflow editor, and the trust surfaces (health bar, diagnostics, evaluation, compatibility, export). What is described here for P6 (AI) and P7 (GitHub) is still specification; each such section says which phase owns it.

## Status

| Area                                                                            | Status                           |
| ------------------------------------------------------------------------------- | -------------------------------- |
| Next.js App Router, Tailwind v4 tokens, shadcn `components.json`, `cn()` helper | present                          |
| Dashboard, workspace, editors, inspector, palette, wizard, import and export    | present (P3)                     |
| Overview graph, workflow editor, delete-impact dialog                           | present (P4)                     |
| Health bar, diagnostics, evaluation, compatibility and export views             | present (P5)                     |
| AI and GitHub                                                                   | planned; phase noted per section |

## Routes

| Route                                                   | Phase                              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                     | P3                                 | Dashboard: Create Blueprint (primary CTA), Templates, Recent Projects, Import (ZIP, folder, JSON manifest), GitHub (open or clone)                                                                                                                                                                                                                                                                                           |
| `/new`                                                  | P3 (steps), P6 (AI draft)          | Creation wizard, 10 steps, editing one draft Blueprint in memory                                                                                                                                                                                                                                                                                                                                                             |
| `/p/[projectId]`                                        | P3                                 | Workspace. `?view=` selects the centre panel: `overview`, or one entity kind spelled as its project directory (`agents`, `skills`, `laws`, …); `&id=` selects an artifact. `evaluation`, `compatibility` and `export` are the three reports about the whole Blueprint; the rest name one kind. The URL is replaced rather than pushed, so back leaves the workspace instead of walking every artifact clicked on the way in. |
| `/settings`                                             | P3 (storage), P6 (AI), P7 (GitHub) | What this browser is holding: stored projects, space used, and a way to remove them. The AI endpoint and the GitHub token are named there and disabled until those features exist.                                                                                                                                                                                                                                           |
| `/api/ai/proxy`                                         | P6, optional                       | Streams to the configured OpenAI-compatible base URL for endpoints without CORS                                                                                                                                                                                                                                                                                                                                              |
| `/api/github/oauth/start`, `/api/github/oauth/callback` | P7, optional                       | OAuth code exchange when `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are set                                                                                                                                                                                                                                                                                                                                                   |

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
- **Bottom health bar**: overall score, artifact count, error/warning/suggestion counts, per-target status. A count opens the findings behind it in a panel above the bar; a finding navigates to its `ref`, and to the step inside a workflow when it names one. The score opens the evaluation view and a target opens the compatibility view.

Panels are resizable; the left and right panels collapse. Widths persist in `localStorage` under a UI namespace (never alongside credentials; see `docs/08-security.md`).

## State model (P3)

One Zustand store per open project:

```ts
interface WorkspaceState {
  projectId?: string
  blueprint?: Blueprint // from @agent-blueprint/core, always normalized
  selection?: EntityRef
  view: 'overview' | EntityKind // the canvas section, mirrored to ?view=
  artifactTab: 'visual' | 'source' | 'preview'
  sourceError?: string // set while the project file does not parse
  diagnostics: Diagnostic[] // recomputed by validateBlueprint, debounced
  validating: boolean
  dirty: boolean // differs from the last written project
  saving: boolean
  saveError?: string
  // actions
  upsert(kind, input) // → core.upsertEntity
  add(kind, name) // → core.createEntity, leaving the selection alone
  create(kind, name) // add, then open it
  rename(kind, oldId, newId) // → core.renameEntity
  remove(ref) // → core.deleteEntity, after the impact dialog
  apply(changeSet, accept) // → core.applyChangeSet; returns the refused ops
  updateBlueprint(patch) // name, description, version, settings, targets
  afterHistory() // undo and redo replace the Blueprint behind the store's back
}
```

Rules:

- The store holds no domain logic. Every action calls a `core` function and replaces `blueprint` with the returned value.
- `zundo` wraps the store for undo/redo (`⌘Z` / `⇧⌘Z`); history is keyed on `blueprint` only, is cleared when a project is loaded or closed, and is followed by `afterHistory()`, because zundo writes the Blueprint without going through any action and everything derived from it would otherwise be stale.
- `diagnostics` are derived (`validateBlueprint(blueprint)`) and cached per Blueprint identity.
- Forms are controlled inputs writing straight through the store, not `react-hook-form`: the schema is already the validator, and a field the schema briefly rejects keeps what was typed while the Blueprint keeps its last valid value.
- The `Markdown` tab content is `renderProjectFiles(blueprint)[entityMainPath(sourceDir, kind, id)]`. On edit, the text is parsed with `decodeFrontmatter`, merged with `{ id, body }`, validated with `entitySchemaFor(kind)`, and committed through `upsert`. Parse errors are shown inline and never commit. This guarantees the two views cannot diverge.
- Workflow graphs edit `nodes`, `edges`, `entryNodeId` directly through `upsert('workflow', …)`; node positions are part of the workflow and are saved. The overview graph stores no positions; it is auto-laid-out with `elkjs` every render.

## Persistence tiers (P3)

```ts
interface ProjectStore {
  kind: 'indexeddb' | 'file-system'
  available: boolean // false when the browser cannot support it; the UI hides it
  list(): Promise<ProjectSummary[]>
  open(id): Promise<ProjectFiles | undefined>
  save(id, files, meta): Promise<ProjectSummary>
  delete(id): Promise<void>
  importFiles(files, meta): Promise<ProjectSummary>
}
```

A store moves `Record<path, content>` and never has to understand the model, which is what lets one code path serve IndexedDB and a real folder. ZIP is not a store: it has no list and no identity, so it is a pair of functions. `VirtualFs` stays inside `core`; the app hands file maps to `readProject` and takes them from `renderProjectFiles`.

| Tier    | Backend                           | Behaviour                                                                                                                               |
| ------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Draft   | IndexedDB (`idb`)                 | Work with no project behind it yet, such as the creation wizard. Written on a timer and offered again on the next visit                 |
| Project | IndexedDB                         | Autosaved through `renderProjectFiles` about a second after the last edit, and on Save. Leaving a project writes its pending edit first |
| Folder  | File System Access API (Chromium) | Open a real directory. Its contents are read into a project; writing back to the directory is not built yet, see the note below         |
| Archive | ZIP (`jszip`)                     | Export writes the source project and the compiled output together; import accepts a ZIP, a folder, or a lone manifest                   |

Autosave writes the project itself rather than a separate draft, so nothing is lost when a tab closes, and Save is a way to hurry that rather than the thing that makes an edit durable. Import never trusts anything but the files.

Opening a folder currently copies it into the browser and edits the copy: the store can pick a directory and read it, but nothing routes saves back to disk. Doing that needs `writeProject`'s pruning, because writing the current files without removing what a deleted artifact left behind would make deleted artifacts reappear on the next open. That is the remaining work, and it is not done.

### Import and export (P3-11)

Import is a two-step flow, because a Blueprint can arrive from a colleague, an archive or a git clone. `readUpload` turns the file into a file map (a ZIP, or a `.yaml`/`.yml`/`.json` manifest placed at `<sourceDir>/blueprint.yaml`), `previewImport` parses it with the same reader the workspace uses, and a dialog reports what was found and every diagnostic **before** anything is stored. Errors do not block opening: a project with problems is the project a person needs to open in order to fix it. A starter chosen on the dashboard skips the dialog, since it is the app's own file.

Export is the export view (P5-04), not a dialog: `⌘E` and the palette open it, it lists every file the compiler would write beside the source project, and Download packs both into `<blueprint id>.zip`. The files are rendered from the Blueprint in the store, so an unsaved edit is included, and the screen shows each one before the archive leaves the browser. Two files claiming one path abort the download rather than let the archive disagree with the screen.

The round trip is the contract: for every starter, export then import produces a Blueprint whose `diffBlueprints` against the original has no ops.

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
| 10   | Finish                  | summary of the draft; Create writes the project                                        |

The draft is a real Blueprint from the first keystroke: every step is a pure function in `lib/wizard/draft` that goes through the same schemas and the same `upsertEntity` as the workspace, so the wizard cannot produce something the editor would refuse. Artifacts added in steps 3 to 7 are linked to the primary agent as they are created.

Only steps 1 and 2 block: a Blueprint needs a name, and the system needs the agent it is built around. Everything after that is optional, so the wizard can be finished early and the rest added in the workspace. Step 8 records only the chosen harnesses as targets, which is how the starters read on disk; step 9 scores the draft with `evaluateBlueprint` and the exporters' portability provider; step 10 is a summary rather than the overview graph, which is a view of a stored project.

Step 1 will offer _Generate first draft with AI_ when an endpoint is configured (P6). That draft is a ChangeSet reviewed before the project is created.

## ChangeSet review (P6, component in P3 for templates)

Every ChangeSet, whether from AI, a template or Compound, goes through the same panel.

- Header: source, summary, op counts (`+ create`, `~ update`, `- delete`, `⚙ blueprint`).
- One row per op. Create shows the rendered artifact; update shows a per-field diff (`diff` package, word-level for prose fields, line-level for bodies); delete shows the impact from `impactOf`.
- Actions: **Accept all**, per-op accept / reject toggles, **Edit** (opens the `after` state in the normal editor before applying), **Regenerate** (re-runs the operation with the user's note), **Apply** (calls `applyChangeSet` with the accepted op ids).
- Rejected ops are listed after Apply with the reason from `ApplyChangeSetResult.rejected`.
- `⌘⏎` applies.

## Command palette (`⌘K`, P3)

Actions, grouped:

| Group         | Actions                                                                                                   | State |
| ------------- | --------------------------------------------------------------------------------------------------------- | ----- |
| Create        | one per entity kind; `createEntity` seeds a valid artifact, which is then selected with its form open     | done  |
| This artifact | Show the form, Show the project file, Show the preview (only for artifacts stored as Markdown)            | done  |
| Verify        | Validate (flushes the debounce and reports the counts), Show health, Show compatibility                   | done  |
| Blueprint     | Save, Undo, Redo                                                                                          | done  |
| Targets       | enable or disable each compile target                                                                     | done  |
| Deliver       | Export (opens the export view, where the files are browsed and the ZIP is built); Push to GitHub (P7)     | P7    |
| AI            | one disabled entry until an endpoint is configured; P6 replaces it with the fifteen operations in docs/06 | P6    |
| Go to         | every artifact, matched on name or id                                                                     | done  |

An action that is not built yet is listed and disabled with the reason, the same rule the top bar follows: the palette is the map of the product, so hiding an action would hide the capability.

AI actions will be context-aware: with an artifact selected they target it; with the overview open they target the whole Blueprint.

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

Either modifier fires the shortcut, so the same key works on any keyboard; menus print `⌘` on Apple hardware and `Ctrl+` elsewhere. While the focus is in a text field or the code editor only the palette and Save fire, because `⌘Z` there belongs to the field. `Esc` is handled by the dialogs themselves.

`⌘/` and `⌘⏎` are reserved: they stay unbound until the AI assistant (P6) and the ChangeSet review (P6) exist, so the key does whatever the browser would rather than nothing.

## Views

- **Overview graph** (P4): derived from `collectRefs`; nodes coloured by kind; clicking selects; no positions stored.
- **Workflow editor** (P4): `@xyflow/react`; node palette for all `WORKFLOW_NODE_TYPES`, draggable onto the canvas or clickable to place a step below what is drawn; positions are part of the workflow and are written to the project file, so a drag is an edit like any other and `Tidy` re-lays the graph deterministically. Connections are drawn by dragging between two steps, which always makes a `sequential` edge; the step panel is the keyboard path and the only place the kind is chosen while connecting, and it lists all `WORKFLOW_EDGE_KINDS`. Steps carry inline badges for `BP-WF-*` diagnostics, and deleting an artifact shows `impactOf`.
- **Diagnostics**: opened from the health bar, grouped by the severity that was clicked, each row navigating to its `ref`.
- **Evaluation view**: per-dimension score with its findings and weight, requirement results with each check and the artifacts that satisfied it, and a button to recompute. Every finding navigates.
- **Compatibility view**: concept by harness matrix from the adapters' own capability matrices, filtered to the concepts the Blueprint uses, each cell carrying the adapter's explanation. Targets are toggled from here.
- **Export view**: the source files and the compiled output per target, with a preview of exactly what would be written, the artifacts each file came from, copy path, save one file, and a ZIP of source plus compiled output. Errors block the download and link to what is wrong.

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
