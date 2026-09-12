# 09 — Roadmap and backlog

The backlog for building Agent Blueprint. Phases follow the plan; tasks inside a phase are ordered by dependency. Phases can overlap where their dependencies allow (P1 and P2 can run in parallel; P3 can start once P0 is done).

## How to pick up a task

1. Read `AGENTS.md`, `docs/00-vision.md`, `docs/01-architecture.md` and the docs named in the task.
2. Run `pnpm install && pnpm check` on a clean checkout; everything must be green before you start.
3. Branch: `<phase>-<id>-<slug>` (e.g. `p1-03-contradiction-heuristic`). One task per branch. Small tasks may be batched when they touch the same files.
4. Read the real code for every name you use. Do not invent APIs; extend the ones in `docs/02-domain-model.md`.
5. Definition of done:
   - acceptance criteria below are met and covered by tests (`vitest` in packages, Playwright in `apps/web` where stated);
   - `pnpm check` (lint, typecheck, test) and `pnpm build` pass;
   - determinism preserved: no timestamps, random ids or unstable ordering in anything written to a project or a generated file; golden files updated deliberately;
   - no `react`, `react-dom` or `next` import in `packages/*` (ESLint enforces it);
   - no credentials in Blueprint files or generated output;
   - docs updated (the doc that specifies the feature, plus `docs/05-validation-evaluation.md` for new diagnostic codes, `docs/04-compiler.md` for adapter changes);
   - the fixture re-canonicalized if its format changed (`pnpm --filter @agent-blueprint/core fixtures:canonicalize`).
6. Verification commands are listed per task; run them and paste real output in the PR.

## Status

| Phase             | State | Notes                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 Foundation     | done  | Workspace, docs, `@agent-blueprint/core` v0, fixture.                                                                                                                                                                                                                                                                                                                                                 |
| P1 Core semantics | done  | P1-01 to P1-09 implemented and tested, including 29 artifact templates and 10 starter blueprints.                                                                                                                                                                                                                                                                                                     |
| P2 Compiler       | done  | P2-01 to P2-09 implemented: adapter interface, registry, shared emitters, pipeline, build manifest, Claude Code and Codex in full, Copilot/OpenCode/Pi minimal, portability, golden tests.                                                                                                                                                                                                            |
| P3 Web shell      | done  | P3-01 to P3-11 implemented and then reviewed end to end: the review found eight defects (undo across projects, non-deterministic export, a hydration failure and five more), and the gaps it found against docs/07 were built. See P3-12.                                                                                                                                                             |
| P4 Graphs         | done  | P4-01 to P4-04: the overview graph, the workflow editor with all sixteen step types and eight connection kinds, tidy and template insertion, and the delete-impact dialog. Reviewed with P5; see P5-06.                                                                                                                                                                                               |
| P5 Trust surfaces | done  | P5-01 to P5-05: the health bar opens its findings, the evaluation and compatibility views, the export view with compiled output, and the rename dialog with a slug preview. P5-06 reviewed P4 and P5 end to end and fixed what it found.                                                                                                                                                              |
| P6 AI             | done  | P6-01 to P6-09: the AI package, the settings screen and relay, the ChangeSet review, the assistant, the AI draft in the wizard, a model second opinion in the evaluation view, and the live check against real endpoints that found and fixed seven bugs. P6-10 to P6-12 are follow-ups it recorded.                                                                                                  |
| P7 GitHub         | done  | P7-01 to P7-05: the token and sign-in, repository and branch selection, the push preview against the remote tree, the atomic push with a secret scan in front of it, and opening a project out of a repository. P7-06 is a follow-up it recorded.                                                                                                                                                     |
| P8 Hardening      | done  | P8-01 to P8-09: all five harnesses have a full adapter, projects carry binary assets, an import says what the first save would change, the UI is checked against WCAG 2.1 AA in both themes, a 200-artifact project is measured, the docs no longer describe finished work as planned, and the docs/00 story is walked end to end. P8-10 and P8-11 are the two hook runtimes those adapters recorded. |
| P9 Interface      | to do | The interface pass: the logo, a way back out of every route, one step to a project instead of ten, an example beside every field, a pointer on anything clickable, and a tutorial. Specified below.                                                                                                                                                                                                   |

## P0 — Foundation (done)

What exists:

- pnpm workspace with Turborepo: `apps/web` (Next.js placeholder that imports core), `packages/core`, `packages/exporters` (stub), `packages/ai` (stub), `packages/templates` (stub), `packages/fixtures`, `tooling/*`, CI workflow.
- `@agent-blueprint/core`: Zod schemas and inferred types for every entity; slug ids; reference table (`visitRefs`); `createEmptyBlueprint`, `normalizeBlueprint`, entity CRUD, `renameEntity`, `deleteEntity`; project format reader/writer over `VirtualFs` with default-stripping and byte-identical round trip; migrations registry; ChangeSet types, `applyChangeSet`, `diffBlueprints`; structural validation rules; dependency graph, impact, orphans.
- Fixture `dotnet-testing-expert` in canonical form; `canonicalize` script.
- Docs 00–10 and `docs/harness/*`.

Verification: `pnpm check` green; `pnpm --filter @agent-blueprint/core test` shows the round-trip, determinism, rename, delete, migration and validation suites passing.

## P1 — Core semantics

### P1-01 Semantic workflow rules

- Package: `packages/core/src/validation/rules/semantic.ts`
- Depends on: P0
- Description: Implement `BP-WF-010` (unreachable nodes), `BP-WF-011` (no verification/gate/review/human-approval on any start→end path), `BP-WF-012` (parallel/merge arity), `BP-WF-013` (dead ends), `BP-WF-014` (cycle without retry) per docs/05 §2.3. Add a small graph helper (`reachableFrom`, `pathsToEnd`) in `validation/workflow-graph.ts`. Register the rules in `ALL_RULES`.
- Acceptance:
  - each code has a positive and negative test derived from the fixture;
  - unmodified fixture still yields zero diagnostics;
  - `docs/05-validation-evaluation.md` catalogue marks the codes implemented.
- Verify: `pnpm --filter @agent-blueprint/core test`

### P1-02 Agent and skill semantic rules

- Package: `packages/core/src/validation/rules/semantic.ts`
- Depends on: P1-01
- Description: Implement `BP-AGENT-010` (agent without workflow), `BP-AGENT-011` (responsibility without matching skill; keyword overlap with stop-words and simple stemming in `validation/text.ts`), `BP-AGENT-012`, `BP-SKILL-010` (never activated), `BP-SKILL-011` (no verification section), `BP-HOOK-010`, `BP-GATE-010`, `BP-LAW-011`.
- Acceptance: tests per code; `text.ts` has unit tests for tokenization and stemming; fixture zero diagnostics.
- Verify: `pnpm --filter @agent-blueprint/core test`

### P1-03 Orphan rules

- Package: `packages/core/src/validation/rules/orphans.ts`
- Depends on: P0
- Description: Wrap `findOrphans` into `BP-ORPHAN-001..008` diagnostics (one code per kind, per docs/05 §2.3), each with `ref` and a message naming the kind.
- Acceptance: adding an unreferenced reference to the fixture yields exactly one `BP-ORPHAN-007`; primary agent is never an orphan.
- Verify: `pnpm --filter @agent-blueprint/core test`

### P1-04 Contradiction heuristic

- Package: `packages/core/src/validation/contradictions.ts`, rule in `rules/semantic.ts`
- Depends on: P1-02 (shares `text.ts`)
- Description: Implement the deterministic heuristic in docs/05 §3: sentence split, modal detection, polarity, noun-phrase tokens, Jaccard ≥ 0.5 with ≥ 2 shared tokens, exclusions. Emit `BP-LAW-010` for law pairs, `BP-CONTRA-001` otherwise, once per pair, with `related` and `data.sentences`.
- Acceptance: tests for the three cases named in docs/05 §3; runs under 50 ms on a blueprint with 50 artifacts (add a generated stress fixture in the test).
- Verify: `pnpm --filter @agent-blueprint/core test`

### P1-05 Requirement evaluation

- Package: `packages/core/src/validation/requirements.ts`
- Depends on: P0
- Description: Implement `evaluateRequirements(ctx): { results: RequirementResult[]; diagnostics: Diagnostic[] }` with the per-check semantics in docs/05 §4 and codes `BP-REQ-001..004`. `ai-judged` returns `skipped`. Register as a rule so `validateBlueprint` includes the diagnostics; also export the results for the UI.
- Acceptance: fixture's `verify-before-claiming` is `satisfied` and `use-existing-framework` is `satisfied`; removing the gate makes the first `partial`; invalid regex fails the check without throwing; `evidence` refs point to the matching entities.
- Verify: `pnpm --filter @agent-blueprint/core test`

### P1-06 Evaluation scoring

- Package: `packages/core/src/evaluation/{score.ts,health.ts,index.ts}`
- Depends on: P1-01..05
- Description: Implement `evaluateBlueprint(bp, { portability? })` and `EvaluationReport` per docs/05 §6 (dimensions, weights, penalties, heuristics, code→dimension map in a table constant) and `healthSummary(bp, report)` per §7. Portability input is an injected function so core stays independent of exporters.
- Acceptance: fixture `overall ≥ 90`; each heuristic has a test showing the expected drop; report contains no timestamp; every finding has a `ref` or is blueprint-level.
- Verify: `pnpm --filter @agent-blueprint/core test`

### P1-07 Templates package: artifact templates

- Package: `packages/templates/src/artifacts/*`
- Depends on: P0
- Description: Implement `artifactTemplates: ArtifactTemplate[]` where `ArtifactTemplate = { id, kind, label, description, build(params: { id, name }): ChangeSet }`. Cover: skills (domain expertise, coding procedure, testing, debugging, research, documentation, code review), agents (developer, reviewer, architect, qa, security, researcher, orchestrator), workflows (feature implementation, bug investigation, code review, test generation, security audit, refactoring, research), iron laws (security, testing, architecture, reliability, data, code quality), rules, hooks (run tests, formatter, secret scan), gates (tests pass, human approval). Each template's Markdown follows the skill template in the brief (Purpose / When to Use / Instructions / Constraints / Examples / Verification).
- Acceptance: every template applies to an empty blueprint via `applyChangeSet` with zero rejected ops and passes `validateBlueprint` with no errors; a snapshot test per template.
- Verify: `pnpm --filter @agent-blueprint/templates test`

### P1-08 Templates package: starter blueprints

- Package: `packages/templates/src/blueprints/*`
- Depends on: P1-07
- Description: Ten complete starter blueprints as source projects (`Record<string, string>` file maps, built from the fixture format): .NET Testing Expert (reuse the fixture), React Expert, Python Backend Expert, Code Review Agent, Security Auditor, DevOps Agent, Documentation Agent, Software Architect, QA Engineer, Full Software Engineering Team (5 agents, parallel review workflow). Export `starterBlueprints: { id, label, description, files }[]`.
- Acceptance: each loads with `readProject` with zero diagnostics, validates with zero errors, and `evaluateBlueprint` overall ≥ 85; each is canonical (render equals files).
- Verify: `pnpm --filter @agent-blueprint/templates test`

### P1-09 Core docs refresh

- Package: `docs/05-validation-evaluation.md`, `docs/02-domain-model.md`
- Depends on: P1-01..08
- Description: Move every implemented code from "planned" to the implemented tables; document `evaluation/` API in docs/02 §13.
- Acceptance: every code in `ALL_RULES` appears in docs/05; a test (`tests/docs.test.ts`) greps the doc for each code.
- Verify: `pnpm --filter @agent-blueprint/core test`

## P2 — Compiler

### P2-01 Adapter interface and registry

- Package: `packages/exporters/src/{adapter.ts,registry.ts,types.ts}`
- Depends on: P0
- Description: Define `HarnessAdapter`, `Concept`, `CapabilitySupport`, `CapabilityMatrix`, `GeneratedFile`, `CompatibilityIssue`, `CompileResult`, `CompileOptions` per docs/04-compiler.md; `ADAPTERS: Record<HarnessId, HarnessAdapter>`; `adapterFor(id)`. Each adapter validates its `options` with its own Zod schema.
- Acceptance: typecheck passes; registry has an entry for every `HARNESS_IDS` value (test).
- Verify: `pnpm --filter @agent-blueprint/exporters test`

### P2-02 Shared emitters

- Package: `packages/exporters/src/shared/*`
- Depends on: P2-01
- Description: `emitSkillDir(skill, { root, harness })` producing Agent-Skills-spec `SKILL.md` (name = id, description ≤ 1024, `allowed-tools`, references copied to `references/`), `emitAgentsMd(bp, sections)`, `emitWorkflowSkill(workflow, bp)` (ordered steps from a topological walk, parallel groups, gates, failure behaviour, delegation targets), `emitReadme(bp)`, `lowerPermissions(agent, harness)`, `lowerHooks(hooks, harness)`, `generatedHeader(sourcePath)` (HTML comment for Markdown only). Pure functions returning `GeneratedFile[]`.
- Acceptance: unit tests with snapshots for the fixture; workflow skill for `write-tests` lists 7 steps in start→end order with the retry edge rendered as "on failure: fix and retry".
- Verify: `pnpm --filter @agent-blueprint/exporters test`

### P2-03 Pipeline and build manifest

- Package: `packages/exporters/src/pipeline.ts`
- Depends on: P2-01, P2-02
- Description: `compileBlueprint(bp, { targets? }): CompileResult` = normalize → `validateBlueprint` (errors abort) → per enabled target `adapter.validate` + `adapter.compile` → merge file sets (identical shared paths deduplicated; differing content on the same path is a `CompatibilityIssue` of kind `conflict`) → `buildManifest` with `sha256Hex` per file. `writeGeneratedFiles(result, fs, { previousManifest })` writes changed files, deletes stale owned files, never overwrites unowned files (returns them as `skipped`).
- Acceptance: compiling twice yields identical `GeneratedFile[]` and manifest; deleting a skill and recompiling removes its generated files; an unowned pre-existing `README.md` is skipped.
- Verify: `pnpm --filter @agent-blueprint/exporters test`

### P2-04 Claude Code adapter

- Package: `packages/exporters/src/claude-code/*`
- Depends on: P2-02, P2-03
- Description: Full mapping per docs/04 and docs/harness/claude-code.md: `CLAUDE.md` (primary persona, iron laws section, rules summary, agent roster, workflow index, memory seed), `.claude/rules/<id>.md` with `paths:`, `.claude/skills/<id>/SKILL.md`, `.claude/agents/<id>.md` for non-primary agents (description, tools from toolIds, model from preference, skills, permissionMode, memory), workflows as orchestration skills, `.claude/settings.json` with `permissions` and `hooks` (trigger lowering table; `check-iron-laws` → `type: prompt`), gates with executable criteria as `Stop` hooks. Capability matrix with explanations.
- Acceptance: golden files under `tests/golden/claude-code/` for the fixture; `settings.json` parses and matches the documented schema; no timestamps; every generated Markdown has the header comment; manual check recorded in the PR: open the generated repo in Claude Code and invoke `/write-tests`.
- Verify: `pnpm --filter @agent-blueprint/exporters test`

### P2-05 Codex adapter

- Package: `packages/exporters/src/codex/*`
- Depends on: P2-02, P2-03
- Description: `AGENTS.md` (32 KiB cap with overflow into skills), `.agents/skills/<id>/SKILL.md` + `agents/openai.yaml`, `.codex/agents/<id>.toml` for non-primary agents + `[features] multi_agent`, `.codex/config.toml` (`approval_policy`, `sandbox_mode` from permissions), `.codex/hooks.json`, nested `AGENTS.md` for directory-scoped rules, memories feature flags. Capability matrix.
- Acceptance: golden files; TOML output parsed by a TOML parser in tests; AGENTS.md under the cap for the fixture; manual check with Codex CLI recorded.
- Verify: `pnpm --filter @agent-blueprint/exporters test`

### P2-06 Minimal Copilot, OpenCode and Pi adapters

