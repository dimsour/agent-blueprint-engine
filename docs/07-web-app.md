# Web App

This document specifies `apps/web`: routes, layout, state model, persistence, the creation wizard, the ChangeSet review experience, keyboard interaction and the design language. Phases P3 to P7 are built, and P8 has hardened them: the dashboard, the workspace, the editors, the inspector, the command palette, the wizard, ZIP import and export, the overview graph and the workflow editor, the trust surfaces (health bar, diagnostics, evaluation, compatibility, export), the AI side — settings, the relay, the ChangeSet review and the assistant — and GitHub: the token, the push with its preview, and opening a project out of a repository. Each section says which phase owns it.

## Status

| Area                                                                            | Status       |
| ------------------------------------------------------------------------------- | ------------ |
| Next.js App Router, Tailwind v4 tokens, shadcn `components.json`, `cn()` helper | present      |
| Dashboard, workspace, editors, inspector, palette, wizard, import and export    | present (P3) |
| Overview graph, workflow editor, delete-impact dialog                           | present (P4) |
| Health bar, diagnostics, evaluation, compatibility and export views             | present (P5) |
| AI settings, relay, ChangeSet review, assistant, AI evaluation                  | present (P6) |
| GitHub: token and sign-in, push with preview, open from a repository            | present (P7) |
| Accessibility checked in both themes, reduced motion, measured performance      | present (P8) |
| The mark in the tab and every header; a way back from every route but `/`       | present (P9) |
| One screen to create a project, replacing the ten-step wizard                   | present (P9) |
| A tutorial that walks the docs/00 story with generated screenshots              | present (P9) |

## Routes

