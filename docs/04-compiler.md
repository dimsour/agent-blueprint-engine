# Compiler specification

The compiler turns a Blueprint into the files a specific AI coding harness reads. It lives in
`packages/exporters` and depends only on `@agent-blueprint/core`. It has no
UI, no network and no clock: same Blueprint in, same bytes out.

```
Blueprint ──load──▶ migrate ──▶ normalize ──▶ validateCore ──▶ ┌ claude-code adapter ┐
                                                              │ codex adapter       │ ──▶ merge ──▶ build manifest ──▶ VirtualFs
                                                              │ copilot / opencode  │
                                                              └ pi adapters         ┘
```

Per-harness details (file conventions, field names, lowering tables) are in `docs/harness/*.md`.
This document defines the machinery those tables plug into.

## Core types the compiler uses

All from `@agent-blueprint/core` (existing code):

| Type                                                                        | File                                               | Used for                        |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| `Blueprint`, `Agent`, `Skill`, `Workflow`, …                                | `src/model/types.ts`                               | Input                           |
| `HarnessId`, `HARNESS_IDS`, `HARNESS_LABELS`                                | `src/model/kinds.ts`                               | Adapter ids                     |
| `EntityRef`, `refKey`                                                       | `src/model/types.ts`                               | Traceability of generated files |
| `Diagnostic`, `DiagnosticSeverity`, `sortDiagnostics`                       | `src/validation/types.ts`                          | Adapter validation output       |
| `BuildManifest`, `buildManifestSchema`, `ownedPaths`                        | `src/project/build-manifest.ts`                    | Ownership record                |
| `sha256Hex`, `canonicalJson`, `stableJson`, `toYaml`                        | `src/project/serialize.ts`                         | Hashing and encoding            |
| `VirtualFs`, `MemoryFs`, `joinPath`                                         | `src/project/virtual-fs.ts`                        | Output sink                     |
| `buildManifestPath`, `DEFAULT_SOURCE_DIR`                                   | `src/project/layout.ts`, `src/schema/blueprint.ts` | Paths                           |
| `normalizeBlueprint`, `validateBlueprint`, `readProject`, `migrateManifest` | various                                            | Pipeline stages 1–4             |

## Adapter interface

```ts
import type { Blueprint, Diagnostic, EntityRef, HarnessId } from '@agent-blueprint/core'
import type { ZodType } from 'zod'

export const CONCEPTS = [
  'skills',
  'agents',
  'parallelAgents',
  'workflows',
  'hooks',
  'gates',
  'permissions',
  'memory',
  'pathScopedRules',
  'commands',
  'ironLaws',
  'references',
] as const
export type Concept = (typeof CONCEPTS)[number]

export type SupportLevel = 'native' | 'adapted' | 'limited' | 'unsupported'

export interface Capability {
  support: SupportLevel
  /** One or two sentences shown in the compatibility view. Never empty. */
  explanation: string
}
export type CapabilityMatrix = Record<Concept, Capability>

export type FileFormat = 'markdown' | 'json' | 'yaml' | 'toml' | 'typescript' | 'text' | 'binary'

export interface GeneratedFile {
  /** Repository-relative POSIX path, e.g. `.claude/skills/xunit/SKILL.md`. */
  path: string
  /** Text, or the bytes themselves for a `binary` file (a skill asset that is not text). */
  content: ProjectFile
  format: FileFormat
  /** Harness that produced the file, or `shared` for files several harnesses read (AGENTS.md, .agents/skills). */
  owner: HarnessId | 'shared'
  /** Entities the file was generated from; empty for purely structural files. */
  sourceRefs: EntityRef[]
}

export interface CompatibilityIssue {
  harnessId: HarnessId
  concept: Concept
  support: Exclude<SupportLevel, 'native'>
  /** What the user wrote that cannot be represented natively. */
  ref?: EntityRef
  message: string
  /** What the adapter emitted instead. */
  adaptation?: string
}

export interface CompileResult {
  files: GeneratedFile[]
  issues: CompatibilityIssue[]
}

export interface HarnessAdapter<Options = Record<string, unknown>> {
  readonly id: HarnessId
  readonly name: string
  /** Adapter version, recorded in build-manifest.json. Bump when output changes. */
  readonly version: string
  readonly docsUrl: string
  readonly capabilities: CapabilityMatrix
  /** Validates `TargetConfig.options` for this harness. */
  readonly optionsSchema: ZodType<Options>
  validate(blueprint: Blueprint, options: Options): Diagnostic[]
  compile(blueprint: Blueprint, options: Options): CompileResult
}
```

Adapters are pure. They never touch a file system; they return `GeneratedFile[]`. They must not
import from `apps/` or use `Date`, `Math.random`, or environment variables.

Diagnostics emitted by adapters use codes prefixed `BP-<HARNESS>-NNN` (`BP-CLAUDE-001`,
`BP-CODEX-001`) and are listed in `docs/05-validation-evaluation.md`.

## Pipeline (planned, `packages/exporters/src/pipeline.ts`)