- Package: `packages/exporters/src/{copilot,opencode,pi}/*`
- Depends on: P2-02, P2-03
- Description: Each ships its capability matrix, options schema and a compile that emits `AGENTS.md` via the shared emitter plus skills (`.github/skills/` for Copilot, `.agents/skills/` shared for OpenCode and Pi) and `.github/copilot-instructions.md` for Copilot. Everything else reported as `adapted`/`unsupported` issues with explanations from docs/harness/*.
- Acceptance: golden files; capability matrices match docs/harness support tables (test compares against a JSON copy in `tests/`).
- Verify: `pnpm --filter @agent-blueprint/exporters test`

### P2-07 Portability input for evaluation

- Package: `packages/exporters/src/portability.ts`
- Depends on: P1-06, P2-06
- Description: `portabilityOf(bp): { score, issues }` computing docs/05 §6 Portability from capability matrices × features used, and `BP-PORT-001/002` diagnostics. Web wires it into `evaluateBlueprint`.
- Acceptance: fixture with claude-code + codex scores ≥ 85; enabling pi drops it (memory unsupported) with an explanatory `BP-PORT-001`.
- Verify: `pnpm --filter @agent-blueprint/exporters test`

### P2-08 Determinism and golden test harness

- Package: `packages/exporters/tests/*`
- Depends on: P2-04..06
- Description: A single `goldens.test.ts` that compiles every fixture and starter blueprint for every target and compares to `tests/golden/<target>/<fixture>/` with an `UPDATE_GOLDENS=1` regeneration path; a determinism test compiling twice with shuffled input order.
- Acceptance: CI fails on any unreviewed golden change.
- Verify: `pnpm --filter @agent-blueprint/exporters test`

### P2-09 Compiler docs

- Package: `docs/04-compiler.md`
- Depends on: P2-04..07
- Description: Update lowering tables and capability matrices to what is implemented; add "how to add an adapter" walkthrough with the file list.
- Acceptance: doc reviewed against code; each adapter's `docsUrl` matches docs/harness sources.
- Verify: manual review

## P3 — Web shell

### P3-01 App shell, theme, layout primitives

- Package: `apps/web/src/{app,components/layout}`
- Depends on: P0
- Description: shadcn/ui components (button, dialog, dropdown, tabs, tooltip, input, textarea, select, badge, resizable panels, scroll area, toast), dark/light theme toggle persisted in localStorage, the IDE layout (top bar, left tree, center, right inspector, bottom health bar) as resizable panels. Design per docs/07 (neutral, dense, no gradients).
- Acceptance: `pnpm --filter web build` passes; Playwright smoke renders the layout at 1280×800 and 1024×700 without horizontal scroll.
- Verify: `pnpm --filter web build && pnpm --filter web test:e2e`

### P3-02 Project store and persistence tiers

- Package: `apps/web/src/lib/storage/*`
- Depends on: P0
- Description: `ProjectStore` interface (`list`, `open`, `save`, `delete`, `importFiles`) with `IndexedDbStore` (idb; stores rendered project files + a summary), `ZipStore` (jszip read/write of `Record<string,string>`), `FileSystemAccessStore` (Chromium directory handle; feature-detected), each backed by a `VirtualFs` implementation over `readProject`/`writeProject`. Recent projects list.
- Acceptance: unit tests for Zip round trip via `renderProjectFiles`; IndexedDB tested with `fake-indexeddb`; unsupported browser hides the folder option.
- Verify: `pnpm --filter web test`

### P3-03 Blueprint state store

- Package: `apps/web/src/lib/state/*`
- Depends on: P3-02
- Description: Zustand store `{ blueprint, selection, diagnostics, dirty, projectId }` with `zundo` undo/redo; actions call core (`upsertEntity`, `renameEntity`, `deleteEntity`, `applyChangeSet`); diagnostics recomputed (debounced) on every change via `validateBlueprint`; autosave draft to IndexedDB; explicit save writes the project. Credentials are excluded from persisted state.
- Acceptance: unit tests for undo/redo and dirty tracking; validation debounce tested.
- Verify: `pnpm --filter web test`

### P3-04 Dashboard

- Package: `apps/web/src/app/page.tsx`, `components/dashboard/*`
- Depends on: P3-01..03, P1-08
- Description: Create Blueprint (primary CTA → wizard), Templates grid (starter blueprints), Recent projects, Import (ZIP, folder, blueprint.yaml), GitHub (opens a repository as a project; built in P7-05).
- Acceptance: Playwright: create from template → workspace opens with the blueprint loaded.
- Verify: `pnpm --filter web test:e2e`

### P3-05 Workspace routing and project tree

- Package: `apps/web/src/app/p/[projectId]/*`, `components/tree/*`
- Depends on: P3-03
- Description: `/p/[projectId]?view=<section>&id=<entity>`; left tree grouped by kind with counts, badges for diagnostics, create/rename/delete context menu (rename uses `renameEntity`; delete shows `impactOf` before confirming).
- Acceptance: Playwright: rename a skill from the tree updates the agent's skill list; delete shows the impact dialog.
- Verify: `pnpm --filter web test:e2e`

### P3-06 Entity editors: visual forms

- Package: `apps/web/src/components/editors/*`
- Depends on: P3-05
- Description: One form per kind generated from the schema field tables in docs/02 (controlled inputs writing through the store; see docs/07 for why not react-hook-form): agent (role, expertise, responsibilities, id pickers for skills/workflows/laws/rules/tools/references/memory, permissions grid, model, delegation), skill (activation editor, references, resources list), iron law, rule, hook, gate, tool, reference, memory, requirement (check builder), scenario. Id pickers offer "create new" inline.
- Acceptance: each form edits the fixture entity and produces a valid entity (unit tests per form with Testing Library).
- Verify: `pnpm --filter web test`

### P3-07 Markdown editor and Visual/Markdown/Preview sync

- Package: `apps/web/src/components/editor/*`
- Depends on: P3-06
- Description: CodeMirror 6 editor behind an `ArtifactEditor` interface (Markdown + YAML frontmatter modes, line numbers, search, shortcuts, snippets for section headings). The Markdown tab shows exactly the file `renderProjectFiles` would write for the entity; edits parse through `decodeFrontmatter` + the entity schema; parse errors are shown inline and block switching tabs. Preview renders Markdown.
- Acceptance: editing frontmatter in Markdown updates the visual form and vice versa; invalid YAML shows an error without losing text.
- Verify: `pnpm --filter web test`

### P3-08 Inspector panel

- Package: `apps/web/src/components/inspector/*`
- Depends on: P3-06
- Description: Right panel for the selected entity: summary, dependencies and dependents (from `buildDependencyGraph`), diagnostics for this entity, quick actions (rename, duplicate, delete, start from template).
- Acceptance: selecting the fixture's `xunit` skill lists the agent and workflow that use it.
- Verify: `pnpm --filter web test`

### P3-09 Command palette and shortcuts

- Package: `apps/web/src/components/command-palette/*`, `lib/shortcuts.ts`
- Depends on: P3-05
- Description: cmdk palette with the actions in docs/07 (create entity kinds, validate, export, push, AI actions disabled until configured, switch harness); shortcuts ⌘K ⌘S ⌘E ⌘/ ⌘P ⌘⏎ Esc (Ctrl on Windows/Linux).
- Acceptance: Playwright: ⌘K → "Create Skill" opens the skill form.
- Verify: `pnpm --filter web test:e2e`

### P3-10 Creation wizard (non-AI path)

- Package: `apps/web/src/app/new/*`
- Depends on: P3-06, P1-07
- Description: Ten steps per docs/07 editing a draft Blueprint in memory; step 3–7 use artifact templates; step 8 selects targets; step 9 runs `validateBlueprint` (and `evaluateBlueprint` when available); step 10 shows the summary and creates the project.
- Acceptance: Playwright: complete the wizard → project with 1 agent, ≥ 1 skill, ≥ 1 workflow, ≥ 1 law, chosen targets.
- Verify: `pnpm --filter web test:e2e`

### P3-11 ZIP import/export

- Package: `apps/web/src/components/export/*`, `lib/storage/zip.ts`
- Depends on: P3-02
- Description: Export ZIP of the source project (compiled output added in P5-04); Import ZIP / folder / manifest with diagnostics shown before opening.
- Acceptance: Playwright: export then import yields zero `diffBlueprints` ops.
- Verify: `pnpm --filter web test:e2e`

### P3-12 Review of P3 (done)

- Package: `apps/web`, `packages/core`
- Description: A full review of P3 before starting P4. Fixed: undo history surviving a project switch, which let an autosave write one project's Blueprint over another's; undo bypassing the store, so a revert was never persisted and diagnostics went stale; a pending autosave dropped when leaving a project; a save clearing `dirty` for a Blueprint it did not write; ZIP export stamping the wall clock into directory entries, breaking the determinism rule; a hydration failure on the dashboard from branching on a browser capability; the wizard throwing when the agent name was cleared and silently reverting a typed id; list rows losing the caret on every keystroke; the source-tab guard being bypassable from the palette and the shortcuts.
- Built what docs/07 specified and P3 had not: `?view=` and `&id=` routing with an overview and per-kind canvas, the tree's Overview row and per-artifact actions, `/settings`, the wizard's persisted draft, the requirement check builder, the skill resources editor, agent delegation, inline create in every id picker, and editor snippets.
- Removed: three unused dependencies and their components, an endpoint with no caller, a store helper used only by its own test, an editor prop never passed, and six hand-rolled entity lookups.
- Verify: `pnpm check` and `pnpm --filter web test:e2e`

### P3-13 Write to a folder on disk (done)

- Package: `apps/web/src/lib/storage/file-system.ts`
- Depends on: P3-02
- Description: `FileSystemAccessStore` can pick a directory and read it, but nothing routes saves back to it: opening a folder copies it into IndexedDB. Wire `saveProject` to the store the project came from, and make `writeDirectory` prune, because writing the current files without removing what a deleted artifact left behind makes deleted artifacts reappear on the next open. Folder projects also need a stable id: today it is the directory's base name, so two folders with the same name collide.
- Acceptance: edit a folder project, reopen the folder, and see the edit and not the deleted artifact; two folders of the same name coexist.
- Verify: `pnpm --filter web test storage`, plus manual confirmation in Chromium.
- Built: the project id says which store owns it (`fs:` for a folder), so `openProject` and `saveProject` route to the folder the project came from rather than defaulting to IndexedDB — a save arrives with nothing but the id, which is why the id has to carry it. Opening a folder no longer copies it in: the preview carries the id the folder already has, and Open navigates to it.
- `writeDirectory` prunes, using core's own rule for what may be removed: a path under the source directory that parses as an artifact file. Nothing else is touched — not the build manifest, not the compiled output, not a README, not `.git`. Without it, deleting an artifact left its file behind and the next open read it back, so the artifact returned from the dead.
- A folder's id is minted once and keyed to the handle, not to the directory's name: two projects are often both called `blueprint`, and one was opening the other. Re-picking the same folder finds its existing id through `isSameEntry` rather than making a second entry.

## P4 — Graphs

### P4-01 Blueprint overview graph

- Package: `apps/web/src/components/graph/overview/*`
- Depends on: P3-05
- Description: React Flow view of the dependency graph (nodes per entity, typed edges, kind colours, primary agent highlighted), auto-layout with elkjs (positions not persisted), click selects, filters by kind, orphans and errors overlaid from diagnostics.
- Acceptance: fixture renders 19 nodes; layout deterministic for the same input.
- Verify: `pnpm --filter web test`

### P4-02 Workflow editor

- Package: `apps/web/src/components/graph/workflow/*`
- Depends on: P3-06
- Description: React Flow editor with custom node components for all 16 node types and edge styles for all 8 edge kinds; palette to add nodes; connecting nodes creates edges with a kind picker; positions saved to `node.position`; node inspector edits `config` (agent/skill/gate/tool pickers, verification, retry); validation overlays (`BP-WF-*`) inline; "set as entry" action.
- Acceptance: Playwright: add a verification node between two nodes in the fixture workflow, save, reload, graph persists; `BP-WF-010` appears when a node is disconnected.
- Verify: `pnpm --filter web test:e2e`

### P4-03 Workflow templates and auto-layout

- Package: `apps/web/src/components/graph/workflow/*`
- Depends on: P4-02, P1-07
- Description: Insert workflow templates as subgraphs; "tidy" runs elkjs layered layout and writes positions.
- Acceptance: tidy produces no overlapping nodes for the fixture workflows.
- Verify: `pnpm --filter web test`

### P4-04 Delete-impact dialog

- Package: `apps/web/src/components/dialogs/delete-impact.tsx`
- Depends on: P3-05
- Description: Uses `impactOf`: lists direct and transitive dependents and affected export targets; confirms before `deleteEntity`.
- Acceptance: deleting `test-design` lists the agent and both workflows.
- Verify: `pnpm --filter web test`

## P5 — Trust surfaces

### P5-01 Health bar and diagnostics panel

- Depends on: P1-06, P3-03
- Description: Bottom bar with counts, overall score, per-target status; expandable diagnostics list grouped by severity; clicking navigates to `ref` (and node when `data.nodeId`).
- Acceptance: Playwright: click a warning → the entity opens and is highlighted.
- Verify: `pnpm --filter web test:e2e`

### P5-02 Evaluation view

- Depends on: P1-06
- Description: `?view=evaluation`: dimension scores with findings, requirement results (✓ ⚠ ✕ with evidence links), re-run button.
- Acceptance: matches `evaluateBlueprint` output for the fixture.
- Verify: `pnpm --filter web test`

### P5-03 Compatibility view

- Depends on: P2-06, P2-07
- Description: `?view=compatibility`: matrix concepts × harnesses with ✓ ~ ⚠ ✕ from capability matrices, filtered to features the blueprint uses, each cell explaining the limitation; toggle targets from here.
- Acceptance: enabling pi shows memory as unsupported with the explanation.
- Verify: `pnpm --filter web test`

### P5-04 Export view

- Depends on: P2-03, P3-11
- Description: `?view=export`: per-target file tree of `compileBlueprint` output with a preview pane, download ZIP (source + compiled), download a single file, copy path. Errors block export with links.
- Acceptance: Playwright: export ZIP contains `blueprint/` and `.claude/`; a blueprint with errors shows them instead.
- Verify: `pnpm --filter web test:e2e`

### P5-05 Rename refactor UI and id conflicts

- Depends on: P3-05
- Description: Rename dialog with slug preview, collision detection, "references updated: n" toast.
- Acceptance: unit test.
- Verify: `pnpm --filter web test`

### P5-06 Review of P4 and P5 (done)

- Package: `apps/web`
- Description: A full review of the graphs and the trust surfaces before starting P6. Fixed: three surfaces each deciding for themselves what an enabled compile target is, one of which appended a duplicate row and turned a `BP-TARGET-002` error on by clicking a harness twice — now one rule in `lib/targets.ts`; the health bar computing its counts from one report and its score from another, so it showed three zeroes beside a score of 97, and scoring 100 for portability with no target at all; the export view's badge counting 38 files while the tree listed 28, because shared files were listed under every harness that reads them; two uncaught `ZodError`s in the workflow editor, one of which took the editor down with it; a template inserted twice landing on top of itself; and a `Tidy` whose result could overwrite anything edited while it was being laid out.
- Also: the step palette can be used from the keyboard, and the step panel is the keyboard path to a connection and the only place its kind is chosen while connecting, which closes the edge-kind gap P4-02 specified; the two verification controls agreed to disagree about their default and now read one function; ELK is imported lazily, so the step names no longer pull the layout engine into the first load.
- Removed: the export dialog, which was a strict subset of the export view and wrote the same file name; a dead URL helper; a hand-written report list in the tree, now derived from `REPORT_VIEWS`, so a report the tree cannot reach is a type error.
- Acceptance: the export archive holds `blueprint/` and `.claude/`; a dragged step keeps its position across a reload; a connection made from the panel appears with the kind that was chosen; the health bar's counts open exactly that many findings.
- Verify: `pnpm check` and `pnpm --filter web test:e2e`

## P6 — AI

### P6-01 AI client (done)

- Package: `packages/ai/src/client/*`
- Depends on: P0
- Description: `AIClient` over OpenAI-compatible `/chat/completions` via `fetch`: config `{ baseUrl, apiKey?, model, extraHeaders?, features }`, presets (OpenAI, Anthropic compat, OpenRouter, Ollama, LM Studio, vLLM, Azure OpenAI, custom), `probe()` (lists models, detects `response_format: json_schema` support), streaming, retries with backoff, error mapping. Never logs keys or bodies.
- Acceptance: tests with a mocked fetch for each preset's URL shape and for the probe; no `console.*` in the package.
- Verify: `pnpm --filter @agent-blueprint/ai test`

### P6-02 Structured output (done)

- Package: `packages/ai/src/structured.ts`
- Depends on: P6-01
- Description: `structured(client, schema, messages)`: JSON-schema mode when supported, else prompt-embedded schema; Zod validation; one repair round trip on failure; token budgeting helper.
- Acceptance: tests covering both modes and the repair path.
- Verify: `pnpm --filter @agent-blueprint/ai test`

### P6-03 Prompt catalogue and context builder (done)

- Package: `packages/ai/src/{prompts,context}/*`
- Depends on: P6-02
- Description: Versioned prompt templates embedding the concept glossary (docs/00); `buildContext(bp, selection, budget)` producing a compact blueprint summary plus the selected artifact in full.
- Acceptance: snapshot tests; context for the fixture under 6k tokens.
- Verify: `pnpm --filter @agent-blueprint/ai test`

### P6-04 Operations returning ChangeSets (done)

- Package: `packages/ai/src/operations/*`
- Depends on: P6-03
- Description: `generateBlueprint(brief)`, `generateArtifact(kind, brief, ctx)`, `improveArtifact(ref, action, ctx)` (improve, rewrite, more specific, add examples, add edge cases, add verification, simplify, make portable), `createWorkflowFor`, `createIronLawsFor`, `findMissing`, `compound(notes)` → `ChangeSet`; `findContradictions`, `evaluate` → `Diagnostic[]`. Output schemas mirror core entity input schemas; every op validated with `entitySchemaFor` before it enters the ChangeSet.
- Acceptance: tests with recorded model responses; malformed ops are dropped with a note, never applied.
- Verify: `pnpm --filter @agent-blueprint/ai test`
- Built: `assembleChangeSet` is the one gate between an answer and a Blueprint — schema, unique ids, reference resolution (a renamed id is followed only when nothing else took the original), deterministic grid layout for generated workflows, attachment computed rather than asked for, and a note for everything dropped. Lists of artifacts are tolerant per element so one bad field costs one artifact, not the answer. `createWorkflowFor` applies its own proposal to a throwaway Blueprint and hands new `BP-WF-*` findings back for exactly one second attempt. Recordings of real model output live in `packages/ai/tests/__recordings__`, each carrying at least one thing the model got wrong.

### P6-05 AI settings UI and optional proxy (done)

- Package: `apps/web/src/app/settings/*`, `app/api/ai/proxy/route.ts`
- Depends on: P6-01
- Description: Provider preset picker, base URL, key, model, probe button, storage choice (session vs local with warning banner per docs/08). Proxy route streams to the configured base URL for CORS-blocked local endpoints; key in a request header only; no logging.
- Acceptance: settings persist per docs/08; proxy tested with a mocked upstream; key never appears in persisted blueprint state.
- Verify: `pnpm --filter web test`
- Built: `apps/web/src/lib/credentials.ts` is the only module in the app that touches a secret — session by default, browser storage on request with the warning shown before anything is written, and a write to one place removing the copy in the other. Save-and-test really probes the endpoint and stores what it found about schema support, so no later call has to rediscover it. The relay at `/api/ai/proxy` forwards the credential under its own header name and refuses any host the deployment did not allow (`AI_PROXY_ALLOWED_HOSTS`, localhost by default). `.env.example` documents both settings.

### P6-06 ChangeSet review UI (done)

- Package: `apps/web/src/components/ai/changeset-review/*`
- Depends on: P3-03
- Description: Git-style review: op list (+ ~ −), per-field diffs (`diff` library), accept all / individual / reject / edit before apply / regenerate; applies via `applyChangeSet` with accepted ids; rejected ops explained.
- Acceptance: Playwright with a stubbed AI: accept two of three ops.
- Verify: `pnpm --filter web test:e2e`

### P6-07 Assistant panel, context awareness, quick actions (done)

- Depends on: P6-04, P6-06
- Description: ⌘/ panel; context = current view/selection; quick actions from docs/07; "Generate first draft with AI" in the wizard; "Turn this into reusable knowledge" (compound) entry that takes pasted notes.
- Acceptance: Playwright with stubbed AI for improve-skill and generate-blueprint flows.
- Verify: `pnpm --filter web test:e2e`
- Built: the assistant is a dialog on ⌘/, the top bar and every palette AI entry, offering the nine operations grouped by what they act on. Every ChangeSet — assistant, wizard draft, Compound — goes through one review that diffs per field, states what the operation could not honour, and lets a proposal be edited as the file it would become before it is applied. Step 1 of the wizard gained _Draft this with AI_. Playwright covers the compound flow (accept two of three), improve-skill, generate-blueprint in the wizard, finding navigation, and the no-endpoint path.

### P6-08 AI-assisted evaluation and contradictions (done)

- Depends on: P6-04, P5-02
- Description: Evaluation view gains "Run AI analysis": contradictions and `ai-judged` requirement checks merged as diagnostics with `data.source: 'ai'`.
- Acceptance: unit test merging; UI badge distinguishes AI findings.
- Verify: `pnpm --filter web test`
- Built: a new `judgeRequirements` operation answers the `ai-judged` checks core reports as skipped, emitting `BP-AI-REQ-001` for the ones it will not pass. The evaluation view's **Run AI analysis** merges those and the contradictions into the dimensions they belong beside, deduplicated against the validator's own findings, badged `AI` by `DiagnosticRow`, and deliberately excluded from the score.

### P6-09 Live model check (done)

- Depends on: P6-01..07
- Description: Manual verification against OpenAI and a local Ollama model, recorded in `docs/06-ai-layer.md` (model, date, outcome).
- Acceptance: both generate a blueprint from the brief in docs/00 §end-to-end with zero rejected ops.
- Verify: `AI_TEST_BASE_URL=… AI_TEST_MODEL=… pnpm --filter @agent-blueprint/ai test:live`
- Run against four endpoint implementations and seven models, local and hosted. Most pass all three checks, including a whole Blueprint that applies with no rejected ops and no dangling references. The exceptions were a model too slow to finish the largest operation inside ten minutes, one loaded with a context smaller than the request, and a hosted free tier too small to run the suite. Results and the seven bugs it found are in docs/06. OpenAI has not been run.

### P6-10 A configurable request timeout (done)

- Package: `apps/web/src/lib/ai/settings.ts`, `packages/ai/src/client/*`
- Depends on: P6-05
- Description: `AIClientConfig.timeoutMs` defaults to 120 000, which is right for a hosted API and too short for a local model drafting a whole Blueprint — measured cases exceeded it, and the user's only signal is "No answer within 120s". The endpoint form should offer the timeout, and the default should probably follow the preset (local presets longer than hosted ones).
- Acceptance: the timeout is part of the stored settings and reaches the client; a local preset defaults higher than a hosted one.
- Verify: `pnpm --filter web test settings`
- Built: `timeoutMs` is a field of the preset, so the number lives with the thing that knows it — hosted endpoints keep 120s, the local ones wait ten minutes. Settings carries it, the endpoint form offers it in seconds, and choosing a preset re-seeds it. Settings stored before the field existed fall back to the default rather than to zero.
- Found by: the P6-09 live check.

### P6-11 Cancelling a request in flight (done)

- Package: `apps/web/src/components/ai/*`
- Depends on: P6-07
- Description: `AIClient` threads an `AbortSignal` through every call, and nothing in the UI ever passes one. A whole-Blueprint draft against a local model can run for minutes with no way to stop it but closing the panel, which leaves the request running. The assistant and the evaluation view should hold an `AbortController` and offer Stop while a request is in flight.
- Acceptance: a request in flight can be cancelled; the panel returns to its idle state and reports nothing as an error.
- Verify: `pnpm --filter web test views`
- Built: the assistant and the evaluation view each hold an `AbortController`, pass its signal through `OperationDeps.structured`, and offer Stop while a request is running. Closing the panel or leaving the view aborts too, which is what used to leave a local model working for minutes on an answer nobody was waiting for.
- Stopping is reported as a decision rather than a failure, and that needed care in two places: the evaluation view settles its two questions rather than awaiting them together, so a cancellation arrives as a rejected outcome and never reaches the catch. The first version of the fix missed it and told the user their own decision had failed; the test caught it.
- Found by: the P6-09 review.

### P6-12 Show what a model decided about an `ai-judged` check (done)

- Package: `apps/web/src/components/views/evaluation-view.tsx`
- Depends on: P6-08
- Description: `judgeRequirements` returns a verdict per check, and only the failures become diagnostics. The passes are dropped, so a check a model has judged and passed still displays as `skipped` in the requirements list — the one place a reader looks to see whether a requirement holds. The view should carry the verdicts and show them on the check.
- Acceptance: a passed `ai-judged` check shows as passed, badged as a model's judgement rather than a rule's.
- Verify: `pnpm --filter web test views`
- Built: the view keeps the verdicts, not only the diagnostics, and a judged check shows the verdict with its rationale on hover and a badge saying a model decided it. Verdicts are dropped when the Blueprint changes, on the same terms as the findings: a verdict is about the Blueprint it was shown.
- Found by: the P6-09 review.

## P7 — GitHub

### P7-01 Auth: PAT and OAuth (done)

- Package: `apps/web/src/lib/github/auth.ts`, `app/api/github/oauth/{start,callback}/route.ts`
- Depends on: P3-01
- Description: PAT entry (fine-grained scopes explained); OAuth start/callback when `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are set; token to the client only; stored in sessionStorage by default.
- Acceptance: routes tested with mocked GitHub; token absent from server logs and persisted state.
- Verify: `pnpm --filter web test`
- Built: a Settings card that takes a token and proves it, by asking GitHub who it belongs to before storing anything; sign-in through the deployment's OAuth app when it has one, delivered to the opener by same-origin `postMessage` and kept nowhere on the server. The transport is `fetch` rather than Octokit (ADR-23), with every error constructed by hand so no request header can reach a message or a stack. A fine-grained token's access is reported as unknown rather than absent: GitHub publishes no scopes for one, and a cross beside a working token would be a lie.

### P7-02 Repository and branch selection (done)

- Depends on: P7-01
- Description: Octokit: list orgs/repos, create repo, list/create branch.
- Acceptance: mocked tests.
- Verify: `pnpm --filter web test`
- Built: `lib/github/repos.ts` over the `fetch` client (ADR-23 replaces Octokit here), reached from the push dialog: a repository GitHub has nothing at can be created from there, empty and private by default, and whether it belongs to the account or to an organisation is already in what was typed. Creating a branch has no function of its own — a push to a branch that does not exist writes the ref itself. Listing asks for collaborator and organisation repositories, not only owned ones, and pages by GitHub's `Link` header rather than by counting. Two things are read from GitHub rather than assumed: whether the token may push here (`permissions`, since a visible repository is not a writable one), and whether the repository has any commits at all — a new one's default branch does not exist yet, which the push path treats as the ordinary first-commit case. Creation is deliberately `auto_init: false`, so the Blueprint is the first commit rather than a merge question. `parseRepoRef` accepts a browser URL, a clone URL or `owner/name`.

### P7-03 Preview diff against remote tree (done)

- Depends on: P7-02, P2-03
- Description: `GitHubTreeFs` (read-only `VirtualFs` over the branch tree); compute added/modified/deleted for `blueprint/` + owned paths; unowned conflicts listed and skipped unless opted in.
- Acceptance: tests with a mocked tree; second push after no change yields an empty diff.
- Verify: `pnpm --filter web test`
- Built: `GitHubTreeFs` reads a branch as a `VirtualFs`, and `planPush` runs the compiler's own `writeCompiled` over a recording file system with that branch behind it — so ownership, staleness and "never overwrite what we did not write" are the same code that governs writing to a folder, not a second implementation of it. Content is compared by Git's own blob hash, computed locally, so a file the branch already has byte for byte is never downloaded: an unchanged project plans in one request. A truncated tree listing is carried through to the UI rather than passed off as complete.

### P7-04 Atomic push (done)

- Depends on: P7-03
- Description: Git Data API: blobs → tree → commit → update ref, one commit, user-supplied message; progress and error UI.
- Acceptance: mocked test; manual push of the fixture to a test repo recorded in the PR.
- Verify: `pnpm --filter web test`
- Built: one tree, one commit, one move of the branch — the Contents API would write a commit per file and leave half a Blueprint behind on a failure. The branch is moved without `force`, so a push whose parent is no longer the head is refused rather than winning a race with whoever pushed meanwhile. The dialog previews before it offers a button: every path, the compiler's errors (which block), files this app did not write (skipped until each is ticked), and anything in the content shaped like a credential (blocks until each is ticked, shown masked — a screenshot of the warning must not be the leak). A manual push against a real repository has not been run; the checks are the mocked ones.

### P7-06 Scan on export, not only on push (done)

- Package: `apps/web/src/components/views/export-view.tsx`
- Depends on: P7-04
- Description: `scanForSecrets` runs before a push (P7-04) but not before the ZIP export, although `docs/08-security.md` claims both. Either wire the same scan and per-finding override into the export view, or correct the document. The scan is the cheap half; the per-finding override UI is the work, and it now exists in the push dialog to copy.
- Acceptance: a Blueprint carrying something key-shaped blocks the ZIP download until the finding is accepted; the fixture exports untouched.
- Verify: `pnpm --filter web test`
- Found by: building P7-04, which found docs/08 claiming a scan on export that was never built.
- Built: the export view runs the same scan over the same files and blocks the download until every finding is accepted. Rather than a second implementation, the findings list, the per-finding override and the rule that nothing proceeds until each is ticked moved into one component both surfaces use, so they cannot drift apart. docs/08 no longer describes a scan that does not happen.

### P7-05 Open/clone from GitHub (done)

- Depends on: P7-03
- Description: Dashboard "GitHub" opens a repo's `blueprint/` into a project (read via tree, saved locally).
- Acceptance: Playwright with mocked GitHub.
- Verify: `pnpm --filter web test:e2e`
- Built: **Open from GitHub** on the dashboard reads the repository's `blueprint/` directory and hands the files to the import path a ZIP already takes — same reader, same diagnostics, same "nothing is stored until Open is pressed". Only the source is read: everything at the repository root is compiler output and is rebuilt on open, and the build manifest is left behind because it describes that repository rather than this copy. A repository with no `blueprint/blueprint.yaml` is told so plainly instead of opening as an empty project.

## P8 — Hardening

### P8-01 Full Copilot adapter (done)

- Package: `packages/exporters/src/copilot/`
- Depends on: P2
- Description: `.github/agents/*.agent.md`, `.github/instructions/*.instructions.md` (`applyTo` from rule paths and skill activation), `.github/prompts/*.prompt.md` for workflows, `.github/hooks/*.json`. Goldens.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: Copilot has its own adapter instead of the portable artifact set. Non-primary agents are custom agent files with a tool allowlist derived from their tools and permissions, and an `agents` list from `delegation.canDelegateTo`. Rules with globs are `applyTo` instruction files, so they load for matching files instead of sitting in context always. Workflows keep their orchestration skill and gain a `/`-invocable prompt file that runs it. Hooks, gates and hook-enforced laws compile to `.github/hooks/blueprint.json` with a bash and a PowerShell command each, and a gate refuses the stop by printing a decision when its command fails. MCP tools configure the editor in `.vscode/mcp.json`, names of environment variables only.
- Not built, and reported instead: `handoffs[]` (it hangs off an agent file while delegate steps hang off a workflow, and the primary agent has no agent file); per-command permission patterns (no Copilot syntax expresses them, and a `preToolUse` script that parsed tool arguments would be the compiler inventing one that fails closed); the `prompt` handler type (its payload field is undocumented, so checks print a reminder as they do on Codex). `permissions` moved from `adapted` to `limited` in the capability matrix, which is what it was already doing.

### P8-02 Full OpenCode adapter (done)

- Package: `packages/exporters/src/opencode/`
- Depends on: P2
- Description: `opencode.json` (agents with mode/model/permission lowering, commands for workflows), `.opencode/agents/*.md`, `.opencode/commands/*.md`. Goldens.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: OpenCode is the one target whose permission model is as expressive as the Blueprint's, so this is the adapter that loses the least. `opencode.json` carries the primary agent's permissions as an allow/ask/deny block with command and path patterns, plus `mcp` servers and an `instructions` entry for loose references. Non-primary agents become `mode: subagent` files with their own permission block. Workflows become `/`-invocable commands that run the orchestration skill. Rules whose globs are plain directories become a nested `AGENTS.md`, byte-identical to the one Codex emits, so the two targets share one file.
- The care went into order: OpenCode reads a pattern object last-match-wins, so the catch-all is written first, the derived rules next and the author's own patterns last. Canonical JSON would have sorted the keys and silently inverted the precedence, so the config is written with `stableJson` and a test asserts the order in the serialized bytes.
- Not built, and reported instead: hooks and gates, which need a TypeScript plugin (P8-10); a primary agent file and `default_agent`, because `AGENTS.md` already carries that persona and a second copy would be in context twice; `.opencode/rules/` plus `instructions`, because `instructions` adds always-loaded files rather than scoping them. `permissions` moved from `adapted` to `native`.

### P8-12 Review of P8 (done)

- Package: `packages/exporters`, `apps/web`
- Depends on: P8-01 to P8-09
- Description: Read everything P8 built, looking for unhandled cases, unused code and claims that do not hold.
- Verify: `pnpm check`
- Found three real defects, all in the permission and storage work, none caught by the suites that existed:
  - **Pi compiled an unconstrained agent into a crippled one.** An agent that declares no permissions is not an agent that denies everything, but `defaultTools` was derived the same way for both, and `defaultTools: []` means _no built-in tools_ to Pi. A Blueprint that simply never mentioned permissions produced an agent that could not read a file. The key is omitted now, which is what "unspecified" means.
  - **OpenCode put a path where a command goes.** An `fs.delete` pattern is a path glob; it was being written into the `bash` rules, where it matches no command ever while reading as though the rule were honoured. Patterns whose operation has no shape in OpenCode — `fs.delete`, `net.*`, `mcp` — are reported now instead.
  - **The folder tier still read every file as text**, so a binary asset opened from disk came back decoded and saving wrote that back over it. This is the one P8-04 was supposed to make impossible, and the reason it survived is worth keeping: the union type makes _consuming_ a value without handling bytes a compile error, but a string is a perfectly good `ProjectFile`, so _producing_ one is not. Reading is the direction the type system does not check.
- Also: un-exported three symbols nothing outside their module read, and added a check that measures every severity colour pair directly rather than relying on a page happening to render one. That check passes — the suspicion behind it was wrong — but the sweep only ever measured the success badge, because the starter it sweeps is clean.

### P8-10 OpenCode hook plugin

- Package: `packages/exporters/src/opencode/`
- Depends on: P8-02
- Description: Generate `.opencode/plugins/blueprint-hooks.ts` so hooks and gates are enforced rather than described. The lowering table is in `docs/harness/opencode.md`; what is missing is not the mapping but confidence in the runtime: the plugin receives Bun's `$`, and the exact call for a command held in a string, its non-zero-exit handling, and the shape of the `client` message a gate would post are not settled by the sources we have. The file is auto-loaded at session start, so a signature error breaks every session — verify against a running OpenCode before generating it.
- Acceptance: hooks and gates from the fixture produce a plugin that loads in a real OpenCode session; a gate that fails blocks; goldens.
- Found by: building P8-02.

### P8-03 Full Pi adapter (done)

- Package: `packages/exporters/src/pi/`
- Depends on: P2
- Description: `.pi/prompts/*.md` for workflows, `.pi/settings.json` (`defaultTools` from permissions), extension stub for hooks documented as adapted. Goldens.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: workflows become `/`-invocable prompt templates that run the orchestration skill; `.pi/settings.json` carries `defaultTools` derived from the primary agent's permissions; critical Iron Laws are appended to the system prompt through `.pi/APPEND_SYSTEM.md`, the strongest placement Pi offers; and rules whose globs are plain directories become the same nested `AGENTS.md` Codex and OpenCode emit. A non-primary agent becomes a persona prompt that takes the task as `$ARGUMENTS`, with an `unsupported` issue beside it saying what a shared context costs.
- Not built, and reported instead: the extension. The task asked for a stub, and a stub is the wrong shape — a generated file is compiler-owned, so anything a user filled in would be overwritten on the next export. Handing someone a starting point their work disappears from is worse than handing them nothing. Recorded as P8-11. `permissions` moved from `adapted` to `limited`, which is what it was already doing: Pi has no `ask`, no per-command rules and no network tool.

### P8-11 Pi hook extension

- Package: `packages/exporters/src/pi/`
- Depends on: P8-03
- Description: Generate `.pi/extensions/blueprint-hooks.ts` so hooks and gates are enforced rather than described. The event lowering table is in `docs/harness/pi.md` and its own note says the payloads need re-verifying against the current `docs/extensions.md`. Decide first whether a generated extension should be compiler-owned at all, or whether it belongs outside the manifest so a user can extend it.
- Acceptance: hooks and gates from the fixture produce an extension that loads in a real Pi session; a gate that fails blocks the turn; goldens.
- Found by: building P8-03.

### P8-04 Binary assets in projects (done)

- Package: `packages/core/src/project/`, `packages/exporters`, `apps/web/src/lib/{storage,github}`
- Depends on: P0, P7-04
- Description: `VirtualFs` gains `readBinary`/`writeBinary`; skill `assets/` may be binary; ZIP and GitHub backends updated.
- Verify: `pnpm check`
- Built: `VirtualFs` gained `readBinary`/`writeBinary`, and `ProjectFile = string | Uint8Array` is now the value type of every file map — `renderProjectFiles`, `ProjectFiles`, `GeneratedFile.content`. A union rather than a second field, so that a backend which ignores the byte case is a compile error instead of a file quietly lost. A skill resource carries `encoding: 'utf8' | 'base64'`, because the model has to stay JSON-serializable for ChangeSets, undo history and IndexedDB, while the bytes on disk stay the bytes. The reader decides from the content, not the extension: valid UTF-8 with no NUL byte is text. Every tier carries it — ZIP, IndexedDB, File System Access, the compiler, the build manifest, and the push, where bytes become their own blob first because a tree item's inline `content` is UTF-8.
- Closed the consequence P7's review recorded: a push deletes anything under `blueprint/` the project writer does not produce, and a binary asset used to be exactly such a file. The writer produces it now, so it survives; a test asserts the deletion that would otherwise have happened, and another asserts that a genuinely stale file is still removed.
- Found while building it: the secret scan reads lines, so it skips a file that is not text rather than searching it. Recorded in docs/08 rather than pretended otherwise.

### P8-05 Migrations UI (done)

- Package: `packages/core/src/project/read.ts`, `apps/web/src/lib/storage`, `apps/web/src/components/dashboard/import-dialog.tsx`
- Depends on: P3-11
- Description: Opening an older project shows the migration path and a preview diff before saving.
- Verify: `pnpm check`
- Built: `readProject` now returns the `migrations` it ran alongside `sourceSchemaVersion`, and the import dialog lists them with each migration's own description. `previewImport` also computes the **rewrite preview**: the files that arrived compared with what the writer would produce, restricted to the source directory. The dialog says how many source files the first save would rewrite, names them, and says that opening changes nothing — the same information `git status` would show afterwards, offered beforehand.
- Fixed on the way: `ProjectReadError` declared an `UNSUPPORTED_SCHEMA_VERSION` code that nothing ever threw. `migrateManifest` threw `UnsupportedSchemaVersionError` instead, which escaped `parseProject` untranslated and reached the user as a raw string. `readProject` translates it now, so a caller that handles `ProjectReadError` handles every fatal read. The test that should have caught this accepted either error type; it asserts the contract now.
- Honest about scope: `MIGRATIONS` is empty — there is one schema version — so the migration list has nothing to show until there is a schema change, and the dialog test drives it directly. The rewrite preview is reachable today and is what makes this task worth having now.

### P8-06 Accessibility and keyboard pass (done)

- Package: `apps/web`
- Depends on: P3 to P7
- Description: Focus order, ARIA on panels and graph, reduced motion, contrast in both themes; axe checks in Playwright.
- Verify: `pnpm --filter web test:e2e accessibility`
- Built: `e2e/accessibility.spec.ts` runs axe over the dashboard, workspace, settings, wizard, the four views and an open dialog, in both themes, against WCAG 2.1 AA — then drives the same surfaces from the keyboard alone and asserts where focus ended up. Details in docs/07 under "Accessibility".
- Found and fixed: three light-theme colours below 4.5:1 on their own muted grounds (`--accent` 4.31, `--success` 4.01, `--warning` 3.22); the workspace route having no title of its own, so the document was briefly untitled during the client transition; no `main` or `complementary` landmark in the shell and no skip link; no reduced-motion rule at all.
- The real bug: **focus was not returned to what opened a dialog.** Radix restores focus to the `DialogTrigger`, and every dialog here is opened by state, so closing left focus on `<body>` — a keyboard user lost their place in the page on every Escape. Fixed in the dialog root, which now remembers what had focus while it was closed and restores it from `onCloseAutoFocus`.
- Note for whoever runs these next: the Playwright config reuses an existing server on port 3100. A stray `next start` left running will serve a stale build and quietly hide every change; kill it before trusting a green run.

### P8-07 Performance (done)

- Package: `packages/fixtures`, `packages/core`, `apps/web`
- Depends on: P3 to P7
- Description: Stress fixture with 200 artifacts; validation under 100 ms, graph render under 500 ms; memoized selectors.
- Verify: `pnpm --filter @agent-blueprint/core test performance` and `pnpm --filter web test:e2e performance`
- Built: `stressProjectFiles({ artifacts })` generates a project of any size instead of checking one in — deterministic, and parameterised so the same code answers "is it fast enough?" and "is it still linear?". Core budgets are measured directly; the browser ones (import, graph draw, typing latency) in Playwright. Numbers and budgets are in docs/07 under "Performance".
- Found and fixed: evaluation tokenized each skill description **inside** the pairwise redundancy loop, so the same text was parsed once per other skill — quadratic comparisons doing quadratic work. At 800 artifacts that was 42 ms; hoisting the tokenization made it 10 ms and the curve linear. The comparison is still quadratic; the work per comparison is not.
- Nothing else needed changing: the health bar, evaluation view, export preview, inspector relations and overview graph were already memoized on the Blueprint and the diagnostics. Two of the tests compare 100 artifacts against 400 rather than asserting a constant, because something quadratic passes at 200 and falls over at 600.
- Later (P9): the browser budgets became flaky as the suite grew, because a wall clock shared with four other Chromium workers measures the machine, not the app — the same graph drew in 600ms or 1100ms depending on what else was running. `performance.spec.ts` is now its own Playwright project, `workers: 1`, depending on the main one, so it runs alone after everything else has let go of the CPU. The budgets themselves are unchanged.

### P8-08 Vercel deployment and docs refresh (done)

- Package: repository root, `apps/web`, `docs/`
- Depends on: P8-01 to P8-07
- Description: `vercel.json`, env var docs, deploy preview; every doc reviewed against code; README with screenshots.
- Verify: `pnpm check`, and `pnpm turbo run build --filter=web...` for the command Vercel runs
- Built: `vercel.json` carries the monorepo install and build commands, so importing the repository needs no further setup; the build command was run locally rather than assumed. `apps/web/.env.example` documents all four variables — it previously listed one of them — and the README explains what each enables and that every one is optional.
- The README was rewritten. It still said "Phase P0 is complete", which was the front door of the repository describing a state eight phases out of date. Screenshots are generated by `pnpm --filter web screenshots` rather than captured by hand: a hand-captured screenshot goes stale silently, and the first run of the script caught the overview graph mid-layout, which is exactly the kind of thing a manual capture ships without noticing.
- The substantial half was the docs review, and it is now mechanical. `packages/core/tests/docs.test.ts` fails when a document calls a finished phase "planned", reading the roadmap's own status table for what is finished, so it stays correct as phases land. It found **23** stale claims across seven documents — including docs/01 describing `packages/ai` as a placeholder with a smoke test, and docs/05 describing all of evaluation as unbuilt. That is the drift that costs the most, because nothing breaks: the next person reads the specification and builds what already exists.
- Not done, and not doable from here: an actual deploy preview. The configuration is right and the build command verified; whether the deployment works can only be settled by deploying it.

### P8-09 End-to-end suite (done)

- Package: `apps/web/e2e/story.spec.ts`
- Depends on: P3 to P7
- Description: Playwright covering the docs/00 end-to-end story: template → edit → validate → export → (mocked) push.
- Verify: `pnpm --filter web test:e2e story`
- Built: one test walks the whole story in a single session — template, graph, edit, save, validate, compile, push — because every step is already covered in isolation and a product can pass all of those and still not hold together. GitHub is answered locally, and the mock records the tree it was given, so the test asserts the commit carried **exactly** the paths the preview named, on the branch that was typed.
- It also asserts the promises docs/00 makes under "Quality bar", because a promise nothing checks is a promise that quietly stops being true: a health-bar count always has findings behind it, saving twice produces byte-identical archives, and every harness limitation is explained rather than dropped.
- Found and fixed: **a link to a view did not survive a reload.** Opening `?view=export` bounced to the overview graph, because the effect that writes the URL from the store compared against values from the render before the effect that reads the URL had applied them — so the store's default won a race it should always lose. docs/07 claims `?view=` and `&id=` make an artifact linkable; clicking a link worked, reloading or sharing one did not. Three tests now cover it.

Acceptance for P8 tasks: goldens or tests as in the corresponding P2/P3 tasks; each task updates its doc.

## P9 — Interface

Everything so far has been about whether the product is correct. This phase is about whether it
is pleasant: a mark instead of a word, a way back, one step instead of ten, a field that says
what it wants, a cursor that behaves, and a page that teaches.

Nothing here changes the model, the compiler or the project format. Where a task removes
something, it says what and where that thing still exists.

### P9-01 The logo (done)

- Package: `apps/web/public`, `apps/web/src/app/layout.tsx`, `apps/web/src/components/layout/top-bar.tsx`, `apps/web/src/components/dashboard/dashboard.tsx`, `apps/web/src/components/settings/settings.tsx`, `apps/web/src/components/wizard/wizard.tsx`
- Depends on: nothing
- Description: The brand is the words "Agent Blueprint" in four places and nothing in the browser tab. Add the supplied mark: `apps/web/src/app/icon.png` for the favicon (Next reads that filename), and a `Logo` component used by every header, so the mark is defined once and the four headers stop each inventing their own.
- Two sizes, because the supplied file is a square mark above a wordmark and a top bar is 44px tall: the **mark alone** for the top bar and the favicon, the **full lockup** for the dashboard hero and the tutorial. See the open question below.
- The file is 680 KB, which is the whole page weight again. Serve it through `next/image` so it is resized and cached, and keep the raw asset out of the critical path.
- Acceptance: the mark appears in the tab, the top bar, the dashboard, settings and the wizard; the dashboard's largest contentful paint does not get worse; `pnpm build` reports no new warnings.
- Verify: `pnpm --filter web test:e2e accessibility` (the mark needs an accessible name, and an image with no `alt` is a violation), plus `pnpm --filter web screenshots`.
- Built: one `Logo` in `apps/web/src/components/layout/logo.tsx`, used by all four headers. Every placement goes through `next/image` at the size it actually paints; the dashboard's lockup is not preloaded, so the heading is still what the browser races to show.
- The open question below is answered by making the missing file rather than working around it. `pnpm --filter web logo` runs `e2e/logo-assets.spec.ts`, which drives a browser over `apps/web/brand/agent-blueprint.png` and cuts three assets from it: the square padded favicon at `src/app/icon.png`, and `src/assets/logo-mark.png` and `logo-lockup.png`, each tight to its subject. The rectangles are measured from the artwork's own alpha channel and recorded in the file, so a new artwork is one command and one re-measurement. `Logo` reads each asset's height from the static import rather than a constant, so it holds no crop and no aspect ratio of its own.
- The generator is excluded from `test:e2e` alongside the screenshot script, for the same reason: it writes into the repository.
- `e2e/header.spec.ts` asserts the favicon route really answers with a PNG, that the dashboard's lockup is served through the optimizer rather than whole, and that the mark is `alt=""` everywhere a labelled link already names the product — the case axe cannot fail on, because an image that never arrives has no violation either.

### P9-02 Getting back (done)

- Package: `apps/web/src/components/layout/`, `apps/web/src/app/settings/page.tsx`, `apps/web/src/app/new/page.tsx`
- Depends on: P9-01
- Description: `/settings` and `/new` are dead ends. The workspace has a way home — the wordmark links to `/` — and the other two routes have neither that nor a back control, so the browser's back button is the only way out, and after a redirect it is the wrong way out.
- One `PageHeader` with the logo, the page's title, and a back control that returns to the page the user came from when that page is inside the app, and to `/` when it is not. A back button that guesses wrong is worse than none: arriving at `/settings` from a bookmark must go to `/`, not to whatever was in the history before.
- Acceptance: every route except `/` offers a way back; back from `/settings` opened directly lands on `/`; back from `/settings` opened out of the workspace returns to that project.
- Verify: `pnpm --filter web test:e2e story`
- Built: `PageHeader` (logo, back control, title, theme toggle) is the header for `/settings` and `/new`; the workspace keeps its own top bar, whose wordmark still links home and now carries the mark.
- The question the task calls out — is the page behind this one ours? — is answered by counting, not by guessing. `NavigationTrail` sits in the root layout and increments a **module-level** counter whenever the pathname changes. The app is one document, so a move between two of its routes always goes through the client router and never reloads the page; a full document load re-evaluates the module and resets the count to zero. A count above zero therefore _proves_ the previous history entry was rendered by this app. None of the obvious signals can do that: `document.referrer` is fixed at document load and never updated by the App Router, `history.length` counts entries from other sites and never shrinks, and `window.history.state` carries the router's bookkeeping under private keys.
- The back control is a real `<a href="/">` and only the plain left click is intercepted, so ⌘-click, middle-click and "copy link address" all get `/`, and the fallback is the destination the browser was already showing.
- The honest cost: reloading `/settings` forgets the project it was opened from and offers `/` instead. Going somewhere sensible beats going somewhere surprising, and the alternative was a control that sometimes leaves the app.
- `e2e/header.spec.ts` covers both halves: `/settings` reached from a project returns to that project, and `/settings` opened after a page on another origin goes to `/` rather than back to it.

### P9-03 One step to a project (done)

- Package: `apps/web/src/components/wizard/`, `apps/web/src/lib/wizard/draft.ts`, `apps/web/e2e/workspace.spec.ts`
- Depends on: P9-02
- Description: Creating a Blueprint asks ten questions before it will make anything. Collapse it to the first: name, id, description, and the AI draft — which already lives on that step — then create the project and open the workspace on it.
- The other nine steps are artifact creation, and the workspace does that better: it has the tree, the inspector, "new from template" and the health bar, none of which the wizard has. Two things only the later steps offer, and where each goes instead: **targets** are already toggleable from the command palette and the compatibility view, and a new project keeps the `claude-code` + `codex` defaults; **the evaluate step** is the evaluation view, which scores the real project rather than a draft.
- `WIZARD_STEPS`, the step navigation, `blockingReason` for the removed steps and the nine step bodies all go. Deleting them is the point: a second, worse artifact editor is a second thing to keep working.
- docs/00 §"End-to-end experience" step 2 describes the ten-step wizard and has to be rewritten, along with docs/07's wizard section. The `creation wizard` e2e block asserts "walks the ten steps".
- Acceptance: `/new` is one screen; naming a project and pressing Create opens the workspace with that project stored; the AI draft still works from it; no route still references a removed step.
- Verify: `pnpm --filter web test:e2e`, `pnpm check`
- Built: `/new` is `PageHeader`, three fields and _Draft this with AI_, and Create. `steps.tsx` is gone — 514 lines — along with `WIZARD_STEPS`, `WizardStepId`, the stepper, `setAgent`, `addFromTemplate`, `addBlank`, `removeArtifact`, `primaryAgent` and the linking table behind them. `blockingReason` no longer takes a step; the one thing that blocks is a name.
- A project is now created with nothing in it, and that is the point: the artifacts are added in the editor, from the tree and the palette, where the inspector and the health bar can see them. The e2e case walks it — create, palette, Create Agent, save, reload.
- Found: an empty Blueprint scores **93** and the health bar reports "No findings. This Blueprint is clean." Nothing in the validator says a Blueprint with no agents is unfinished, because until now the wizard made that state unreachable. See P9-07.

### P9-07 A new Blueprint is not clean

- Package: `packages/core/src/validation/rules/`, `packages/core/src/evaluation/`
- Depends on: P9-03
- Description: P9-03 makes an empty Blueprint the ordinary starting point, and the trust surfaces say it is fine: health 93, no errors, no warnings, "This Blueprint is clean." The three infos it does report are about gates and hooks. Nothing says there is no agent, no skill and no primary agent — the three things that make a Blueprint compile into anything at all.
- The scoring reads the same way: a dimension with nothing in it to penalise scores near full marks, so an empty project outscores a real one with a few honest warnings. A score that rewards emptiness is worse than no score.
- Structural rules for the missing entities, and a coverage floor that an empty dimension cannot pass. Both belong in `core`, where every other rule is, and both need a diagnostic code and a docs/05 entry.
- Acceptance: a Blueprint straight out of `/new` reports what it is missing, and scores well below one that is finished; the fixture and the ten starters keep their current scores; every new code is in the catalogue.
- Verify: `pnpm --filter @agent-blueprint/core test`, `pnpm --filter web test:e2e`

### P9-08 A slow model is not a broken one (done)

- Package: `packages/ai/src/structured.ts`, `packages/ai/src/client/`, `apps/web/src/lib/ai/settings.ts`, `apps/web/src/components/wizard/ai-draft.tsx`
- Depends on: nothing
- Description: "Draft this with AI" failed with **No answer within 120s** against a local model that was working perfectly, showed a spinner and nothing else while it waited, and could not be stopped. Reported from use.
- The cause was not the number. A completion that is not streamed sends nothing until the model has finished, so `timeoutMs` — which measures time to the first byte — was really a cap on how long the model was allowed to think. Raising it would only have moved the cliff, and would have left the two-minute spinner exactly as uninformative.
- Built: `structured()` streams by default. The timeout is now **silence** — the watchdog restarts on every chunk, so a model may take as long as it likes so long as it keeps writing — and the error says which kind it was, carrying the partial answer. `onProgress` reports characters received, so the wait shows the answer arriving rather than a spinner.
- Built: the draft has a **Stop** button and aborts on unmount, matching the assistant and the evaluation view; all three now go through one `structuredFor` helper, so the endpoint's settings reach every surface rather than each remembering separately.
- Built: **Stream the answer** in Settings, for an endpoint that cannot, which makes the wait mean the whole answer again and says so. Hosted presets now start at 300s rather than 120s: with streaming that only has to cover the pause before the first token, and a hosted reasoning model can think for minutes.
- Deliberately not done: an automatic fallback to a single request when a stream fails. It cannot tell an endpoint that will not stream from a rejected schema, a refused key or a rate limit — the first draft of this change swallowed all three, and the existing schema-rejection test caught it. The switch above is the honest version.
- The test fakes on both sides now answer a streaming request as a stream. A fake that replies to `stream: true` with a whole completion is answering in a shape no endpoint produces, and hides which path the code took.
- Verify: `pnpm check`, and `packages/ai/tests/live.test.ts` against a real slow endpoint.

### P9-04 What this field is for (done)

- Package: `apps/web/src/components/editors/fields.tsx`, `apps/web/src/components/editors/entity-form.tsx`
- Depends on: nothing
- Description: Every field already carries a sentence of help, printed underneath it — 29 of them in `entity-form.tsx` alone. Under a form of twelve fields that is a wall of grey text that stops being read. Move it into an info icon beside the label, on the Tooltip primitive that already exists, and add to each one an **example** and a way to insert it.
- The example is the half that teaches. "One or two sentences. Harnesses use this to decide when to load the artifact." says what the field is; `Reviews Rust changes for unsafe blocks before they merge.` shows it.
- Examples belong in one map keyed by kind and field, beside the help text they extend, not scattered through the form. Inserting one must be an edit like any other: undoable, and never silently replacing something the user has already typed.
- This is not "new from template", which fills a whole artifact from the 29 artifact templates and stays as it is. This fills one field, for the person who knows what they want everywhere except here.
- Acceptance: every field with help has an info control reachable by keyboard; the example is visible without a mouse; inserting one into a field that already has content asks first; the ten starters and the fixture are unchanged.
- Verify: `pnpm --filter web test`, `pnpm --filter web test:e2e accessibility`
- Built: `Field` grew an info button beside the label, named `About <field>`, that is both a tooltip and a disclosure — the tooltip is the glance, the panel is the thing a keyboard can reach and act on, and Escape returns focus to the icon. It carries its own `TooltipProvider`, because `Field` is mounted in dialogs, in the wizard and in tests where the app shell's provider is not above it.
- Built: **Insert example** goes through the field's own `onChange`, so an insert is one ordinary edit — `upsertEntity`, one undo step. A field with content asks (**Replace** / **Cancel**) before anything is overwritten; a string list appends instead, so there is nothing to ask about.
- Built: 68 examples in one map, `apps/web/src/components/editors/field-examples.ts`, keyed `<kind>.<field>` and lifted from the fixture project and the starters, so the form suggests what the product actually ships.
- Deviation: the sentence keeps its own line where a field has no example. `help` is not always help — Settings passes the masked API key it already holds through the same prop — and hiding a live status behind an icon to gain nothing would be a regression, not a tidy-up.
- Cost, paid once: naming the button after its field put the field's own word into a second accessible name, and Playwright's `getByLabel` matches substrings, so `getByLabel('Name')` began resolving to both the input and its info button. Eighteen e2e tests broke. The names are right, so the locators became exact — which is the stricter locator anyway, and now the suite cannot be confused by a control that merely mentions a field.

### P9-05 A pointer on anything clickable

- Package: `apps/web/src/components/ui/button.tsx`, and the bare `<button>` elements in the tree, the export list, the palette and the graph
- Depends on: nothing
- Description: Tailwind v4 dropped the browser default of `cursor: pointer` on `<button>`, and nothing in this app put it back, so every button in the product shows a text caret. It is a one-line fix in the button variants and a sweep for the elements that are buttons without using the component.
- A disabled button must keep `cursor: not-allowed` rather than inheriting the pointer, or the refusals this app is careful about start looking like bugs.
- Acceptance: hovering any enabled button shows a pointer; hovering a disabled one does not; no element that is not clickable gains a pointer.
- Verify: `pnpm --filter web test:e2e` with an assertion on the computed cursor of an enabled and a disabled button.

### P9-06 A tutorial page (done)

- Package: `apps/web/src/app/tutorial/`, `apps/web/e2e/screenshots.spec.ts`
- Depends on: P9-01, P9-03
- Description: The product explains itself to someone who already knows what a Blueprint is. A `/tutorial` route walks the docs/00 story — start, describe, see the graph, connect, validate, save, compile, push — with the screenshots P8-08 already generates.
- Reuse rather than repeat: the screenshots come from `pnpm --filter web screenshots`, which drives the real app, so a page that has changed cannot leave a picture of the old one behind. Any shot the tutorial needs and the script does not take gets added to the script, never captured by hand.
- Linked from the dashboard and from the header, and it must read as useful to somebody who has not created a project yet — which means every step says what to press, not only what happens.
- Acceptance: `/tutorial` covers each step of the docs/00 story with a current screenshot; every image has an accessible description; the page works with no project stored.
- Verify: `pnpm --filter web test:e2e accessibility`, `pnpm --filter web screenshots`
- Built: `/tutorial` walks all eleven beats of the docs/00 story, each one naming the control to press before it says what happens, with fourteen screenshots. It is a server component that reads nothing — no project, no store — because the reader it exists for has not made one. Linked from the dashboard header, from `PageHeader` (which suppresses the link on the tutorial itself) and from the workspace top bar.
- Built: the screenshot script grew from six shots to fourteen and now writes to `apps/web/src/assets/screenshots`, which the page imports through `next/image` and the README links. Two beats need credentials a reader may not have, and both are shown honestly rather than staged: **Review** is a template proposing a change, the same bargain as an AI proposal without needing an endpoint, and **Improve** is the assistant saying it has no endpoint yet.
- Found and fixed, a P4-era bug the "Connect" screenshot exposed: `PanelSection`'s content wrapper was a block, so a `flex-1` child could not stretch and collapsed to its own content height. The workflow canvas was taking **416 of the 803 pixels** it was given — clipping its last step, cutting the step panel off mid-sentence, and leaving half the pane looking like empty canvas. Content that scrolls sizes itself and so never showed it. One class, plus an e2e case that measures the canvas against its pane (416 before, 735 after).
- Found and fixed: the axe sweep's `document-title` failures were a race, not a page. React takes the title down and puts it back across a client transition and a later re-render, so a scan landing in the gap reports a missing title on a page that has one before and after. The rule is now asserted with `toHaveTitle`, which retries — the same check without the race, and stronger, because it says which title.

### P9-09 Two ways to add a step, one of them misnamed (done)

- Package: `apps/web/src/components/graph/workflow/`
- Depends on: nothing
- Description: Reported from use. The workflow toolbar's **Insert a shape** inserts every step of a template, and a reader took "shape" to mean a box on a canvas, so the button looked like the way to add one step and appeared to add a dozen. The way to add one step — the palette down the left — was never found. Nothing was broken; the label was.
- Also reported: `Delete` did nothing. React Flow's default `deleteKeyCode` is `Backspace` alone, which is the Mac key and the browser's back gesture elsewhere.
- Acceptance: the toolbar button says it inserts a whole workflow and the menu says where to go for one step; `Delete` and `Backspace` both remove the selected step or connection; neither fires while a text field has the focus; the step and the edges that reached it go in one change.
- Verify: `pnpm --filter web test:e2e workspace`
- Built: **Insert a whole workflow**, with the menu's own label carrying "For a single step, use the palette on the left." The palette gained a line of its own — "One at a time. Drag one onto the canvas, or click to place it below." — because a heading reading `STEPS` above a list of step kinds is not an instruction, and the empty-canvas hint now names the delete key.
- Built: `deleteKeyCode={['Delete', 'Backspace']}`, and the panel's two delete buttons carry "Or press Delete" so the key is learnable where it is wanted. The existing single `onDelete` handler already made the step and its edges one change; a test now holds that, because the failure mode is two presses of undo and it is invisible until someone tries.

### P9-10 A finding that says what to do (done)

- Package: `packages/core/src/validation/codes.ts`, `apps/web/src/components/views/diagnostic-row.tsx`
- Depends on: nothing
- Description: Reported from use, about `BP-REQ-001`: _"Requirement 'Core .NET skills' is not satisfied … Nothing in the Blueprint meets any of its 4 checks."_ That is a complete description of the problem and no help at all, because it does not say whether the Blueprint is missing something or the checks are looking in the wrong place — and those have opposite fixes. The same is true of half the catalogue.
- Found while reading the code: `DIAGNOSTIC_CODES` has carried a `summary` per code since P1, its own comment says "Shown in the UI next to the finding", and **nothing in the app has ever imported it**. The catalogue was documentation that only the docs test read.
- Acceptance: every finding, on every surface that lists one, offers the meaning of its code and what to do about it; the guidance is defined once; a code the catalogue does not know renders no control rather than an empty one; reachable and readable from the keyboard.
- Verify: `pnpm --filter @agent-blueprint/core test`, `pnpm --filter web test`, `pnpm --filter web test:e2e workspace`
- Built: a `remedy` beside every `summary` — 62 of them, written as instructions to the person the finding is shown to, naming the control that does the work and saying why it matters where the cost of ignoring it is not obvious. `docs.test.ts` now fails a code without one, so adding a code means writing one.
- Built: `DiagnosticHelp`, dropped into the two components every findings list already went through, so the health bar, the inspector, the evaluation dimensions and the export blockers all gained it at once. Hover or focus gives the one-liner, pressing unfolds the remedy and leaves it open — the same bargain as P9-04's field help, for the same reason: a paragraph behind a hover is a paragraph a keyboard user never sees.
- Cost, paid once: a findings row used to be a single button. It cannot contain a second one, so the row is now a wrapping flex container with the navigate button, the help button, and a `basis-full` panel that drops onto its own line. The alternative was a popover, which would have covered the next finding in the list.

### P9-11 A project that opens clean and is not (done)

- Package: `apps/web/src/lib/state/workspace-store.ts`
- Depends on: nothing
- Description: Reported from use while checking P9-10: the findings were missing everywhere except the evaluation view, and came back as soon as anything was edited. Not a regression from P9-10 — a defect from P3, dated `282880a`. `load` did `diagnostics: diagnostics ?? validateBlueprint(blueprint)`, and the caller passes the **reader's** diagnostics, which for a project that reads cleanly is `[]`. An empty array is not nullish, so the fallback never ran and the whole validation pass was skipped. The health bar, the inspector and the export blockers all read the store, so all three showed nothing; the evaluation view runs its own pass, which is why it alone looked right. The first keystroke started the debounced revalidation and everything appeared at once.
- Acceptance: a project reports what is wrong with it as it opens; the reader's findings survive a revalidation, which cannot recompute them; a save retires them, since writing the files is the remedy their codes name.
- Verify: `pnpm --filter web test`, `pnpm --filter web test:e2e workspace`
- Built: one `findings(blueprint, project)` used by `load`, the debounced pass and `flushPending`, so no caller can produce a shorter list than another. `projectDiagnostics` holds the reader's half; `save` clears it, matched **by array identity rather than by project id**, because every reload uses the same id and a save in flight across one would otherwise retire findings that belong to the load after it.
- Worth recording: `workspace-store.test.ts` already had a test called _"loads a project and validates it immediately"_, and it asserted `diagnostics` was `[]`. It passed for four months because the starter it loads is clean — the assertion agreed with the bug. The new test breaks a description first, so the expected list is not the empty one.

### P9-12 Fix a finding from the finding (done)

- Package: `packages/ai/src/operations/fix-finding.ts`, `apps/web/src/components/ai/fix-finding-dialog.tsx`, `apps/web/src/components/views/diagnostic-row.tsx`
- Depends on: P9-10
- Description: Two things, reported together. P9-10's help control was an ⓘ — the same glyph an info-severity finding draws at the head of its own row, so one line said "this is an info" and "this explains it" in the same picture — and it was a bare 14px target. And the remedy it shows is instructions: if the product knows how to fix a finding well enough to write them down, it knows well enough to ask a model.
- Acceptance: the two controls are distinguishable and are real targets; a finding offers a fix only where a model could give one; the fix goes through the ordinary per-op review; the instructions sent are the ones shown.
- Verify: `pnpm --filter @agent-blueprint/ai test`, `pnpm --filter web test`, `pnpm --filter web test:e2e assistant`
- Built: a question mark for help, sparkles for the fix, both centred in a 24px target — the icons did not grow, the padding around them did. Help comes first in the tab order: understand, then act.
- Built: `fixFinding`, one operation and one prompt for the whole catalogue. The per-code steering is `remedy` — the sentence P9-10 wrote for a person, sent verbatim as the instruction. That is the design: sixty-odd behaviours out of one template, and no second catalogue of prompts to keep in step with the first. The dialog shows the sentence before it asks, because a proposal you cannot judge against the ask is one you have to take on faith.
- Built: `fixabilityOf` refuses the codes no artifact edit can clear — files on disk (`BP-PROJECT-*`), ids that need the rename refactor (`BP-ID-*`), targets and settings (`BP-TARGET-*`, `BP-AGENT-002`), the five id-collision codes — and names the control that does the job instead. Where it agrees, it narrows the output schema to the kinds that finding could need, which keeps the schema small on endpoints that read it in the prompt and is also the cheapest way to stop a model fixing something it was not asked about.
- Guarded: the same trap as `improveArtifact` — a model asked to add a description tidies the id on the way past, and a changed id is a create op beside an untouched original, which reads as a duplicate rather than as the fix. The finding's artifact keeps its id, but only when exactly one artifact of that kind came back; with two there is no way to tell which is the edit, and a note says so rather than guessing.
- Also: `Waiting` moved out of the wizard into `components/ai/waiting.tsx`. It is the right thing to show anywhere a model is being waited on, and this is the second such place.

### P9-13 Tell the model what it is actually looking at (done)

- Package: `packages/ai/src/prompts/fix-finding.v1.ts`, `packages/ai/src/operations/fix-finding.ts`, `apps/web/src/components/ai/fix-finding-dialog.tsx`
- Depends on: P9-12
- Description: Reported from use — the fix from P9-12 works some of the time. It was given the finding, the remedy and the artifact as one entry in a long context, and left to work the rest out. Almost everything it was missing was already written down somewhere in the product.
- Acceptance: the model is told what "fixed" means, where the rule looked, and which fields it may touch; the artifact is beside the ask, not only in the context; the fix is checked against the validator before the user sees it; a fix that does not clear the finding says so.
- Verify: `pnpm --filter @agent-blueprint/ai test`, `pnpm --filter web test`
- Built, five things the prompt now carries: the **invariant** the rule enforces (`ValidationRule.description`), which is the exact exit condition and therefore what "fixed" means; the diagnostic's own **`data`**, which names the step or the responsibility the rule objected to, so a nine-step workflow is not guessed at; the **fields** the code is about, which says as much by omission as by inclusion; the **artifact repeated beside the ask**, because being told "revise the skill you read four thousand tokens ago" is not the same instruction as "here it is, change this field"; and the **related artifacts in full**, so a contradiction is not rewritten from one side.
- Built: one worked example in the system prompt. Not per code — sixty would be a second catalogue — but one, because it settles the two things every code shares and no schema can state: the answer is the whole artifact with one thing different, and everything the finding did not mention comes back unchanged. This is where weaker and local models lose most.
- Built, the part that answers the complaint directly: **it checks**. The proposal is applied to a throwaway Blueprint, `validateBlueprint` runs again, and if the finding still stands the model gets one more attempt quoting the validator's own words — the same bargain `createWorkflowFor` already makes. The better of the two is kept, better meaning it clears the finding or breaks less. The review then says which happened rather than leaving the user to apply it and find out.
- Honest about what it cannot check: `BP-EVAL-*` and `BP-SAFETY-*` come from the evaluation pass, so re-running the validator proves nothing about them. Those say "not re-checked" instead of claiming success. The catalogue's own `source` field is the discriminator, so no new list.
- Built: a free-text field on the dialog. Everything else there is derived; this is the one place the person who knows the project can tell it what the catalogue could not.
- Found while wiring it: `ruleByCode` misses 27 validation codes, because one rule may emit several and it is registered under only the first — `BP-WF-002` to `BP-WF-005` all belong to the rule called `BP-WF-001`. `INVARIANT_BY_CODE` covers the fixable ones, and a test fails if a fixable validation code has an invariant from neither source.
- Kept at prompt v1 rather than copied to v2: the answer's shape did not move — same schema, same fields — and the one recording pinned to it was re-recorded in the same change, so nothing was left meaning something it no longer means.

### P9-14 Tell the model the rules before it writes, not after (done)

- Package: `packages/ai/src/prompts/house-style.ts`, `packages/ai/src/operations/check.ts`, `generate-blueprint.ts`
- Depends on: P9-13
- Description: Reported from use with a real generated Blueprint: seven skills with no `## Instructions` section, six with no `## Verification`, five Iron Laws marked for gate enforcement with no gate mentioning them, an unbounded loop, a `secret-scan` hook with no command, a requirement with no checks. Nineteen findings, and not one of them a matter of taste — each is a rule in `packages/core` with a stable code, and **the model had never been told any of them**. It was asked for "a skill" and produced a good essay about a topic, which is what the word means in ordinary English.
- Acceptance: every prompt that can write an artifact states the rules the validator will apply, for the kinds it may write and no others; the wording is precise enough to satisfy the actual check; a generated Blueprint is checked against both passes and the model gets one chance to fix what it left.
- Verify: `pnpm --filter @agent-blueprint/ai test`
- Built: `houseStyleFor(kinds)`, composed into `systemPrompt({ writes })` so no template restates it and none of them drifts. The three operations whose kind is a call-time input carry the same text beside the ask. Reporting operations pass no `writes` and spend no budget on rules they cannot follow.
- Precision was the point. `BP-LAW-011` matches the law's **name** inside the gate's own text — "wire laws to gates" would never have produced that, and "the gate must contain the law's name word for word in its name, description or a criterion description" does. Same for the two skill headings, which are matched by regular expression and so are quoted literally.
- Built: `operations/check.ts`, the shared version of what `createWorkflowFor` has done since P6 and `fixFinding` since P9-13; all three now use one `fingerprint`. `allFindings` runs **both** passes, because `BP-EVAL-*` never comes from the validator and that was most of what the user saw.
- The interesting decision is `complaintsFor`. A finding that names an artifact is the model's mistake and goes back to it; a finding that names none — "there are no gates", "no hook scans for secrets", "no export target enabled" — is about what the Blueprint does not contain, which is a scope decision for the author. Reading those back would have the model bolt a secrets hook onto a PR-review crew nobody asked for, which is the padding the prompt spends a paragraph forbidding. `BP-PORT-*` and `BP-EVAL-PORT-001` are excluded outright: they describe the harness, or where the evaluator ran.
- Measured, not asserted: the recorded draft leaves 25 findings; the same brief answered to the house style leaves 6, and all six are whole-Blueprint advisories no prompt should remove. The two recordings are in `tests/__recordings__`, and the repair round is tested by making the first attempt the old answer and the second the new one.
- Cost: `generateBlueprint` can now take two round trips. It takes the second only when the first left something an artifact-level rule objects to, and keeps the first if the second is no better.

### P9-15 Add a capability, not an artifact (done)

- Package: `packages/ai/src/operations/add-capability.ts`, `apps/web/src/lib/ai/actions.ts`
- Depends on: P9-14
- Description: Reported from use. `/new` can draft a whole Blueprint with AI; after the project exists, the assistant could only write **one artifact at a time**. But nobody wants one artifact — "create a .NET review expert" is an agent, the skills it holds, the laws it works under and the workflow that runs it, and asking for those separately leaves the author doing the wiring the model was in a position to do.
- Acceptance: one brief produces artifacts of several kinds in a single reviewed ChangeSet, wired to each other and to what already exists; the project's own name, description and primary agent are untouched; it is reachable from the assistant and the palette.
- Verify: `pnpm --filter @agent-blueprint/ai test`, `pnpm --filter web test`
- Built: `addCapability`, sharing everything that already works — the house style from P9-14, the assembler, and the check against both validation passes with one repair round. What it does not share with `generateBlueprint` is the header: that one designs from nothing and names the project, this one is a guest in a Blueprint someone else made. The prompt says so in those words, and the test that matters asserts the project's name and primary agent are the same afterwards.
- Built: with an agent selected, what is created is held from that agent — but only when the answer wrote no agent of its own. Doing both would hold every new skill from two agents at once, which is not what "add a reviewer" means.
- The existing action was part of the problem: **Draft the whole Blueprint** sits in the same menu and does rename the project, which is why nobody pressed it from inside one. Its hint now says what it does and points at the new one.
- Found by the check while recording the fixture: an added agent that no workflow runs and nothing delegates to raises `BP-AGENT-010`, so the "good" recorded answer had to include the workflow that runs it. That is the operation working — a capability that is not reachable is not a capability.

### P9-16 The same wait, on every screen that waits (done)

- Package: `apps/web/src/components/ai/waiting.tsx`, `apps/web/src/lib/ai/failure.ts`, and the four surfaces that ask a model
- Depends on: P9-08
- Description: Reported from use. P9-08 gave the wizard's _Draft_ a progress line and a Stop button; the surfaces built before and after it did not get them. The assistant and the evaluation view had a spinner and a bare Stop, and Settings' _Save and test_ had neither — a probe against an unreachable local endpoint left the button spinning with no way out.
- Also reported: the waiting line ended with "A local model can take a while before it starts writing." That is advice, shown on every request, for a case that may not apply.
- Acceptance: every screen that sends a request shows the state, a clock and a Stop; the waiting line says only the state and the clock; a timeout says which setting to change.
- Verify: `pnpm --filter web test`, `pnpm --filter web test:e2e assistant`
- Built: `Waiting` reaches all four, plus `Elapsed` for the probe — no token count, because a probe does not stream, but "nothing has happened for forty seconds" is still what the user needs. The evaluation view runs two operations at once and sums their counts: what matters is that something is still arriving, not which of the two it came from.
- Built: `lib/ai/failure.ts`, replacing four copies of the same `instanceof` ladder with one that adds a second line where there is something to do. A **timeout** names the field by the label it currently has — "Give up after silence of" while streaming, "Wait for an answer" when not — and the value it is set to. **auth** points at the key; **network** mentions CORS and the relay; everything else gets the endpoint's own words, because inventing advice for a 503 is worse than none.
- Where the advice went is the point: it moved from every request that has not failed to the one that did.
- Two existing tests changed rather than broke: they stub a 401 and asserted the generic "Nothing was changed", which is now the specific "Check the key in Settings." A better assertion than the one it replaced.

### P9-17 Fix a whole dimension, not a finding at a time (done)

- Package: `packages/ai/src/operations/fix-finding.ts`, `apps/web/src/components/views/evaluation-view.tsx`
- Depends on: P9-12, P9-13
- Description: Reported from use. P9-12 put a **Fix with AI** control on every finding and nothing on the section above them, so clearing the seven skills a generated Blueprint arrives with meant seven dialogs and seven round trips.
- The reason it is not a loop over the existing control is the part worth recording. Two findings so often name the **same artifact** — a skill with no `## Instructions` almost always has no `## Verification` either — that fixing them one at a time produces two edits of one file, where the second is computed from a Blueprint that does not yet have the first in it. Applying both silently loses one. Slowness was the visible problem; that was the real one.
- Acceptance: one ask per dimension; each artifact returned once however many findings named it; the review says which of them the validator agrees are cleared; nothing offered where nothing could be written.
- Verify: `pnpm --filter @agent-blueprint/ai test`, `pnpm --filter web test`
- Built: `fixFindings` takes a list and `fixFinding` is its one-element case, so there is one prompt and one code path. The prompt states the rule in its own words — _"Several findings often name the same artifact. Return that artifact once, with every one of its findings addressed in the same version of it. Returning it twice is two competing edits, and the second silently wins."_
- Built: the verdict became a tally. With a batch it says which codes are cleared, which still stand, and how many came from the quality pass and so cannot be re-checked at all — the P9-13 distinction, now counted.
- The id-pinning guard from P9-13 generalised rather than being dropped: a returned artifact is paired with a finding's id only when exactly one of that kind came back under an unrecognised id and exactly one finding of that kind went unanswered. Anything less certain is reported, because guessing there overwrites the wrong artifact silently.
- **Fix all N** appears only on a dimension with two or more fixable findings. With one, the row's own control already does it; with none, no button is more honest than one that opens on a refusal. Named after the dimension, so ten of them are not ten buttons called "Fix all".

### P9-18 A fix that does not delete what it was not asked about (done)

- Package: `packages/ai/src/operations/fix-finding.ts`
- Depends on: P9-13
- Description: Reported from use, with the diff. Asked to add a `## Verification` section to the "xUnit Testing" skill, the model returned the skill with the section added — and `activation` emptied of its five file patterns, four intents and two agent roles, `referenceIds` and `allowedToolIds` gone, `tags` dropped. It answered the question and deleted half the artifact doing it, and the review showed that as one innocuous line: "Added ## Instructions and ## Verification sections."
- The prompt already said to return every other field exactly as given. It has said so since P9-12. A prompt is advice, and this needed to be a guarantee.
- Acceptance: a fix may change the fields its findings are about and no others; what the model omits or empties elsewhere is restored; the notes say what was kept.
- Verify: `pnpm --filter @agent-blueprint/ai test`
- Built: `onlyWhatWasAsked`, using the table the operation already had. When every finding about an artifact has a `FIELDS_BY_CODE` entry, those fields are an allow-list: the proposal is merged onto the artifact as it stands and everything else comes back untouched. `BP-SKILL-011` is about `body`, so the body is all that could have changed — and `activation`, `tags` and the reference lists were never at risk.
- A side effect worth having: the merge starts from the stored artifact, so it also keeps what the model was never shown. The AI schemas strip `metadata` (the unknown keys the project reader preserves) and a workflow's node positions; a wholesale replacement dropped both silently, and had done since P6.
- Where a code names no fields — a contradiction, an orphan — there is no allow-list, so the weaker rule stands in: a field that came back empty or missing is restored, a field that was filled in wins. Neither rule can invent content. Both say in the notes what they kept, because a silent correction is the same class of problem as a silent deletion.
- Also strengthened, because it costs nothing: the worked example in the prompt now names this failure specifically — _"An empty list is not 'unchanged'. Copy every field across."_
- Found while fixing it: the retry was gated on the first attempt producing ops. An answer whose every field is rejected produces none, which is a wrong answer worth correcting rather than a model declining. It is gated on having returned an artifact now.

### P9-19 Point at where the problem is (done)

- Package: `packages/core/src/validation/requirements.ts`, `apps/web/src/components/views/diagnostic-row.tsx`, `evaluation-view.tsx`, `editors/requirement-checks.tsx`
- Depends on: P9-10
- Description: Reported from use, and worth quoting: _"I was getting an error in the Requirements → Security Enforcement artifact, but the error comes from a hook. It should show me exactly where the problem is."_ The finding said "nothing in the Blueprint meets its check", the cause was a hook with the right trigger and the wrong action type, and the reader was three artifacts away with nothing on screen pointing at it. Finding it took reading the check's source.
- Acceptance: a failed check names the artifact that came closest and why it fell short; every findings list shows where else to look and navigates there; the check editor shows what is actually stored.
- Verify: `pnpm --filter @agent-blueprint/core test`, `pnpm --filter web test`
- Built, in core: **near misses**. A failed check knows what it looked at, so it says which candidate came closest and the one thing that stopped it — _"its action is command, not secret-scan"_, _"it runs on after-file-change, not before-stop"_, _"it is tagged "rust" but no agent holds it"_. The clause is the fix, most of the time. They reach the diagnostic three ways because three readers need them: the first in the **message** (the one line every surface shows), the refs in **`related`** (what every list navigates to), the full list in **`data`** (what the AI fix reads as evidence).
- Built, generic: **Where to look**. `related` had been on the diagnostic since P1 — contradictions and broken references already filled it — and nothing had ever rendered it. One row of chips under the message in every findings list, each navigating to its artifact, with the reason beside the first. Contradictions and broken references gained a pointer for free.
- Found and fixed, ours: the check editor showed `before-stop` / `run-tests` in its selects when nothing was stored, so the screen said one thing and the check did another. `(any)` is a real option now, with help that says what "any" means — and that _"a command hook that scans for secrets is not a secret-scan hook"_, which is this bug in one sentence.
- Found and fixed, ours: the AI fix for `BP-HOOK-010` was allowed to change the whole `action`, and had taken the route of changing its type — clearing that finding and failing this requirement. The remedy is "fill in the command", so the allow-list now says `action.command`, and the merge learned one level of path.

### P9-20 The finding beside the field that fixes it (done)

- Package: `packages/core/src/validation/codes.ts`, `apps/web/src/lib/field-findings.ts`, `apps/web/src/components/editors/`
- Depends on: P9-19
- Description: Reported from use, straight after the pointer landed on the finding: _"is it possible to also add indications and hints near the actual fields that need fixing?"_ A finding lives in the health bar, the inspector and the evaluation view, and the person fixing it is in none of those — they are on the form, in the field.
- Acceptance: a finding about an artifact is shown under the control its code is about; a finding elsewhere that points at this artifact is shown under the field it points at, saying where it came from and linking back; a clean artifact shows nothing.
- Verify: `pnpm --filter web test`
- Built, in core: `DiagnosticCode.fields`. It existed already, as a table in `packages/ai` since P9-13, because the AI fix needed to know which fields a code is about. The editor needed the same answer, so the list moved to the catalogue and both read it — one definition, two readers: the form marks those controls, the fix may change those controls and no others. A dotted path (`action.command`) names a key inside an object. `NearMiss` gained `field` for the same reason: the hook's near miss says `action.type`, so the hint lands on the Action select rather than the artifact.
- Built, in the web app: `fieldFindingsFor(diagnostics, ref)`, pure over the store's diagnostics, so nothing new is computed on edit. Every `Field` takes `hints`; the form spreads `hint('description')` beside `exampleFor(kind, 'description')`, the same shape the examples take. Under the hook's Action select: **`BP-REQ-001` its action is command, not secret-scan — from requirement: security-enforcement**, and the link goes there.
- Deliberately not a live region. Fields re-validate on every keystroke, and a screen reader announcing the same finding on each is worse than one it can tab to.
- Not covered, and said so: Iron Laws and rules have no scope editor on the form, so `BP-LAW-001` and the scope orphans have no control to land on. They still show in the findings list and the pointer row.

### P9-21 Every option explains itself, and every finding points somewhere (done)

- Package: `packages/core/src/model/options.ts`, `options-doc.ts`, `validation/codes.ts`; `apps/web/src/components/editors/fields.tsx` and every select
- Depends on: P9-20
- Description: Two asks in one, reported together. _"All the options should have some info — Role has worker, reviewer, etc.; explain what these roles are."_ And: _"go through all errors/warnings/info and make sure the findings will always point to the exact problem."_
- Acceptance: every value of every enum a form offers has a label and a sentence, shown in the list and under the chosen value; docs/02 lists all of them and cannot drift; every diagnostic code either names the fields it is about or is on the explicit list of codes about the whole Blueprint; a field a code names exists on some artifact's schema.
- Verify: `pnpm --filter @agent-blueprint/core test`, `pnpm --filter web test`
- Built, the options: `OPTION_TABLES` in core — twenty-nine enums, a hundred and forty-odd values, each with a label and a sentence written in terms of what the product then does: _"Before stop. When the agent is about to report it has finished. The last chance to block: gates and secret scans live here."_ Where a value is what a rule looks for, the sentence says so — `secret-scan`: _"This type, not a command that happens to scan, is what `BP-SAFETY-004` and a `hook-exists` check look for."_ That is last week's bug, written where it would have been read.
- Built, the form: `SelectField` takes a `describe` table and shows the sentence under every item and under the chosen value. The value stays the raw enum word in `font-mono`, so the form shows what the file will say. The permissions grid's second copy of the operation labels is gone; it reads the table. The workflow palette's hints read the table.
- Built, the doc: docs/02 gained an **Options reference**, generated by `pnpm --filter @agent-blueprint/core options:doc` between markers, with a test that fails when the section and the table differ. The generated block is fenced from prettier, which had reformatted the tables and left the document one format run away from failing its own test.
- Built, the findings: nine more codes gained `fields` (`BP-ID-*` and the five id-collision codes → `id`; `BP-LAW-010` → `rule`, `scope`; `BP-REQ-004` → `checks`), and reader findings now show the file they are about. A test holds that every code either names fields or is on the explicit list of codes about the whole Blueprint, and that every field named exists on some schema — because a field no schema has is a pointer to nothing, and nothing would notice.
- Honest about the remainder: the twenty-one whole-Blueprint codes (no export target, no Iron Laws at all, a concept adapted on a harness) have no artifact to land on. They point at the view that does the job, in their remedy.

### P9-22 A new repository, as an option (done)

- Package: `apps/web/src/components/github/push-dialog.tsx`
- Depends on: nothing
- Description: Reported from use: _"Push to GitHub — is it possible to add an option to create a new repo?"_ It was, since P7 — but only after a preview had failed with a 404, at which point the dialog offered to create the name. That is a consolation, not an option, and nobody looks for an option in an error.
- Acceptance: a name the token cannot list is offered for creation as soon as it is typed; with nothing typed, one button proposes a repository named for the Blueprint under the token's own login; Preview stays available throughout.
- Verify: `pnpm --filter web test`
- Built: the offer moved from after the failure to as soon as the name is known — the list of repositories the token can push to is already fetched, so "not in it" is known the moment the field is. Preview stays beside it on purpose: the list is what a fine-grained token can _see_, not everything that exists, and GitHub refuses a taken name with a message that says so. The 404 path is kept for exactly that case.
- Built: **New repository: `<login>/<blueprint-id>`**, shown while the field is empty. One click fills the name in; the creation offer appears under it; the next click makes it.

### P9-23 The first commit (done)

- Package: `apps/web/src/lib/github/client.ts`
- Depends on: P9-22
- Description: Reported from use, on a repository P9-22 had just created: _"Git Repository is empty."_ — as an error. GitHub answers the ref, branch and tree endpoints of a repository with no commits with 409 and that sentence, not 404, and the client treated every 409 as a conflict. To a preview, an empty repository is the one case with nothing to compare against; the push should simply be the first commit.
- Acceptance: a preview against an empty repository lists everything as an addition and reports no error; the push creates a commit with no parent and a ref rather than moving one.
- Verify: `pnpm --filter web test`
- Built: `allowMissing` now also accepts a 409 whose message says the repository is empty, and only that 409 — a real reference conflict still throws. The initial-commit path in `pushToGitHub` already existed (no `base_tree`, no `parents`, `POST /git/refs`); it had never been reached, because the preview before it failed.
- Found in the tests: `repos.test.ts` had a case named _"because an empty repository has none"_ that stubbed a 404. It was asserting the wrong answer and passing. The push dialog's fake GitHub had the same 404; both now answer the way GitHub does.

### P9-24 The first commit, the way GitHub allows one (done)

- Package: `apps/web/src/lib/github/push.ts`
- Depends on: P9-23
- Description: Reported from use, after P9-23: the preview said _"Creates the branch, with 171 files in one commit"_ and the push still failed with _"Git Repository is empty."_ P9-23 fixed the read; the write has the same refusal. The Git Data API will not create a tree, a commit or a ref in a repository that has no commits — every one of those calls answers 409 with that sentence — so the "initial commit" path P9-23 uncovered could never have worked. The only way to make a first commit through the API is the Contents API, which writes one file and makes the commit as a side effect.
- Acceptance: a push to a repository with no commits succeeds; the history afterwards holds exactly one commit, carrying every file the preview listed; a push to a repository that has commits is unchanged, and still never forced.
- Verify: `pnpm --filter web test`
- Built: when `POST /git/trees` is refused with the empty-repository 409 and the push had no parent, one file — the first write, by path — is written through `PUT /contents/{path}` with the message _Initialise the repository_, which makes the first commit and the branch. The tree is then created again, the real commit is made as a root commit (`parents: []`), and the branch is moved onto it with `force: true`. That is the one forced move this module makes: the seed commit is the app's own, a second old, and nobody else can have built on it. History holds one commit, not two, which is what the preview promised. A repository with commits never reaches this path — the 409 is only caught when there is no parent — so the no-force rule stands where it matters.
- Not built: seeding with a file that the real tree does not contain, and then removing it. One extra unreachable commit versus a forced move over one's own commit; the forced move leaves the cleaner history, and the exception is documented where the rule is.

### P9-25 A hook that does what the Blueprint says (done)

- Package: `packages/exporters` (`shared/hooks.ts`, `claude-code/settings.ts`, `codex/config.ts`)
- Depends on: P2-02, P2-03
- Description: Found by reading the goldens against the harness contract. The fixture's test hook says `onFailure: return-to-agent` and compiled to `"command": "dotnet test --no-restore"`, verbatim. Under the exit-code convention Claude Code and Codex share, only exit 2 refuses an action and hands stderr to the model; any other non-zero exit is a non-blocking error the user is shown. A test runner exits 1 and prints to stdout, so the hook could never block and the agent could never see a failure — and the gate's `Stop` hook, the same command, could never stop a stop. The docs described the exit-2 semantics; nothing produced them. In the same file, the hook's `**/*.cs` condition was reported as something Claude hooks cannot express and ran on every edit of every file, while the harness reference already listed the `if` handler field that expresses exactly that.
- Acceptance: a command hook whose failure should block or return to the agent exits 2 with the command's output on stderr, and one that warns exits 1; a gate that allows failure ignores it and one that requests approval says so before the output; a file-pattern condition on a tool event becomes an `if` filter and is no longer reported; on an event that is not about a tool, or a tool that takes no path, the note stays. Goldens updated and read.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: `failing(command, outcome, note?)` in `shared/hooks.ts` wraps a command as `out=$(<command> 2>&1) || { printf '%s\n' "$out" >&2; exit <2|1>; }` — silent on success, so a passing test run does not land in the session; the output on stderr with the right code on failure. `block` and `return-to-agent` are the same mechanism (exit 2 is how output reaches the model, and on events that can refuse it also refuses); `warn` exits 1; a gate's `allow` becomes `|| true` and `request-approval` prefixes a line asking for the user. Both JSON-hook adapters use it. Claude hooks with file patterns on `PreToolUse` / `PostToolUse` / `PostToolUseFailure` get `"if": "Edit(<glob>)|Write(<glob>)"` over the path-taking tools the matcher names; a `Bash` hook or a `Stop` hook keeps the note, because there is no path to filter by.
- Not built: Copilot, whose stop hook already refuses through a printed `decision`, and whose other events cannot refuse at all; and a PowerShell form of the wrapper — Claude Code runs hooks in `sh`, and on Windows in the Git Bash it requires.

### P9-26 A subagent keeps its permissions (done)

- Package: `packages/exporters` (`claude-code/index.ts`, `codex/index.ts`)
- Depends on: P2-02, P2-03
- Description: Found beside P9-25. On Claude Code only the primary agent's permissions became rules; a subagent got a `permissionMode` derived from them and nothing else, so a reviewer with `fs.write: deny` could edit whatever it liked. Worse, an agent with tools and a delegation list got a `tools:` line without `Agent` on it — and a `tools:` line is a whitelist, so the one thing the agent was designed to do was the one thing it could not. Codex's doc claimed `sandbox_mode` on the agent file from permissions; the adapter never wrote it.
- Acceptance: a denied operation turns off every Claude tool behind it when nothing else the agent decides needs that tool (`fs.write: deny` → `disallowedTools: Edit, NotebookEdit, Write`); a denial that cannot turn a tool off (`git.push: deny` while read-only shell is allowed) is written into the agent's prompt as a "Not allowed" line; an agent with tools and delegates gets `Agent(<delegates>)` on its tool list; a Codex subagent with `fs.write: deny` gets `sandbox_mode = "read-only"`. Copilot and OpenCode, which already lowered per-agent permissions, are unchanged.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: `lowerSubagentDenials` applies the same rule Copilot's `toolAliases` does — a tool is off only when every operation behind it that the agent decides is denied — and returns what survived, so the agent file says those in words. Turned-off tools are also removed from `tools:`, so the two lists never disagree.
- Not built: pattern-level denials on a subagent (`Bash(git push *)` in `disallowedTools`); whether a subagent's tool list accepts permission-rule syntax is not documented, so the denial is a sentence rather than a guess.

### P9-29 Four more moments to hook, and hooks that do not wait (done)

- Package: `packages/core` (schema, options), `packages/exporters`, `apps/web` (hook form)
- Depends on: P9-25
- Description: The seven triggers covered a session's main line and nothing at its edges. Three edges matter in practice. A delegated agent does not see the conversation, so the laws and conventions have to be handed to it when it starts, not hoped for. A summarised conversation forgets what the summary left out, so what must survive — the rules, the task — has to be said again after compaction. And a failed tool call is the moment a hint about _why_ is worth the most. Separately, a hook that only logs or measures should not make the agent wait for it.
- Acceptance: `after-tool-failure`, `subagent-start`, `before-compact` and `after-compact` are triggers, each described in the form; `action.async` is a field with a checkbox; Claude Code emits all four events and `async`; Codex emits three and reports `after-tool-failure` as unsupported; Copilot emits three and reports `after-compact`, and reports `async` as foreground; a blocking hook on an event that cannot refuse is reported as limited; the hook form also edits the file patterns P9-25 made native.
- Verify: `pnpm --filter @agent-blueprint/exporters test`, `pnpm --filter web test`
- Built: the four cases in each `lowerTrigger`, which now return `undefined` for an event the harness lacks so the caller can say so; `async: true` on the handler for Claude and Codex, with the command emitted as written since a discarded result has nothing to wrap. Option descriptions for the four triggers; docs/02 and the three harness tables.
- Not built: a matcher on `SessionStart` (`startup` / `resume` / `compact`) and on `SubagentStart` (the agent type); the model has no field for either and no request for one yet.

### P9-30 A hook that is a file (done)

- Package: `packages/core` (schema, `BP-HOOK-011`), `packages/exporters`, `apps/web` (hook form)
- Depends on: P9-25, P9-29
- Description: A hook could only be one line. That rules out the checks that make hooks worth having: read the edit the tool just made from stdin and scan only what it introduced; run a gate with three steps and a clear message; print a JSON decision. Skills already ship files beside `SKILL.md`; hooks had no way to ship anything.
- Acceptance: `action.script` holds a POSIX shell script; the project file writes it as a block scalar and reads it back unchanged; each JSON-hook harness writes `<id>.sh` where it keeps hook scripts and the hook runs it (Claude through `${CLAUDE_PROJECT_DIR}`, Codex and Copilot relative to the root); a missing shebang is added and a written one kept; `BP-HOOK-010` accepts a script in place of a command and `BP-HOOK-011` notices a hook with both; the form has a Script field.
- Verify: `pnpm --filter @agent-blueprint/core test`, `pnpm --filter @agent-blueprint/exporters test`
- Built: `ScriptLocation` per harness, `effectiveCommand` and `hookScriptFile` in `shared/hooks.ts`; the adapters ask for the command through the former and emit the latter beside their hooks file.
- Found on the way: the P9-25 wrapper discarded a command's stdout on success, which is where a hook that decides or injects context answers. The wrapper now prints the output as it was when the command passes, and rewrites only the failure path. Goldens updated.
- Not built: scripts for OpenCode and Pi, whose hooks are code that does not exist yet (P8-10, P8-11); a PowerShell variant of a script.

### P9-31 How a skill is called (done)

- Package: `packages/core` (schema), `packages/exporters`, `apps/web` (skill and workflow forms)
- Depends on: P2-01
- Description: A skill said when the model should load it and never how a person reaches it. Two things follow. Every skill, including reference knowledge the model applies on its own, landed in the slash-command menu, so a Blueprint with fifteen skills offered fifteen commands of which three made sense to type. And a command that takes an argument — a plan file, a test project — never said so; the orchestration skill described the steps and left what to invoke it with as a guess.
- Acceptance: `skill.invocation.userInvocable` (default true) and `skill.invocation.argumentHint`; `workflow.argumentHint`; Claude Code writes `user-invocable: false` and `argument-hint` natively; the portable tree, which has neither field, carries the hint as an **Argument** line in the skill body; a workflow skill with a hint opens with a Usage section in the harness's own invocation syntax; the defaults emit nothing; both forms have the fields.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: `skillInvocationSchema`, the two frontmatter extras in the Claude adapter, the Argument line in `activationBlock`, the Usage section in `emitWorkflowSkill` through `phrasing.workflowInvocation`.
- Not built: named arguments (`arguments: [name]` with `$name` substitution), which only Claude Code documents; a menu flag for Codex, which has none.

### P9-32 An agent's budget (done)

- Package: `packages/core` (schema, options), `packages/exporters`, `apps/web` (agent form)
- Depends on: P2-01
- Description: An agent could say which model it preferred and nothing about how hard that model should think or how long it could run. A researcher that reads forty files at maximum effort costs what a whole review costs; a reviewer with no turn limit reads until the context is gone. Both harnesses with subagent files have a setting for effort and Claude Code has one for turns; the Blueprint had no field to compile into either.
- Acceptance: `agent.budget.effort` (`low` / `medium` / `high`, each described) and `agent.budget.maxTurns` (1–1000); Claude Code writes `effort` and `maxTurns` on the subagent; Codex writes `model_reasoning_effort` and reports a turn budget it cannot keep; the agent form has both fields; unset emits nothing.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: `agentBudgetSchema`, `EFFORT_LEVEL_INFO`, the two frontmatter lines, the TOML key and the issue, a `NumberField` in the form kit.
- Not built: a budget on the primary agent, which has no file of its own on any harness (Claude's `effort` there is a session setting, not a project one); Copilot, OpenCode and Pi agent files, none of which documents an effort field.

### P9-27 A Blueprint as a plugin, installed from its own repository (done)

- Package: `packages/exporters` (`claude-code/plugin.ts`, `emit.ts`, `options.ts`, `shared/readme.ts`, `portability.ts`), `packages/core` (`BP-CLAUDE-002`), `apps/web` (compatibility view, push dialog)
- Depends on: P9-22, P9-25, P9-26, P9-30, P9-31
- Description: Asked for. A compiled repository configures the project it is opened in and nothing else; a Claude Code plugin is installed once from a marketplace and follows the user everywhere. Claude Code's marketplace is a JSON file in a GitHub repository, so the repository the push dialog already makes is one manifest away from being installable with two commands.
- Acceptance: with `layout: plugin` on the Claude Code target the adapter writes `plugins/claude-code/` (manifest, instructions, skills, agents, hooks and scripts, references, MCP) and `.claude-plugin/marketplace.json`, and nothing at the root; the compatibility view has a switch per plugin-capable target and shows the matrix for that layout; the README says how to install; the push dialog shows the exact commands with the repository it pushed to; MCP secrets become `userConfig` entries marked sensitive; a golden pins the fixture as a plugin.
- Verify: `pnpm --filter @agent-blueprint/exporters test`, `pnpm --filter web test`
- Built: the adapter split into `options.ts`, `emit.ts` (what one artifact becomes, shared by both layouts) and `plugin.ts`; `HarnessAdapter.capabilitiesFor(options)` so the compatibility matrix is the one for the layout chosen; `pluginPhrasing` so the instructions say `/<id>:<workflow>`; a `SessionStart` hook that prints `instructions.md`, the one door a plugin has into every session; the golden `dotnet-testing-expert.plugin`.
- Not built: a marketplace with more than one plugin — one Blueprint is one repository is one plugin, and the manifest lists exactly that; `homepage` and `repository` in the manifest, which the compiler cannot know; a plugin for Copilot, OpenCode or Pi, none of which has a documented marketplace format.

### P9-28 The same plugin for Codex (done)

- Package: `packages/exporters` (`codex/plugin.ts`, `codex/sidecar.ts`), `packages/core` (`BP-CODEX-003`)
- Depends on: P9-27
- Description: Codex has the same idea with a different file: `.agents/plugins/marketplace.json` in a Git repository, pointing at a directory with `.codex-plugin/plugin.json`, `skills/`, `hooks/` and `.mcp.json`. A Codex plugin carries less than a Claude one — no instruction file, no agents, no config — so more has to be said about what is not there.
- Acceptance: with `layout: plugin` on the Codex target the adapter writes `plugins/codex/` and `.agents/plugins/marketplace.json` and nothing else at the root; the persona, laws, rules and command policy are the `guide` skill; workflow skills say `$<id>:<workflow>`; subagents, permissions, memory and scripted hooks are reported as unsupported; the compatibility view offers the switch and shows the plugin matrix; the README and push dialog say how to install; a golden pins the fixture.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: `compileCodexPlugin`, `codexPluginPhrasing`, the sidecar moved to its own module so both layouts share it, `emitPortableSkillSet` taking a phrasing, `PLUGIN_LAYOUT_TARGETS` now naming both harnesses, the golden `dotnet-testing-expert.codex-plugin`.
- Not built: an always-loaded instruction file — Codex plugins have none, so the guide is a skill the model loads when its description matches; hook scripts in the plugin, until Codex documents how a plugin hook finds its own files.

### P9-33 The README on GitHub says where it is (done)

- Package: `packages/exporters` (`shared/readme.ts`, `pipeline.ts`), `apps/web` (`lib/github/plan.ts`, push dialog)
- Depends on: P9-27
- Description: Reported from use: the README on the pushed branch did not say how to install the plugin. The compiler cannot know where a repository lives, so the README's Installing section carried `<owner>/<repo>` for the reader to fill in — the one place the commands matter, and the one place they were not usable. The push dialog knows the repository, and the plan already compiles the files it pushes.
- Acceptance: `compileBlueprint` takes `repository`; `planPush` passes the repository it is pushing to, so the README that goes up names it in its install commands and nowhere carries the placeholder; an export to a ZIP, which knows no repository, keeps the placeholder; a project pushed in the project layout and pushed again as a plugin has its README rewritten, since the compiler owns it.
- Verify: `pnpm --filter web test`
- Built: `ReadmeOptions.repository` through `CompileOptions.repository` to `planPush`'s third argument. The plan test proves the second-push rewrite and the dialog test reads the README out of the tree the push sent.
- Found on the way: nothing in the plan skips the README of a repository this app made — the file is the compiler's by the manifest and is rewritten whenever it changes. A README that was on the branch before the first push ever ran is the one case it stays: it is listed under the files the app does not own, and written only when accepted; the dialog already says so.

### P9-34 What a Claude plugin can enforce after all (done)

- Package: `packages/exporters` (`claude-code/plugin.ts`, `claude-code/emit.ts`)
- Depends on: P9-27
- Description: Reported from use: switching a target to the plugin layout turned permissions unsupported and memory limited, and the question was whether that was the format or the adapter. Read against the plugin reference, the hooks reference and the subagent reference: a plugin's `settings.json` really does accept no permission lists, but a `PreToolUse` handler's `if` takes permission-rule syntax, its stdout carries a `permissionDecision`, and several handlers combine with the lists' own precedence — so deny and ask can be enforced by the plugin, and allow deliberately cannot, since a hook's allow bypasses the installing project's own rules. The same reading found that Claude ignores `permissionMode` on a plugin's agents, that a subagent's `memory` works in a plugin, and that the SessionStart context is injected again after compaction.
- Acceptance: in the plugin layout every deny and ask rule of the primary agent is a `PreToolUse` handler with the rule as `if` and the decision as its output; no handler grants; the allow rules are reported as limited; `permissionMode` is not written on a plugin's agents and a mode other than `default` is reported; the SessionStart hook prints the plugin's installation path before the instructions, so a reference named there can be read; the matrix says permissions are adapted, not unsupported.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: `permissionHandlers` over the lists `lowerPermissions` already produced, `AgentFileOptions.permissionMode`, the reworded matrix, the golden. Reported from use afterwards: an installed plugin asked before every Bash command, also under `--dangerously-skip-permissions`, with no "always allow" — which is the fixture's and starters' `shell.mutating: ask` doing in every project what an ask rule does in one (Claude prompts for an ask rule in every mode and offers no "don't ask again"); an ask on a whole tool is reported as limited now, and docs/harness/claude-code.md says why. The same session showed the Iron Law `Stop` prompt blocking every stop of an unfinished task: a prompt hook is answered by a judge model, and the prompt was worded as a reminder to the agent ("never claim a verification you did not run"), so the judge refused to certify what it could not see. The Claude adapter now sends the judge its own prompt (`ironLawJudgePrompt`: ok unless the transcript shows a law broken); the reminder wording stays for the harnesses that print it into the session.
- Not built: enforcing allow — by design, above; `hooks` and `mcpServers` on a plugin's agents, which Claude also ignores and the adapter never wrote.

### P9-35 A Codex plugin that loads its instructions and runs its scripts (done)

- Package: `packages/exporters` (`codex/plugin.ts`)
- Depends on: P9-28
- Description: P9-28 left two things out with a reason: hook scripts, because Codex documented no variable a plugin hook could reach its own files by, and an always-loaded instruction file, because a plugin had none. The plugin build reference now documents both doors: hook commands receive `PLUGIN_ROOT`, and plain stdout from a `SessionStart` hook is added as developer context, again after compaction. What the Claude plugin does the Codex plugin can now do too.
- Acceptance: a hook with a script is emitted as `hooks/scripts/<id>.sh` and run as `bash "${PLUGIN_ROOT}/hooks/scripts/<id>.sh"`, with no unsupported issue; `instructions.md` is at the plugin root and a `SessionStart` hook prints the installation path and then the file; the `guide` skill stays, for a session whose hooks are not trusted; the matrix and the README say so, including that Codex skips a plugin's hooks until `/hooks` trusts them.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: `CODEX_PLUGIN_SCRIPTS`, the SessionStart hook, `instructions.md` composed by the same call as the guide, the golden.
- Not built: permissions as `PreToolUse` hooks, which P9-34 did for Claude — a Codex handler has a tool-name `matcher` but no `if`, so matching a command pattern would need a script that parses the hook's JSON input, which the compiler would be inventing. Recorded under Open questions.

### P9-36 The same plugin for Copilot (done)

- Package: `packages/exporters` (`copilot/plugin.ts`, `copilot/emit.ts`, `copilot/options.ts`, `registry.ts`, `shared/readme.ts`), `packages/core` (`BP-COPILOT-003`)
- Depends on: P9-27
- Description: P9-27 recorded "a plugin for Copilot, OpenCode or Pi, none of which has a documented marketplace format" as not built. Copilot has one now: `.github/plugin/marketplace.json`, `copilot plugin marketplace add <owner>/<repo>`, and two plugin formats, of which the docs recommend Agent Plugins 1.0 — a closed `plugin.json` with the spec's `$schema`, skills and `mcp.json` at fixed paths, and Copilot's own agents, rules and hooks under `com.github.copilot/`. A plugin has no `AGENTS.md`, but the "Rules" component takes modular instruction files, and one with `applyTo: "**"` applies everywhere.
- Acceptance: with `layout: plugin` on the Copilot target the adapter writes `plugins/copilot/` and `.github/plugin/marketplace.json` and nothing else at the root; the manifest carries only the spec's fields; the persona, laws, rules and command policy are `com.github.copilot/rules/guide.instructions.md` with `applyTo: "**"`, path-scoped rules are files beside it, custom agents carry every law; workflows are skills invoked as `/<id>` with no prompt file; `mcp.json` is the spec's file with no env values and each needed variable reported; scripted hooks are reported as unsupported; the compatibility view offers the switch, the README and push dialog say how to install; a golden pins the fixture.
- Verify: `pnpm --filter @agent-blueprint/exporters test`
- Built: `compileCopilotPlugin`, the agent and instruction emitters moved to `copilot/emit.ts` so both layouts share them, `PLUGIN_LAYOUT_TARGETS` naming all three harnesses, the golden `dotnet-testing-expert.copilot-plugin`. On the way: the Claude plugin's rule pointer rendered with doubled backticks, since the composer wrapped an already-formatted location; the location is Markdown now.
- Not built: hook scripts in the plugin, until Copilot documents `PLUGIN_ROOT` for hooks as it does for MCP and LSP servers; prompt files under `com.github.copilot/commands/`, whose format is not documented; a plugin for OpenCode or Pi, which still have no marketplace.

### Open questions

1. **Permissions in a Codex plugin.** Codex hooks have `PreToolUse` with a `permissionDecision` output, as Claude's do, but filter by a regex on the tool name only; there is no `if` in permission-rule syntax. Enforcing `Bash(git push *)` from a plugin would need a script that reads the hook's JSON input and matches the command itself — with no JSON tool guaranteed on the machine — and one that fails closed. Left as the command policy in the instructions until Codex documents an argument filter.
2. ~~**The logo needs a mark-only export.**~~ Settled: rather than crop by CSS, the cut is a script. `pnpm --filter web logo` measures nothing at run time — the rectangles live in `e2e/logo-assets.spec.ts`, taken from the artwork's alpha channel — and writes the three assets the app imports. A redrawn logo needs that one command and a re-measurement, and no component changes.
3. **P9-03 removed the guided path**, which was the one thing in the product aimed at someone who has never built an agent system. P9-06 is the replacement and now has to carry it: until the tutorial exists, a first-time user reaches an empty editor with no idea what to add. Restoring the old wizard is not the fallback — it was a second, worse editor — but P9-06 is no longer optional polish. The steps are in the git history if the decision is ever revisited.

## Deferred by design

Architecture allows these; MVP does not build them:

- Runtime simulation of Scenarios (`mode: runtime`) and automated blueprint test runs.
- CLI (`blueprint validate|build|export|test`): a `NodeFs` plus argument parsing over core + exporters (docs/03 §12).
- Reusable component libraries and importing single artifacts between projects (ChangeSets already carry entities).
- Team collaboration, version history UI, hosted registry, package distribution, CI integration, runtime telemetry, agent performance evaluation.