| Route                                                   | Phase                              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                     | P3                                 | Dashboard: Create Blueprint (primary CTA), Templates, Recent Projects, Import (ZIP, folder, JSON manifest), GitHub (open or clone)                                                                                                                                                                                                                                                                                                              |
| `/new`                                                  | P3, P6-07 (AI draft), P9-03        | Name the Blueprint and create it; one screen, editing one draft in memory                                                                                                                                                                                                                                                                                                                                                                       |
| `/p/[projectId]`                                        | P3                                 | Workspace. `?view=` selects the centre panel: `overview`, or one entity kind spelled as its project directory (`agents`, `skills`, `laws`, …); `&id=` selects an artifact. `evaluation`, `compatibility` and `export` are the three reports about the whole Blueprint; the rest name one kind. The URL is replaced rather than pushed, so back leaves the workspace instead of walking every artifact clicked on the way in.                    |
| `/settings`                                             | P3 (storage), P6 (AI), P7 (GitHub) | What this browser is holding: stored projects, space used, and a way to remove them. The AI endpoint sits here — provider preset, base URL, model, key, where the key is kept, and a Save-and-test that really calls the endpoint and reports what came back. The GitHub token sits beside it on the same terms, with a Save-and-check that asks GitHub who the token belongs to, and Sign in with GitHub when the deployment has an OAuth app. |
| `/tutorial`                                             | P9-06                              | How it works: the docs/00 story, step by step, with a screenshot of each. Reads nothing, so it works before there is a project                                                                                                                                                                                                                                                                                                                  |
| `/api/ai/proxy`                                         | P6-05, optional                    | Relays to the configured OpenAI-compatible base URL for endpoints without CORS, and only to hosts the deployment allows                                                                                                                                                                                                                                                                                                                         |
| `/api/github/oauth/start`, `/api/github/oauth/callback` | P7, optional                       | OAuth code exchange when `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are set                                                                                                                                                                                                                                                                                                                                                                      |

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

### What a field is for (P9-04)

Every field in the visual form carries a sentence of help. Printed under twelve fields at once that is a wall of grey text nobody reads, and it only ever says what the field _is_ — never what a filled-in one looks like. So each field also carries an **example**, and the two live together behind an info icon beside the label.

- The icon is a real button, named `About <field>`, so it is tabbed to and announced. Hovering or focusing it shows the sentence as a tooltip; pressing it opens a panel that stays open, because an example only a mouse can reach is an example a keyboard user does not have. Escape closes the panel and puts focus back on the icon.
- The panel holds the sentence, the example, and **Insert example**. Inserting goes through the field's own `onChange` — the same path typing takes — so it lands in the Blueprint through `upsertEntity` and ⌘Z takes it back out in one step. A field that already has something in it asks first (**Replace** / **Cancel**); a list gains a row rather than losing one, so it never asks.
- The examples are one map in `apps/web/src/components/editors/field-examples.ts`, keyed `<kind>.<field>`, lifted from the fixture project and the starters so what the form suggests is what the product ships. This is not **New from template**, which fills a whole artifact from `@agent-blueprint/templates/artifacts`; this fills one field.
- The sentence keeps its own line only where there is no example to take its place — a field with nothing but a sentence gains nothing from hiding it, and `help` is not always help: the API key field in Settings passes the masked key it already holds through the same prop, and that is live status, not a definition.

### The mark (P9-01)

The brand arrives as one square file — a mark above the words "Agent Blueprint" — kept at `apps/web/brand/agent-blueprint.png` and never served. A 44px top bar has room for the mark and not for the words, so `pnpm --filter web logo` cuts that file into the three assets the app actually uses:

| Asset                        | Where                                   | Shape                                     |
| ---------------------------- | --------------------------------------- | ----------------------------------------- |
| `src/app/icon.png`           | the browser tab                         | square, padded — that is what a tab wants |
| `src/assets/logo-mark.png`   | the top bar, `PageHeader`               | tight to the mark                         |
| `src/assets/logo-lockup.png` | the dashboard hero, where there is room | tight to the whole lockup                 |

The cut is `e2e/logo-assets.spec.ts`, driving a browser over the source with rectangles measured from the artwork's own alpha channel and recorded in the file. It is excluded from `test:e2e` because it writes into the repository. Replacing the artwork is therefore one command and one re-measurement, not a CSS crop re-tuned by eye.

`Logo` (`src/components/layout/logo.tsx`) is the one definition of the mark, used by all four headers. It has a `mark` and a `lockup` variant, takes a width, and reads each asset's height from the static import rather than a constant, so a re-cut of a different shape still lands undistorted. Every placement goes through `next/image`, which resizes to what is painted; the lockup is deliberately not preloaded, so the hero text stays what the browser races to paint.

The mark is `alt=""` wherever a wordmark or a labelled link already names the product, and carries the name only on the dashboard, where it stands alone.

### Getting back (P9-02)

Every route except `/` offers a way out of itself. The workspace top bar's wordmark links home; `/settings` and `/new` use `PageHeader`, which is the logo, a back control and the page's title.

The back control returns to the previous page when that page belongs to this app, and to `/` when it does not — arriving from a bookmark must not walk back into whatever the tab was showing before. `NavigationTrail`, mounted once in the root layout, answers that by counting: it increments a module-level counter on every pathname change. The app is one document, so a move between two of its routes always goes through the client router and never reloads; a full document load re-evaluates the module and resets the counter. A counter above zero therefore proves the entry behind the current one was rendered here. `document.referrer` cannot answer it (fixed at document load, never updated by the App Router), nor can `history.length` (counts other sites' entries and never shrinks), nor `window.history.state` (private router keys).

The control is a real link to `/` whose plain left click is intercepted, so a modified click, a middle click and "copy link address" all get `/`. The cost of the rule is that reloading `/settings` forgets the project it was opened from; going somewhere sensible beats going somewhere surprising.

### The tutorial (`/tutorial`, P9-06)

The product explains itself to somebody who already knows what a Blueprint is. `/tutorial` walks the docs/00 story for somebody who does not — start, describe, review, see the graph, connect, improve, validate, save, compile, push, use it — and every step says what to press, named exactly as the app names it, before it says what happens.

It reads nothing. No project, no store, no client state: the reader it exists for has not made one, and a tutorial that needs a project to explain how to make a project is no tutorial. It is linked from the dashboard header, from `PageHeader` (so `/settings` and `/new` offer it, and it does not offer itself) and from the workspace top bar, icon-only beside Settings.

Its fourteen pictures come from `pnpm --filter web screenshots`, which drives the real app and writes into `apps/web/src/assets/screenshots`; the page imports them through `next/image` and the README links the same files. **A shot the tutorial needs and the script does not take is added to the script, never captured by hand** — that is the whole reason they are generated. Two steps of the story need credentials the reader may not have, and both are shown honestly rather than faked: "Review" is a template proposing a change, which is the same bargain as an AI proposal without needing an endpoint, and "Improve" is the assistant saying it has no endpoint yet.

The axe sweep covers the route in both themes, which is the check that matters on a page that is mostly pictures: an image without a description is a violation.

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

A project id says which store owns it: a folder project's id begins `fs:`, so `openProject` and `saveProject` route to the folder it came from (P3-13). A save arrives with nothing but the id, which is why the id has to carry it. Opening a folder does not copy it into IndexedDB — the directory the user chose stays the project — and saving prunes, using core's rule for what may be removed: a path under the source directory that parses as an artifact file. The build manifest, the compiled output, a README and `.git` are all untouched. Without the prune, deleting an artifact left its file on disk and the next open read it back.

Autosave writes the project itself rather than a separate draft, so nothing is lost when a tab closes, and Save is a way to hurry that rather than the thing that makes an edit durable. Import never trusts anything but the files.

Opening a folder currently copies it into the browser and edits the copy: the store can pick a directory and read it, but nothing routes saves back to disk. Doing that needs `writeProject`'s pruning, because writing the current files without removing what a deleted artifact left behind would make deleted artifacts reappear on the next open. That is the remaining work, and it is not done.

### Import and export (P3-11)

Import is a two-step flow, because a Blueprint can arrive from a colleague, an archive or a git clone. `readUpload` turns the file into a file map (a ZIP, or a `.yaml`/`.yml`/`.json` manifest placed at `<sourceDir>/blueprint.yaml`), `previewImport` parses it with the same reader the workspace uses, and a dialog reports what was found and every diagnostic **before** anything is stored. Errors do not block opening: a project with problems is the project a person needs to open in order to fix it. A starter chosen on the dashboard skips the dialog, since it is the app's own file.

Export is the export view (P5-04), not a dialog: `⌘E` and the palette open it, it lists every file the compiler would write beside the source project, and Download packs both into `<blueprint id>.zip`. The files are rendered from the Blueprint in the store, so an unsaved edit is included, and the screen shows each one before the archive leaves the browser. Two files claiming one path abort the download rather than let the archive disagree with the screen.

The round trip is the contract: for every starter, export then import produces a Blueprint whose `diffBlueprints` against the original has no ops.

#### What the first save would do (P8-05)

The preview also answers two questions a project from elsewhere raises before it is stored.

**Which version was it written at.** `readProject` returns `sourceSchemaVersion` and the chain of `migrations` it ran, and the dialog lists them with each migration's own `description`. `MIGRATIONS` is empty today — there is one schema version — so this shows nothing until there is a schema change, and then it shows it without further UI work. A version with no path to the current one is a fatal `ProjectReadError` with code `UNSUPPORTED_SCHEMA_VERSION`, which reaches the user as the message on the toast: which version it was, and that the application is the thing that needs updating.

**What saving would rewrite.** `previewImport` compares the files that arrived with `renderProjectFiles` of the Blueprint they parsed into, restricted to the source directory, and lists what differs. For a project this app wrote the list is empty. For a hand-edited one it is not: a default spelled out in full, keys in another order, a missing trailing newline. The dialog says so, and says that opening changes nothing — the rewrite happens on the first save. This is the same information `git status` would show afterwards, offered beforehand.

Everything outside the source directory is skipped: it is compiler output, which the compiler owns and rewrites on its own terms, and the build manifest describes the repository the files came from rather than this copy.

## Creating a project (`/new`, P3, P6-07 for the AI draft, collapsed in P9-03)

One screen, one question — _What are you building?_ — and then the workspace:

| Field         | Writes                                                         |
| ------------- | -------------------------------------------------------------- |
| Name          | Blueprint `name`. The only thing Create waits for              |
| Id            | `id`, slugified from the name until the author edits it        |
| Description   | `description`                                                  |
| Draft with AI | a reviewed ChangeSet that fills all three in, and more (P6-07) |

The draft is a real Blueprint from the first keystroke: `lib/wizard/draft` is pure functions over the same schemas the workspace uses, so `/new` cannot produce something the editor would then refuse. A new project keeps the `claude-code` + `codex` defaults, and is created with nothing in it.

It used to ask ten questions, and nine of them were artifact creation — a second, smaller editor with no tree, no inspector, no "new from template" and no health bar, standing in front of the one that has all four. Those nine are the workspace now. The two things only the later steps offered are elsewhere and were already: **targets** are toggled from the command palette and the compatibility view, and the **evaluate** step is the evaluation view, which scores the stored project rather than a draft.

_Draft this with AI_ appears when an endpoint is configured, and a link to Settings when there is not. What comes back is a ChangeSet reviewed artifact by artifact; applying it fills the screen in and creates nothing, because drafting fills the page in rather than pressing the button.

## ChangeSet review (P6-06)

Every ChangeSet from the assistant, the wizard's AI draft or Compound goes through the same
component, `components/ai/changeset-review`.

- The summary, then what the operation could not honour: an artifact that would not parse, a
  reference removed because it pointed at nothing, a duplicate law skipped, a context that did
  not fit. A review the user believes covered everything must actually have covered everything.
- One row per op, marked `+` `~` `−`, carrying the note the operation attached — for Compound,
  the evidence it came from.
- Per field rather than per artifact: only fields whose value differs are shown, word-level for
  short prose and line-level for bodies and lists (`diff`). Two copies of a page and an Apply
  button is a rubber stamp with extra steps.
- Actions: **Accept all**, **Reject all**, a per-op accept toggle, **Edit** (the proposal as the
  file it would become, through the same `renderEntitySource` / `parseEntitySource` the Source
  tab uses, so an edit cannot produce something the project could not hold), **Regenerate**,
  **Discard**, and **Apply**, which calls `applyChangeSet` with exactly the accepted ops.
- Rejected ops are listed after Apply with the reason from `ApplyChangeSetResult.rejected`.
- `⌘⏎` applies what is accepted.

## Assistant (`⌘/`, P6-07)

A dialog over the workspace, opened from the top bar, the palette or the shortcut.

- It knows what you are looking at: with an artifact selected the quick actions target it and
  the header says so; with nothing selected they are listed, disabled, and say "Select an
  artifact first" rather than disappearing.
- Actions are the operations in docs/06, grouped as **This artifact** (the eight quick actions,
  Iron Laws, a workflow for an agent), **The Blueprint** (draft the whole thing, one new
  artifact, turn notes into knowledge) and **Review** (contradictions, what is missing, quality).
- A ChangeSet goes to the review above. Findings are listed with an `AI` badge and their code,
  and every ref navigates. A quality review is per dimension, next to the artifacts it names.
- With no endpoint configured the panel is a link to Settings, not a spinner that fails later.

## Command palette (`⌘K`, P3)

Actions, grouped:

| Group         | Actions                                                                                                                      | State |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----- |
| Create        | one per entity kind; `createEntity` seeds a valid artifact, which is then selected with its form open                        | done  |
| This artifact | Show the form, Show the project file, Show the preview (only for artifacts stored as Markdown)                               | done  |
| Verify        | Validate (flushes the debounce and reports the counts), Show health, Show compatibility                                      | done  |
| Blueprint     | Save, Undo, Redo                                                                                                             | done  |
| Targets       | enable or disable each compile target                                                                                        | done  |
| Deliver       | Export (opens the export view, where the files are browsed and the ZIP is built); Push to GitHub (opens the push dialog)     | P3/P7 |
| AI            | every assistant action, each disabled with its reason when the selection does not suit it; selecting one opens the assistant | done  |
| Go to         | every artifact, matched on name or id                                                                                        | done  |

An action that is not built yet is listed and disabled with the reason, the same rule the top bar follows: the palette is the map of the product, so hiding an action would hide the capability.

AI actions are context-aware: with an artifact selected they target it; with nothing selected the ones that need an artifact are disabled with the reason, and the rest target the whole Blueprint.

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

One key belongs to a view rather than to the app: in the workflow editor, `Delete` or `Backspace` removes the selected step or connection. It is React Flow's own handler, which does not fire while a text field has the focus, so typing in the step panel is safe.

Either modifier fires the shortcut, so the same key works on any keyboard; menus print `⌘` on Apple hardware and `Ctrl+` elsewhere. While the focus is in a text field or the code editor only the palette and Save fire, because `⌘Z` there belongs to the field. `Esc` is handled by the dialogs themselves.

`⌘/` opens the assistant, and `⌘⏎` applies whatever a ChangeSet review currently has accepted. Both were reserved until P6; a shortcut with nothing behind it is left to the browser rather than swallowed.

## Accessibility (P8-06)

Checked rather than asserted: `e2e/accessibility.spec.ts` runs axe over the dashboard, the workspace, the settings screen, the wizard, each of the four views and an open dialog, in **both themes**, against WCAG 2.1 AA. A colour that passes on one ground can fail on the other, so both are measured; the theme is chosen with `addInitScript` before the app loads, because setting the class afterwards races `next-themes` and measures whichever won.

What the sweep found and what changed:

- **Contrast.** In the light theme `--accent` (4.31), `--success` (4.01) and `--warning` (3.22) all fell short of 4.5:1 on their own muted grounds. The three foregrounds were darkened; the dark theme already passed. The helper reports the two colours and the ratio, because a near miss and a wide one call for different fixes.
- **A title on every route.** The workspace route inherited the root title, which arrives only after the client transition settles — a window in which the document has no title at all. It carries its own now.

Structure, which axe cannot judge:

- **Landmarks.** The canvas panel is the `main` landmark and the inspector is `complementary`, both in the shell rather than wrapped inside it: the panel owns the scroll boundary, and another element inside it would take that away. The project tree is a labelled `navigation`.
- **A skip link**, first in the tab order and visible only while focused. A dense project tree is a long way to walk to reach the editor.
- **Focus returns to what opened a dialog.** Radix restores focus to the `DialogTrigger` it opened from, and every dialog here is opened by state instead — a toolbar button, a palette command, a row action — so closing left focus on `<body>` and a keyboard user lost their place every time they pressed Escape. The dialog root remembers what had focus while it was closed, and `onCloseAutoFocus` puts it back. On that event rather than a timer: the closing animation delays the unmount, so anything scheduled would land first and be overwritten.
- **Reduced motion.** `prefers-reduced-motion: reduce` collapses every animation and transition to 0.01ms — near-zero rather than `none`, because Radix unmounts on `animationend` and an animation that never runs never ends.

The keyboard half of the spec drives these with keys only and asserts where focus ended up: the skip link, the resizable separators, the palette, the dialog round trip, and opening an artifact from the tree.

## Views

- **Overview graph** (P4): derived from `collectRefs`; nodes coloured by kind; clicking selects; no positions stored.
- **Workflow editor** (P4): `@xyflow/react`; node palette for all `WORKFLOW_NODE_TYPES`, draggable onto the canvas or clickable to place a step below what is drawn; positions are part of the workflow and are written to the project file, so a drag is an edit like any other and `Tidy` re-lays the graph deterministically. Connections are drawn by dragging between two steps, which always makes a `sequential` edge; the step panel is the keyboard path and the only place the kind is chosen while connecting, and it lists all `WORKFLOW_EDGE_KINDS`. Steps carry inline badges for `BP-WF-*` diagnostics, and deleting an artifact shows `impactOf`. Two ways to add, named apart so neither is mistaken for the other: the **Steps** palette on the left adds one step, and **Insert a whole workflow** adds every step of a template at once. A selected step or connection is removed by the panel's Delete button or by `Delete` / `Backspace`, and either way the step and the connections that reached it go in one change, so one press of undo puts them back.
- **Diagnostics**: opened from the health bar, grouped by the severity that was clicked, each row navigating to its `ref`.
- **Evaluation view**: per-dimension score with its findings and weight, requirement results with each check and the artifacts that satisfied it, and a button to recompute. Every finding navigates. **Run AI analysis** adds a model's contradictions and its verdicts on `ai-judged` requirement checks beside the rules', badged `AI`, deduplicated against what the validator already said — and explicitly not counted in the score, because a number that moves when nothing about the Blueprint did is a number nobody can act on.
- **Compatibility view**: concept by harness matrix from the adapters' own capability matrices, filtered to the concepts the Blueprint uses, each cell carrying the adapter's explanation. Targets are toggled from here.
- **Export view**: the source files and the compiled output per target, with a preview of exactly what would be written, the artifacts each file came from, copy path, save one file, and a ZIP of source plus compiled output. Errors block the download and link to what is wrong.

## GitHub (P7)

Two ways to hand this app a token, one place it is kept.

- **A personal access token** is the path that needs no deployment configuration: paste it into Settings, and **Save and check** asks GitHub `/user` before storing anything. What comes back is shown — the account, which kind of token it is, and for a classic one whether it carries `repo`. A fine-grained token reports no scopes at all, so the card says that rather than showing a cross beside a token that works; what it can reach is settled per repository, where the push preview will say so.
- **Sign in with GitHub** appears only when the deployment set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. `/api/github/oauth/start` sends the browser to GitHub with a random `state` in an `HttpOnly` cookie scoped to those two routes; `/api/github/oauth/callback` checks the `state`, exchanges the code, and hands the token to the page that opened it through a same-origin `postMessage`, then closes. The token is never a cookie, never in a URL, never on the server after the request (docs/08-security.md). The settings page renders per request so that setting the variables is enough to turn sign-in on.

The token then lives exactly where the AI key does: `ab:credentials:github`, `sessionStorage` by default, `localStorage` only after the warning, read by `lib/credentials` and nothing else. **Forget credentials** clears both.

**Pushing** (`⌘K` → Push to GitHub, or the GitHub button in the top bar) is two steps, and the second is a preview. Choose a repository (`owner/name`, a URL, or one of the hundred the token most recently touched) and a branch, which is created by the push when it does not exist; a repository GitHub has nothing at is offered for creation from the same place, empty and private by default. Then **Preview the changes** builds a plan against that branch and shows it before anything can be pressed:

- every path that would be added, changed or removed, with the ones edited on GitHub since the last push marked as such;
- errors from the compiler, which block: files compiled from a Blueprint the validator rejects would misrepresent it;
- files the branch already has that this app did not write — skipped unless each is ticked;
- anything in the content shaped like a credential — blocking until each is ticked, shown with the value masked (docs/08-security.md).

**Opening** (`Open from GitHub` on the dashboard) reads a repository's `blueprint/` directory and hands the files to the import path a ZIP already takes: the same reader, the same diagnostics, the same rule that nothing is stored until Open is pressed. Only the source is read — everything at the repository root is compiler output and is rebuilt as soon as the project opens — and the build manifest is left behind, because it records what the compiler owns in _that_ repository.

The push itself is one tree, one commit and one move of the branch, without `force`: a branch that moved while the preview was open is a conversation, not a race to win. A second push of an unchanged project reports that there is nothing to do, and costs one request to find out.

`lib/github/client.ts` is `fetch` rather than Octokit (ADR-23). It maps GitHub's statuses to codes the UI can act on — in particular telling an exhausted token (403 with `x-ratelimit-remaining: 0`) apart from an unauthorised one — and constructs every error by hand so that no request header can reach a message, a stack or a log.

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

## Performance (P8-07)

Measured, not assumed. `packages/fixtures` generates a project of any size (`stressProjectFiles({ artifacts })`) rather than checking one in: two hundred files nobody reads, kept in canonical form by hand forever, is a worse fixture than one function. It is deterministic, and because the size is a parameter the same code answers "is it fast enough?" and "is it still linear?".

`packages/core/tests/performance.test.ts` measures the functions directly; `apps/web/e2e/performance.spec.ts` measures the things only a browser can answer. On a 200-artifact project, at the time of writing:

| What                                         | Measured | Budget |
| -------------------------------------------- | -------- | ------ |
| `validateBlueprint`                          | ~2 ms    | 100 ms |
| `buildDependencyGraph`                       | <1 ms    | 50 ms  |
| `evaluateBlueprint`                          | ~2 ms    | 200 ms |
| `renderProjectFiles`                         | ~8 ms    | 100 ms |
| Import a ZIP, store it, open the workspace   | ~250 ms  | 2 s    |
| Draw the overview graph                      | ~260 ms  | 500 ms |
| Ten keystrokes in an editor, health bar live | ~200 ms  | 2 s    |

The budgets are loose against the measurements on purpose: a threshold that fails on a loaded machine gets disabled, and a disabled test measures nothing. They exist to catch a change in the _shape_ of the cost, which is why two of the tests compare 100 artifacts against 400 rather than checking a constant — something quadratic passes at 200 and falls over at 600.

That check found the one real problem. Evaluation compares skills pairwise, which it has to, but it tokenized each description **inside** the loop, so the same text was parsed once per other skill: quadratic comparisons doing quadratic work. Two hundred skills meant forty thousand parses instead of two hundred. Hoisting the tokenization took an 800-artifact evaluation from 42 ms to 10 ms and made the curve linear again. The comparison is still quadratic; the work per comparison is not.

Everything else was already memoized where it needed to be: the health bar, the evaluation view, the export preview, the inspector's relations and the overview graph all recompute only when the Blueprint or the diagnostics change.

## The story, walked (P8-09)

`e2e/story.spec.ts` walks docs/00's reference scenario once, in a single session: begin from a template, see the derived graph, edit an artifact, watch autosave commit it, open the findings behind a health count, compile, and push. Every step is covered in isolation elsewhere. This one exists for the join — a save that loses the edit, an export that disagrees with the screen, a push whose preview is not what gets committed — which no per-surface test can see.

GitHub is answered locally and the mock **records the tree it was given**, so the test asserts that the commit carried exactly the paths the preview named, on the branch that was typed. It also asserts the promises in docs/00's quality bar, because a promise nothing checks is a promise that quietly stops being true: a health-bar count always has findings behind it, two exports of an untouched project are byte-identical, and every harness limitation is explained rather than dropped.

It found one bug immediately. `?view=` and `&id=` are documented above as making a view linkable, and clicking a link worked — but reloading or sharing one did not. The effect that writes the URL from the store compared against values from the render _before_ the effect that reads the URL had applied them, so opening `?view=export` rewrote the URL to `overview` and dropped you on the graph. The follower reads live state now, and three tests cover it.