```ts
export interface CompileProjectOptions {
  sourceDir?: string
  /** Restrict to these targets; default = every enabled target in blueprint.targets. */
  targets?: HarnessId[]
}

export interface CompileProjectResult {
  blueprint: Blueprint
  diagnostics: Diagnostic[] // core + adapter validation, sorted
  files: GeneratedFile[] // merged, sorted by path
  issues: CompatibilityIssue[]
  buildManifest: BuildManifest
  ok: boolean // no error-severity diagnostics
}

export async function compileProject(
  fs: VirtualFs,
  options?: CompileProjectOptions,
): Promise<CompileProjectResult>
export function compileBlueprint(
  blueprint: Blueprint,
  options?: CompileProjectOptions,
): Omit<CompileProjectResult, 'buildManifest'> & { buildManifest: Promise<BuildManifest> }
export async function writeCompiled(
  result: CompileProjectResult,
  fs: VirtualFs,
  previous?: BuildManifest,
): Promise<{ written: string[]; deleted: string[]; skipped: string[] }>
```

Stages:

1. **load**: `readProject(fs, { sourceDir })`. Read diagnostics are carried forward.
2. **migrate**: performed inside `readProject` via `migrateManifest` / `migrateEntity`.
3. **normalize**: `normalizeBlueprint`. Adapters may assume normalized input (defaults applied, node and edge arrays sorted by id, bodies LF-terminated without trailing whitespace).
4. **validateCore**: `validateBlueprint`. Errors do not stop compilation, but `ok` becomes false and the UI blocks export/push on errors.
5. **per target**: for each enabled `TargetConfig` (order = `blueprint.targets` order): parse `options` with `adapter.optionsSchema` (a failure is a `BP-TARGET-003` error and the target is skipped), then `adapter.validate`, then `adapter.compile`.
6. **mergeFileSets**: concatenate all files, then resolve path collisions:
   - identical `path` and identical `content` → keep one, `owner: 'shared'`, union of `sourceRefs`;
   - identical `path` with different content → a `BP-COMPILE-001` error naming both owners; neither file is written. Shared emitters exist precisely so this never happens for `AGENTS.md` and `.agents/skills/**`.
7. **buildManifest**: for each file, `sha256:` + `await sha256Hex(content)`, grouped by owner into `BuildManifest.targets[harness].files` or `BuildManifest.shared.files`, with `adapterVersion`. Serialized with `canonicalJson` at `buildManifestPath(sourceDir)`.
8. **write**: `writeCompiled` writes changed files, deletes files owned by the _previous_ manifest that are absent now, and **skips** any existing file that is not in the previous manifest (unowned), reporting it in `skipped`. The UI asks before overwriting skipped files.

## Shared emitters (planned, `packages/exporters/src/shared/`)

### `emitSkillDir(skill, location, options)`

Produces `<location>/<skill.id>/SKILL.md` plus one file per `skill.resources[]` entry at
`<location>/<skill.id>/<resource.path>`, and one `references/<ref.id>.md` per attached
`Reference` (when `options.inlineReferences` is true). The frontmatter is the Agent Skills spec
subset: `name` (= `skill.id`), `description`, `license`, `compatibility`, `metadata` (string
values only), `allowed-tools` (from `allowedToolIds` when `options.toolNames` maps them).
Harness-specific extras (`paths`, `when_to_use`, `user-invocable`, …) are passed by the adapter
in `options.extraFrontmatter` and written after the spec fields. The body is `skill.body`
preceded by a generated "When to use" paragraph derived from `whenToUse` and `activation` when
`options.renderActivation` is true.

Validation performed here: `description.length <= 1024`, `id` matches the spec name regex,
resource paths stay inside the directory.

### `emitAgentsMd(blueprint, options)`

Composes the root instruction file used by Codex, Copilot, OpenCode and Pi (Claude Code composes
`CLAUDE.md` with the same builder and different section titles). Section order is fixed:

1. Title: `# <blueprint.name>` and `blueprint.description`.
2. Primary agent: `## Role` with the primary agent's `body`, then `### Responsibilities`, `### Expertise`, `### Output requirements`.
3. `## Iron Laws` (sorted by severity `critical` > `high` > `medium`, then id): each as `### <name>` with `rule`, `Rationale:`, `If this cannot be honoured:` (`violationBehavior`), examples and counterexamples as bullet lists. Only laws in scope for the primary agent (`scope.all` or `scope.agentIds` includes it).
4. `## Rules` (priority `high` > `normal` > `low`, then id): `guidance`; rules with `paths` add `Applies to:` unless the harness compiles them natively.
5. `## Agents` (only when more than one agent): a table of id, role, one-line description and how to invoke it on this harness (phrasing supplied by the adapter).
6. `## Workflows`: one line per workflow with its invocation (`/write-tests`, `$write-tests`, …) and description.
7. `## Skills`: one line per skill (id, description).
8. `## Memory` (when `memories[]` is non-empty and the harness has no native memory, or as a seed): categories and `body`.
9. `## References`: links to reference files not attached to skills.

The primary agent is `settings.primaryAgentId`, else `agents[0]`; with zero agents the file
contains only sections 1, 3, 4, 6, 7. Size budget: `options.maxBytes` (Codex passes 30 KiB);
when exceeded, sections 4, 8 and 9 are moved to a skill `blueprint-guidelines` and replaced by
a pointer line, in that order, until the file fits.

### `emitWorkflowSkill(workflow, blueprint, phrasing)`

Turns the graph into an orchestration `SKILL.md` body. Algorithm:

