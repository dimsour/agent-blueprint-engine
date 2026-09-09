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

| Phase             | State       | Notes                                                                                                                                                                                                                                     |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 Foundation     | done        | Workspace, docs, `@agent-blueprint/core` v0, fixture.                                                                                                                                                                                     |
| P1 Core semantics | done        | P1-01 to P1-09 implemented and tested, including 29 artifact templates and 10 starter blueprints.                                                                                                                                         |
| P2 Compiler       | done        | P2-01 to P2-09 implemented: adapter interface, registry, shared emitters, pipeline, build manifest, Claude Code and Codex in full, Copilot/OpenCode/Pi minimal, portability, golden tests.                                                |
| P3 Web shell      | done        | P3-01 to P3-11 implemented and then reviewed end to end: the review found eight defects (undo across projects, non-deterministic export, a hydration failure and five more), and the gaps it found against docs/07 were built. See P3-12. |
| P4 Graphs         | done        | P4-01 to P4-04: the overview graph, the workflow editor with all sixteen step types and eight connection kinds, tidy and template insertion, and the delete-impact dialog. Reviewed with P5; see P5-06.                                   |
| P5 Trust surfaces | done        | P5-01 to P5-05: the health bar opens its findings, the evaluation and compatibility views, the export view with compiled output, and the rename dialog with a slug preview. P5-06 reviewed P4 and P5 end to end and fixed what it found.  |
| P6 AI             | in progress | P6-01 to P6-04 built in `@agent-blueprint/ai`: the OpenAI-compatible client, structured output, the prompt catalogue and context builder, and the nine operations. P6-05 to P6-09 (the web app's side) are next.                          |
| P7 onward         | to do       | P7 (GitHub) and P8 (hardening) are specified below and not started.                                                                                                                                                                       |

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
- Description: Create Blueprint (primary CTA → wizard), Templates grid (starter blueprints), Recent projects, Import (ZIP, folder, blueprint.yaml), GitHub (link to P7 flow, disabled until configured).
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

### P3-13 Write to a folder on disk

- Package: `apps/web/src/lib/storage/file-system.ts`
- Depends on: P3-02
- Description: `FileSystemAccessStore` can pick a directory and read it, but nothing routes saves back to it: opening a folder copies it into IndexedDB. Wire `saveProject` to the store the project came from, and make `writeDirectory` prune, because writing the current files without removing what a deleted artifact left behind makes deleted artifacts reappear on the next open. Folder projects also need a stable id: today it is the directory's base name, so two folders with the same name collide.
- Acceptance: edit a folder project, reopen the folder, and see the edit and not the deleted artifact; two folders of the same name coexist.
- Verify: manual in Chromium, plus unit tests over a fake directory handle.

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
- Run 2026-09-09 against a self-hosted OpenAI-compatible server, four models. `a local model` and `a local model` pass all three checks; the second drafted a nineteen-op Blueprint with nothing dropped and no dangling references. `a local model` passes everything but the whole-Blueprint draft, which does not finish inside ten minutes on that hardware, and `a local model` was loaded with a 3328-token context, smaller than the request. Results and the four bugs it found are in docs/06. OpenAI has not been run.

### P6-10 A configurable request timeout

- Package: `apps/web/src/lib/ai/settings.ts`, `packages/ai/src/client/*`
- Depends on: P6-05
- Description: `AIClientConfig.timeoutMs` defaults to 120 000, which is right for a hosted API and too short for a local model drafting a whole Blueprint — `a local model` on a desktop GPU exceeded it, and the user's only signal is "No answer within 120s". The endpoint form should offer the timeout, and the default should probably follow the preset (local presets longer than hosted ones).
- Acceptance: the timeout is part of the stored settings and reaches the client; a local preset defaults higher than a hosted one.
- Verify: `pnpm --filter web test`
- Found by: the P6-09 live check.

## P7 — GitHub

### P7-01 Auth: PAT and OAuth

- Package: `apps/web/src/lib/github/auth.ts`, `app/api/github/oauth/{start,callback}/route.ts`
- Depends on: P3-01
- Description: PAT entry (fine-grained scopes explained); OAuth start/callback when `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are set; token to the client only; stored in sessionStorage by default.
- Acceptance: routes tested with mocked GitHub; token absent from server logs and persisted state.
- Verify: `pnpm --filter web test`

### P7-02 Repository and branch selection

- Depends on: P7-01
- Description: Octokit: list orgs/repos, create repo, list/create branch.
- Acceptance: mocked tests.
- Verify: `pnpm --filter web test`

### P7-03 Preview diff against remote tree

- Depends on: P7-02, P2-03
- Description: `GitHubTreeFs` (read-only `VirtualFs` over the branch tree); compute added/modified/deleted for `blueprint/` + owned paths; unowned conflicts listed and skipped unless opted in.
- Acceptance: tests with a mocked tree; second push after no change yields an empty diff.
- Verify: `pnpm --filter web test`

### P7-04 Atomic push

- Depends on: P7-03
- Description: Git Data API: blobs → tree → commit → update ref, one commit, user-supplied message; progress and error UI.
- Acceptance: mocked test; manual push of the fixture to a test repo recorded in the PR.
- Verify: `pnpm --filter web test`

### P7-05 Open/clone from GitHub

- Depends on: P7-03
- Description: Dashboard "GitHub" opens a repo's `blueprint/` into a project (read via tree, saved locally).
- Acceptance: Playwright with mocked GitHub.
- Verify: `pnpm --filter web test:e2e`

## P8 — Hardening

### P8-01 Full Copilot adapter

- Description: `.github/agents/*.agent.md`, `.github/instructions/*.instructions.md` (`applyTo` from rule paths and skill activation), `.github/prompts/*.prompt.md` for workflows, `.github/hooks/*.json`. Goldens.

### P8-02 Full OpenCode adapter

- Description: `opencode.json` (agents with mode/model/permission lowering, commands for workflows), `.opencode/agents/*.md`, `.opencode/commands/*.md`. Goldens.

### P8-03 Full Pi adapter

- Description: `.pi/prompts/*.md` for workflows, `.pi/settings.json` (`defaultTools` from permissions), extension stub for hooks documented as adapted. Goldens.

### P8-04 Binary assets in projects

- Description: `VirtualFs` gains `readBinary`/`writeBinary`; skill `assets/` may be binary; ZIP and GitHub backends updated.

### P8-05 Migrations UI

- Description: Opening an older project shows the migration path and a preview diff before saving.

### P8-06 Accessibility and keyboard pass

- Description: Focus order, ARIA on panels and graph, reduced motion, contrast in both themes; axe checks in Playwright.

### P8-07 Performance

- Description: Stress fixture with 200 artifacts; validation under 100 ms, graph render under 500 ms; memoized selectors.

### P8-08 Vercel deployment and docs refresh

- Description: `vercel.json`, env var docs, deploy preview; every doc reviewed against code; README with screenshots.

### P8-09 End-to-end suite

- Description: Playwright covering the docs/00 end-to-end story: template → edit → validate → export → (mocked) push.

Acceptance for P8 tasks: goldens or tests as in the corresponding P2/P3 tasks; each task updates its doc.

## Deferred by design

Architecture allows these; MVP does not build them:

- Runtime simulation of Scenarios (`mode: runtime`) and automated blueprint test runs.
- CLI (`blueprint validate|build|export|test`): a `NodeFs` plus argument parsing over core + exporters (docs/03 §12).
- Reusable component libraries and importing single artifacts between projects (ChangeSets already carry entities).
- Team collaboration, version history UI, hosted registry, package distribution, CI integration, runtime telemetry, agent performance evaluation.