1. Validate the graph is connected from `entryNodeId`; unreachable nodes are listed at the end under "Unreachable steps (fix in the Blueprint)" and a `CompatibilityIssue` is raised.
2. Walk from the entry node. Follow `sequential`, `conditional`, `review`, `delegation` and `aggregation` edges forward; `retry` and `fallback` edges are recorded on their source node and never followed during the walk (they would create cycles).
3. A `parallel` node opens a group: every outgoing edge with `kind: parallel` becomes a branch; branches are walked independently until they reach the same `merge` node (or a node with an `aggregation` edge into a `merge`/`synthesis` node). The group is rendered as "Run the following in parallel:" with one sub-list per branch, followed by the merge step ("Wait for all / any / the first branch" from `config.mergeStrategy`).
4. Each node renders as a numbered step:
   - `agent` / `delegate`: `phrasing.delegate(agentId)` (Claude: "Use the Agent tool to run the `<id>` subagent", Codex: "Spawn the `<id>` agent", Copilot: "Hand off to `<id>`", Pi: "Adopt the `<id>` persona") followed by `contextInputs` ("Give it: …") and `outputSpec` ("It must return: …"). When the agent is the primary agent, the step is rendered as "You:" instead.
   - `skill`: "Apply the `<skillId>` skill" with `phrasing.invokeSkill`.
   - `tool`: "Use `<tool.name>`".
   - `condition`: "If <expression>:" with each `conditional` edge's `condition` (or `label`) as a branch; `required: false` branches are marked optional.
   - `verification`: "Verify: run `<command>`" (method `tests`/`command`) or "Verify by review" / "Verify manually"; `onFailure` renders as "On failure: stop / continue / fall back / retry".
   - `gate`: "Do not proceed unless: " followed by each criterion (`description`, `command` as `run …`) and the `onFail` behaviour ("If it fails: block / warn and continue / request human approval"). The gate text is also emitted as a hook where the harness supports it (see the harness doc).
   - `review`: "Review the result against …", `human-approval`: "Stop and ask the user for approval: <approvalPrompt>", `output`: "Produce: <outputSpec>", `synthesis`: "Synthesize the branch results into one …", `retry`: "Retry up to <maxAttempts> times", `end`: "Report the outcome".
5. Retry edges render on their source step: "If <condition>, go back to step N (at most <maxAttempts> times)". Fallback edges: "If this fails, do step N instead".
6. Trailer: iron laws in scope for the workflow (`scope.workflowIds`) as a "Non-negotiable" list, and the workflow `body` as "Notes".
7. When the workflow has an `argumentHint`, a "Usage" section before the steps: "Invoke: `<phrasing.workflowInvocation>`, with `<hint>` as the argument", so the skill says how it is called and not only what it does (P9-31).

Frontmatter: `name` = workflow id, `description` = workflow description, plus harness extras
(`user-invocable: true` and `argument-hint` for Claude Code; `agents/openai.yaml` sidecar for Codex). Step numbers are
stable because nodes are visited in walk order and ties (several outgoing sequential edges) are
broken by target node id.

### Other shared pieces

| Emitter                                      | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emitReadme(blueprint, targets)`             | Root `README.md`: what the repository is, how to use it with each target, the command menu each target will show (workflows and the skills offered as commands, with their invocation), the compiled file map, and how to regenerate. Only generated when no `README.md` exists or the previous manifest owns it. With `options.repository` (`owner/name`, which a push knows and `compileBlueprint` passes through) the install commands of a plugin-layout target name the repository instead of `<owner>/<repo>` (P9-33). |
| `lowerPermissions(permissionSet, target)`    | Applies the per-harness table in `docs/harness/<id>.md`; returns the harness structure plus `CompatibilityIssue`s for anything widened or dropped.                                                                                                                                                                                                                                                                                                                                                                           |
| `lowerHooks(hooks, gates, ironLaws, target)` | Applies the trigger and action tables; gate criteria with commands become `before-stop` hooks; laws with `enforcement` including `hook` become `check-iron-laws` hooks.                                                                                                                                                                                                                                                                                                                                                      |
| `generatedHeader(sourcePath)`                | `<!-- Generated by Agent Blueprint from blueprint/<path>. Edit the source, not this file. -->` as the first line of Markdown outputs only. JSON, TOML, YAML and TypeScript outputs carry no header (JSON has no comments; the others would leak into tool parsers).                                                                                                                                                                                                                                                          |

## Determinism contract

- No timestamps, hostnames, random ids, tool versions or environment values in any output.
- Ordering: entities in `blueprint.targets` / manifest order (which is the collection order after `readProject`), ties by slug; within a file, sections in the fixed orders above; lists sorted only where order carries no meaning.
- One file per artifact wherever the harness allows, so a change to one skill is a one-file diff.
- `compile(normalize(x))` twice yields identical `files`; a golden-file test per adapter over every fixture in `packages/fixtures` enforces this, and a second test compiles the same fixture with reversed collection order in memory and expects byte-identical output after normalization.
- Encoders: `toYaml` for YAML/frontmatter, `stableJson` for JSON that follows schema key order, `canonicalJson` for JSON with no natural order (build manifest), TOML via a small deterministic writer in `exporters/src/shared/toml.ts` (keys in insertion order).
- Line endings LF; every file ends with exactly one newline.

## Ownership rules

- `build-manifest.json` (see `packages/core/src/project/build-manifest.ts`) lists every generated path with `sha256:<hex>` under its owner and the adapter version.
- The writer only deletes paths present in the previous manifest and absent from the new one.
- The writer never overwrites a file that exists and is not in the previous manifest; it reports it as `skipped` so the UI can ask.
- A file whose current hash differs from the previous manifest's hash was edited by hand; the writer overwrites it but reports it as `modifiedSinceBuild` so the UI can warn before losing the edit.
- `README.md` is generated once (when absent) and thereafter only if owned.
- The `blueprint/` source directory is never written by the compiler; only `writeProject` in core touches it.

## Primary agent rule

`blueprint.settings.primaryAgentId` names the agent whose persona becomes the root instruction
file. When unset and `agents.length >= 1`, `agents[0]` is used and validation warns
(`BP-AGENT-002`) once there is more than one agent. All other agents compile to the harness's
subagent primitive, or to persona-switch prompts where subagents are unsupported (Pi).

## Claude Code adapter mapping (summary; full table in `docs/harness/claude-code.md`)

| Blueprint                                           | Output                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary agent + laws + rules + roster + memory seed | `CLAUDE.md`                                                                                                                                                                                                                                                                               |
| Rules with `paths`                                  | `.claude/rules/<id>.md`                                                                                                                                                                                                                                                                   |
| Skills                                              | `.claude/skills/<id>/SKILL.md` + resources                                                                                                                                                                                                                                                |
| Other agents                                        | `.claude/agents/<id>.md`                                                                                                                                                                                                                                                                  |
| Workflows                                           | `.claude/skills/<id>/SKILL.md` (orchestration)                                                                                                                                                                                                                                            |
| Hooks, gates, permissions, auto-memory flag         | `.claude/settings.json`                                                                                                                                                                                                                                                                   |
| MCP tools                                           | `.mcp.json`                                                                                                                                                                                                                                                                               |
| Agent-level references                              | `.claude/references/<id>.md` + `@` import                                                                                                                                                                                                                                                 |
| With `layout: plugin` (P9-27)                       | `plugins/claude-code/` (manifest, `instructions.md`, `skills/`, `agents/`, `hooks/`, `.mcp.json`) and `.claude-plugin/marketplace.json`; no `CLAUDE.md` or rules directory; deny and ask permissions as `PreToolUse` handlers (P9-34) — see `docs/harness/claude-code.md` "Plugin layout" |

## Codex adapter mapping (summary; full table in `docs/harness/codex.md`)

| Blueprint                                           | Output                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary agent + laws + rules + roster + memory seed | `AGENTS.md` (shared)                                                                                                                                                                                                                                   |
| Skills                                              | `.agents/skills/<id>/SKILL.md` + `agents/openai.yaml` + resources (shared)                                                                                                                                                                             |
| Other agents                                        | `.codex/agents/<id>.toml` + `[agents]` / `[features]` in `.codex/config.toml`                                                                                                                                                                          |
| Workflows                                           | `.agents/skills/<id>/SKILL.md` (orchestration, shared)                                                                                                                                                                                                 |
| Hooks, gates                                        | `.codex/hooks.json`                                                                                                                                                                                                                                    |
| Permissions, MCP, memories flags                    | `.codex/config.toml`                                                                                                                                                                                                                                   |
| Rules with directory `paths`                        | nested `AGENTS.md`                                                                                                                                                                                                                                     |
| With `layout: plugin` (P9-28)                       | `plugins/codex/` (manifest, `instructions.md` injected at SessionStart, `guide` skill, skills, hooks with scripts, `.mcp.json`) and `.agents/plugins/marketplace.json`; no `AGENTS.md`, agents or config — see `docs/harness/codex.md` "Plugin layout" |

## Copilot adapter mapping (summary; full table in `docs/harness/copilot.md`)

| Blueprint                                           | Output                                                                                                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary agent + laws + rules + roster + memory seed | `AGENTS.md` (shared) + `.github/copilot-instructions.md` pointing at it                                                                                                                                                          |
| Skills                                              | `.github/skills/<id>/SKILL.md` + resources                                                                                                                                                                                       |
| Other agents                                        | `.github/agents/<id>.agent.md` (`tools` allowlist, `agents` subagents)                                                                                                                                                           |
| Workflows                                           | `.github/skills/<id>/SKILL.md` + `.github/prompts/<id>.prompt.md`                                                                                                                                                                |
| Rules with `paths`                                  | `.github/instructions/<id>.instructions.md` (`applyTo`)                                                                                                                                                                          |
| Hooks, gates, hook-enforced laws                    | `.github/hooks/blueprint.json`                                                                                                                                                                                                   |
| With `layout: plugin` (P9-36)                       | `plugins/copilot/` (Agent Plugins 1.0 `plugin.json`, `skills/`, `mcp.json`, `com.github.copilot/` agents, rules and hooks) and `.github/plugin/marketplace.json`; no `AGENTS.md` — see `docs/harness/copilot.md` "Plugin layout" |
| MCP tools                                           | `.vscode/mcp.json` (editor only)                                                                                                                                                                                                 |

## OpenCode adapter mapping (summary; full table in `docs/harness/opencode.md`)

| Blueprint                                           | Output                                                          |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Primary agent + laws + rules + roster + memory seed | `AGENTS.md` (shared)                                            |
| Skills                                              | `.agents/skills/<id>/SKILL.md` + resources (shared)             |
| Other agents                                        | `.opencode/agents/<id>.md` (`mode: subagent`, own `permission`) |
| Workflows                                           | `.agents/skills/<id>/SKILL.md` + `.opencode/commands/<id>.md`   |
| Permissions, MCP, loose references                  | `opencode.json` (`permission`, `mcp`, `instructions`)           |
| Rules with directory `paths`                        | nested `AGENTS.md` (shared with Codex)                          |
| Hooks, gates                                        | not emitted; they need a TypeScript plugin (P8-10)              |

## Pi adapter mapping (summary; full table in `docs/harness/pi.md`)

| Blueprint                                           | Output                                                     |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Primary agent + laws + rules + roster + memory seed | `AGENTS.md` (shared)                                       |
| Iron Laws with `severity: critical`                 | `.pi/APPEND_SYSTEM.md`                                     |
| Skills                                              | `.agents/skills/<id>/SKILL.md` + resources (shared)        |
| Other agents                                        | `.pi/prompts/<id>.md` persona template; no subagent exists |
| Workflows                                           | `.agents/skills/<id>/SKILL.md` + `.pi/prompts/<id>.md`     |
| Permissions                                         | `.pi/settings.json` `defaultTools`                         |
| Rules with directory `paths`                        | nested `AGENTS.md` (shared with Codex and OpenCode)        |
| Hooks, gates                                        | not emitted; they need a TypeScript extension (P8-11)      |

## Repository layout after compilation

```
<repo>/
├── blueprint/                     source of truth (never touched by the compiler)
│   └── build-manifest.json        written by the compiler
├── README.md                      generated once
├── CLAUDE.md                      claude-code
├── .claude/{rules,skills,agents,references}/   claude-code
├── .claude/settings.json          claude-code
├── .mcp.json                      claude-code (only with MCP tools)
├── AGENTS.md                      shared: codex, copilot, opencode, pi
├── .agents/skills/<id>/           shared: codex, opencode, pi
├── .codex/{config.toml,hooks.json,agents/}      codex
├── .github/{skills,agents,instructions,prompts,hooks}/   copilot
├── .vscode/mcp.json               copilot (only with MCP tools)
├── opencode.json, .opencode/{agents,commands}/          opencode
└── .pi/{prompts,settings.json,APPEND_SYSTEM.md}         pi
```

With `layout: plugin` on the Claude Code target (P9-27), its files move under `plugins/claude-code/`
and `.claude-plugin/marketplace.json` appears at the root; the Codex target does the same under
`plugins/codex/` with `.agents/plugins/marketplace.json` (P9-28), and the Copilot target under
`plugins/copilot/` with `.github/plugin/marketplace.json` (P9-36); nothing of any of them is
written at the root otherwise. A target option changes what a harness can carry, so `HarnessAdapter.capabilitiesFor`
returns the matrix for the parsed options and `portabilityOf` reads that rather than the
static `capabilities`.

## Worked example: `packages/fixtures/projects/dotnet-testing-expert`

The fixture has one agent (`testing-expert`, primary), three skills (`xunit` with a
`references/xunit-patterns.md` resource, `test-design`, `fluent-assertions`), two workflows
(`write-tests` with a verification node, a retry edge and a gate; `review-tests`), three iron
laws, one rule with `paths`, one `after-file-change` hook running `dotnet test --no-restore`,
one gate `tests-pass`, two tools, one reference, one memory, two requirements and one scenario.
Targets: `claude-code`, `codex`.

Expected output tree:

```
CLAUDE.md
.claude/settings.json
.claude/rules/prefer-existing-framework.md
.claude/skills/xunit/SKILL.md
.claude/skills/xunit/references/xunit-patterns.md
.claude/skills/xunit/references/testing-patterns.md
.claude/skills/test-design/SKILL.md
.claude/skills/test-design/references/testing-patterns.md
.claude/skills/fluent-assertions/SKILL.md
.claude/skills/write-tests/SKILL.md
.claude/skills/review-tests/SKILL.md
AGENTS.md
.agents/skills/xunit/SKILL.md
.agents/skills/xunit/agents/openai.yaml
.agents/skills/xunit/references/xunit-patterns.md
.agents/skills/xunit/references/testing-patterns.md
.agents/skills/test-design/SKILL.md
.agents/skills/test-design/agents/openai.yaml
.agents/skills/test-design/references/testing-patterns.md
.agents/skills/fluent-assertions/SKILL.md
.agents/skills/fluent-assertions/agents/openai.yaml
.agents/skills/write-tests/SKILL.md
.agents/skills/write-tests/agents/openai.yaml
.agents/skills/review-tests/SKILL.md
.agents/skills/review-tests/agents/openai.yaml
.codex/config.toml
.codex/hooks.json
README.md
blueprint/build-manifest.json
```

No `.claude/agents/` or `.codex/agents/` files: there is a single agent, and it is primary.
`testing-patterns` is attached to the `xunit` and `test-design` skills, so it is copied into
both skill directories (one file per consumer keeps skills self-contained per the spec).

`CLAUDE.md` section structure:

```
<!-- Generated by Agent Blueprint from blueprint/. Edit the source, not this file. -->
# .NET Testing Expert
An expert .NET agent that writes and reviews high-quality xUnit unit tests.
## Role                       ← agents/testing-expert.md body
### Responsibilities · ### Expertise · ### Output requirements
## Iron Laws                  ← never-fake-verification (critical), deterministic-tests, no-implementation-details
## Rules                      ← "See .claude/rules/prefer-existing-framework.md" (native path-scoped)
## Workflows                  ← /write-tests, /review-tests
## Skills                     ← xunit, test-design, fluent-assertions
## Memory                     ← project-conventions categories + seed
```

`AGENTS.md` has the same sections, with `## Rules` inlined ("Applies to: **/*.csproj,
**/*Tests.cs") because the fixture's globs are not plain directories, and workflows listed as
`$write-tests` / `$review-tests`.

`.claude/settings.json` contains: `permissions` lowered from the agent (allow `Read`, `Edit`,
`Write`, `Bash(dotnet test *)`, `Bash(dotnet build *)`, read-only git; ask `Bash`,
`Bash(git commit *)`, `Bash(rm *)`; deny `Bash(git push *)`, `Bash(git push --force *)`,
`WebFetch`, `WebSearch`; plus `WebFetch(domain:…)` allows for documentation tools when present),
`hooks.PostToolUse` with matcher `Edit|Write` running `dotnet test --no-restore` (timeout 600),
`hooks.Stop` running `dotnet test` for the `tests-pass` gate and a `prompt` hook for
`never-fake-verification` (enforcement includes `hook`), and `autoMemoryEnabled: true`.

## How to add an adapter

1. Create `packages/exporters/src/<harness>/index.ts` exporting a `HarnessAdapter`; add its id to `HARNESS_IDS` in core if new (it changes `TargetConfig` validation, so bump nothing else).
2. Fill the `CapabilityMatrix` for all twelve concepts with a non-empty explanation each; the compatibility view renders it verbatim.
3. Define `optionsSchema` with Zod; document each option in `docs/harness/<id>.md`.
4. Implement `validate` for harness-specific constraints (size caps, name rules) with `BP-<HARNESS>-NNN` codes.
5. Implement `compile` using the shared emitters; emit a `CompatibilityIssue` for every adapted, limited or unsupported concept the Blueprint actually uses.
6. Register the adapter in `packages/exporters/src/registry.ts`.
7. Tests, all required:
   - golden files under `packages/exporters/tests/__golden__/<harness>/<fixture>/…` for every fixture, compared byte for byte;
   - determinism: compile twice and with shuffled collections → identical;
   - no header on non-Markdown files; every Markdown file starts with `generatedHeader`;
   - every `GeneratedFile.path` is relative, POSIX, and free of `..`;
   - the capability matrix has all concepts;
   - when the harness has a CLI that can validate its own config (for example `claude --help`-level parsing or a JSON schema for `opencode.json`), a schema check against the emitted config.
8. Add the lowering tables to `docs/harness/<id>.md` and a row to the support matrix in `docs/00-vision.md`.

## Implementation notes (P2)

The compiler is implemented. Where it differs from the specification above, the reason is
recorded here rather than by quietly changing the spec.

### `AGENTS.md` and `.agents/skills` are harness-neutral

Codex, OpenCode and Pi read the same paths, and Copilot reads `AGENTS.md`. One path can hold
only one content, so nothing written there names a harness or uses harness-specific
invocation syntax ("Delegate to the `x` agent", not "Spawn the `x` agent"). Per-harness
wording lives in `CLAUDE.md` (which only Claude Code reads), in each harness's own directory,
and in the generated `README.md`, which is the one file allowed to describe every target.
`shared/portable.ts` owns this artifact set and every adapter that reads it calls the same
function, so the pipeline always sees identical bytes and merges them into one `shared` file.

### The generated-file header sits after frontmatter

YAML frontmatter has to start at byte 0 or the harness will not parse it, so files with
frontmatter carry the header as the first line of the body instead. Scripts and assets copied
from a skill's resources carry no header at all: a comment would corrupt them.

### Adapter options are parsed, not typed at the schema

`HarnessAdapter` exposes `optionsSchema` for documentation and for the settings UI, plus
`parseOptions(raw)` which returns the typed options or throws. A `ZodType<Options>` cannot
express a schema whose input and output differ (which is what defaults do), and every adapter
has defaults.

### `compileBlueprint` is synchronous

Compilation is pure and synchronous so the UI can preview output on each keystroke. Only
hashing (`buildManifestFor`) and file access (`compileProject`, `writeCompiled`) are
asynchronous, because Web Crypto and `VirtualFs` are.

### Gates compile to `Stop` hooks only

The spec suggested `Stop` and `SubagentStop`. Running a test suite again on every subagent
return is expensive and rarely what the author meant, so gates compile to `Stop` alone; the
gate text is also in the workflow skill, so a subagent still knows the checkpoint exists.

### Determinism tests

Collection order is authored order and is meaningful (it drives the order of the skills index
and the agent roster), so `normalizeBlueprint` does not sort collections and reversing them
is expected to change the output. The determinism tests therefore compile the same Blueprint
twice, compile a deep clone, and reverse the node and edge arrays inside each workflow, which
normalization does sort.

### A failure means what the Blueprint says (P9-25)

Claude Code and Codex read a hook's verdict from its exit code, and only exit 2 refuses or
reaches the model. A command written for people — `dotnet test`, `npm run lint` — exits 1
and prints to stdout, so passed through verbatim it could never block and its failure could
never be seen. `failing()` in `shared/hooks.ts` wraps every command in both adapters:
silent on success, the output on stderr with the code the outcome needs on failure. The
wrapper is the one place that knows the convention; the adapters pass the Blueprint's
`onFailure` or a gate's `onFail`, and whether the command runs when the agent stops. On
`Stop` and `SubagentStop` both harnesses say in the input whether the agent was already sent
back once this turn (`stop_hook_active`), and a block that repeats on the same failure would
only send it round again — Claude Code stops that after eight rounds — so there the wrapper
blocks once and reports a repeat with exit 1. Reported from use: a secret scanner the
installed project did not have blocked every stop, eight times per turn.

### A subagent's permissions are its own (P9-26)

Claude Code has no permission lists per subagent, only `tools` and `disallowedTools`, which
name whole tools. The adapter turns a tool off when every operation behind it that the agent
decides is denied — the rule Copilot's `toolAliases` already used — and writes the denials
that survive (`git.push` while the shell stays) into the agent's prompt. A `tools:` list is a
whitelist, so an agent that delegates gets `Agent(<delegates>)` on it; without that line the
list would take delegation away. Codex's agent file gets the one permission it can carry,
`sandbox_mode = "read-only"`.

### A hook can be a file (P9-30)

A one-line command cannot scan what an edit introduced or run a check with several steps.
`action.script` is that check as a shell script: the model carries it as text, the project
file writes it as a block scalar, and `hookScriptFile` in `shared/hooks.ts` emits it once per
harness — `.claude/hooks/`, `.codex/hooks/`, `.github/hooks/scripts/` — with a shebang added
when the author left one out. `effectiveCommand` gives the hook the harness's way of running
that file, and the failure wrapper goes around it as around any command. The wrapper also
prints the command's output on success now: a script that answers on stdout, with a JSON
decision or context to inject, must not have its answer swallowed.

### Codex hooks file shape

`docs/harness/codex.md` documents the events and handler fields but not the wrapper object.
The adapter writes `{ "hooks": { "<Event>": [ { "hooks": [ … ] } ] } }`, mirroring Claude
Code, which matches every published example. Verify against the Codex hooks documentation
before relying on it in production.

## Implementation notes (P8-01, Copilot)

### A workflow prompt file points at the skill instead of repeating it

Copilot has two ways to carry a procedure: a skill, which every client reads, and a prompt
file, which makes it `/`-invocable in the editor. Emitting the full orchestration body into
both would put two copies of the same procedure in one repository. The prompt file therefore
carries the name and description and tells the agent to read
`.github/skills/<id>/SKILL.md` — the same choice `.github/copilot-instructions.md` already
makes about `AGENTS.md`.

### Handoffs are not emitted

`handoffs[]` hangs off a custom agent file, but the Blueprint's delegate steps hang off a
workflow, whose Copilot form is a prompt file, and the primary agent is `AGENTS.md` rather
than a custom agent file at all. There is no agent file to attach a workflow's handoffs to.
What can be expressed is expressed: `delegation.canDelegateTo` becomes the `agents` list on
each non-primary agent file, with the `agent` tool added so the list is usable. A delegation
target that is the primary agent is dropped and reported, since it has no file to hand to.

### Per-command permissions are reported, not enforced

A Copilot `tools` allowlist names tool categories (`read`, `edit`, `execute`, `web`), and a
hook `matcher` is a regex over tool names, not over command text. Neither can say "`dotnet
test` yes, `git push` no". Enforcing a per-command rule would need a `preToolUse` handler that
parses the tool arguments — a script the compiler would be inventing, and one that fails
closed on a non-zero exit. So blanket decisions lower to the allowlist (an alias is dropped
only when every operation behind it is denied) and patterns stay the command policy in
`AGENTS.md`, with a `limited` compatibility issue naming how many rules that covers.

### Prompt-style hooks print a reminder

Copilot documents a `prompt` handler type but not the field that carries the text. Rather than
guess a shape that a `preToolUse` handler would fail closed on, `prompt-check` and
`check-iron-laws` compile to a printed reminder, exactly as they do for Codex. Revisit when
the payload field is confirmed.

### A gate refuses the stop from a command

`agentStop` reads `{ "decision": "block", "reason": … }` from stdout, so a gate criterion
compiles to `<command> || echo '<json>'` in bash and the `$LASTEXITCODE` equivalent in
PowerShell: nothing is printed when the command succeeds, which Copilot reads as allow. The
reason is stripped of quotes first, because it is quoted twice over — once as JSON, once for
the shell.

### `.vscode/mcp.json` configures the editor only

The cloud coding agent takes MCP configuration from repository settings, not from a file, so
the generated file serves VS Code and the adapter says so. `sse` is written as `http`: the
VS Code schema names `stdio` and `http`, and `http` is the transport that replaced SSE. Only
environment variable _names_ are written, never values.

## Implementation notes (P8-02, OpenCode)

### `opencode.json` is not canonical JSON

OpenCode reads a permission pattern object **last match wins**, so the order of the keys _is_
the meaning. `canonicalJson` sorts keys and would silently invert the precedence of a rule set
that is otherwise correct — a `"*": "ask"` catch-all landing after a specific `deny` turns the
deny off. The config is written with `stableJson`, which keeps insertion order, and the objects
are built in the order they are meant to be read: catch-all, then derived rules, then the
author's own patterns, which are the most specific thing they wrote. A test asserts the order in
the serialized bytes, not just in the object.

### The primary agent has no agent file

OpenCode always loads `AGENTS.md`, which already carries the primary persona. An agent file for
it, plus `default_agent`, would put the same persona in context twice. The primary agent's
permissions become the global `permission` block instead, which is also what applies to the
built-in agents a user may switch to. Same reasoning as `CLAUDE.md` and
`.github/copilot-instructions.md`.

### Path-scoped rules do not use `instructions`

`instructions` adds files that are _always_ loaded; it does not scope them. Pointing it at a
generated `.opencode/rules/<id>.md` would duplicate text `AGENTS.md` already carries and gain no
scoping at all. Rules whose globs are plain directories become a nested `AGENTS.md` — byte for
byte the file Codex emits, so the pipeline merges them into one `shared` file — and the rest stay
inlined with an "Applies to" line and are reported.

### One `webfetch` key cannot hold two answers

A Blueprint can allow documentation fetches and deny the open internet. OpenCode has a single
`webfetch` permission and cannot tell them apart. Allowing it grants more than was asked for and
denying it takes away what was granted, so it asks, and a `limited` issue names the domains that
were meant to be free. Keys with no Blueprint meaning (`task`, `skill`, `lsp`, `question`,
`doom_loop`, `external_directory`) are left unset: a guess there restricts an agent in a way
nobody asked for.

### `glob` and `grep` follow `read`

A `read: deny` that left `glob` and `grep` open is not a read ban. They are set from the same
decision — but only when it is a single decision: a path pattern object means something
different for a matcher than for a reader, so patterns stay on `read` alone.

### Hooks are not generated

OpenCode hooks are a TypeScript module the harness auto-loads at session start. Generating code
against an API this repository has not run — and putting it somewhere a syntax or signature
error breaks every session — is a worse outcome than not generating it. Roadmap P8-02 asks for
`opencode.json`, agents and commands; the plugin is recorded as P8-10 with what it needs.

## Implementation notes (P8-03, Pi)

### A denied shell closes both shells

`defaultTools` lists `bash` and `powershell` separately, but they are the same capability on
two platforms. Denying the shell and leaving one of them enabled is not a boundary, so the two
are set together from the shell and git operations. A tool survives while _any_ operation behind
it survives, the same rule the Copilot allowlist uses.

### `ask` is reported, not approximated

Pi has no approval prompt. An `ask` decision could lower to `deny` (which takes away what the
author granted) or to enabled (which drops the approval). It lowers to enabled, because a
Blueprint that asks before mutating the shell still means the shell to be usable, and the lost
approval is reported as a `limited` issue naming every operation it applied to. The intent is
still written into the `AGENTS.md` command policy, which the agent can follow even though nothing
enforces it.

### Critical Iron Laws go in the system prompt

`.pi/APPEND_SYSTEM.md` appends to the system prompt rather than replacing it, which makes it the
strongest placement Pi offers and the closest the harness comes to enforcing a law. Only laws
with `severity: critical` go there: a system prompt that lists everything is a system prompt
nothing stands out in. The rest stay in the `AGENTS.md` Iron Laws section. `.pi/SYSTEM.md` is
never written — replacing Pi's own system prompt would throw away the harness's tool
instructions along with it.

### A non-primary agent becomes a prompt, and the issue says what that costs

Pi has no subagents, so an agent that is not the primary one becomes `.pi/prompts/<id>.md`: a
template that puts the single session into that persona and takes the task as `$ARGUMENTS`. This
is not delegation. The context is shared, and nothing stops the session carrying assumptions
from one persona into the next, so every one of them also produces an `unsupported`
compatibility issue that says so rather than letting the prompt file imply the Blueprint was
honoured. Workflows and personas share `.pi/prompts/`, so an agent and a workflow with the same
id is a `BP-PI-002` error rather than a silent overwrite.

### The extension is not generated

Pi hooks are a TypeScript extension the harness loads from `.pi/extensions/`. The same reasoning
as OpenCode applies, and one more: a generated file is compiler-owned, so a stub a user filled in
would be overwritten on the next export. Handing someone a starting point that their own work
disappears from is worse than handing them nothing. Roadmap P8-11 covers generating a real one,
after the event payloads are verified against a running Pi.

## Implementation notes (P8-04, binary assets)

### `GeneratedFile.content` is a union, on purpose

A skill's `assets/` may hold a diagram or a font, and the compiler copies resources into every
harness that gets the skill. `content` is `string | Uint8Array` with a `binary` format rather
than a second field or a second list, because a union makes ignoring the byte case a compile
error. That is the property worth having: the failure mode being fixed here is a file quietly
becoming something else, which no test notices until someone opens it.

The consequences ripple exactly as far as they should. `mergeFileSets` compares with `sameFile`
instead of `Set` identity; `sha256Hex` takes bytes, so a binary file is hashed into the build
manifest like anything else the compiler owns; and `writeCompiled` reads back the way it wrote,
because reading a PNG as text would report it as changed on every build.

### A binary asset gets no header and no newline

The generated-file header is a comment, and a comment in a PNG is a corrupt PNG. Scripts and
non-Markdown text resources already skipped the header for that reason; binary skips the
trailing newline as well.
