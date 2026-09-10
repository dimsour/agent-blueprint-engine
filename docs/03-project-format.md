# 03 — Project format

The on-disk project is the **source of truth**. `blueprint/` holds one small YAML manifest plus one Markdown or YAML file per artifact. The in-memory `Blueprint` (docs/02-domain-model.md) is assembled from those files by `readProject` and written back by `writeProject`. Compiled harness files (docs/04-compiler.md) are derived output placed next to it at the repository root.

Implementation: `packages/core/src/project/` (`layout.ts`, `read.ts`, `write.ts`, `serialize.ts`, `strip-defaults.ts`, `virtual-fs.ts`, `build-manifest.ts`). Worked example: `packages/fixtures/projects/dotnet-testing-expert/`.

## 1. Directory tree

```
<repo>/
├── blueprint/                          source of truth (settings.sourceDir, default "blueprint")
│   ├── blueprint.yaml                  manifest
│   ├── agents/<id>.md
│   ├── skills/<id>/SKILL.md
│   │            ├── references/*.md    skill resources, kind "reference"
│   │            ├── scripts/*          kind "script"
│   │            └── assets/*           kind "asset"
│   ├── workflows/<id>.md               description + triggers
│   ├── workflows/<id>.workflow.json    graph: entryNodeId, nodes, edges
│   ├── laws/<id>.md
│   ├── rules/<id>.md
│   ├── hooks/<id>.yaml
│   ├── gates/<id>.yaml
│   ├── tools/<id>.yaml
│   ├── references/<id>.md
│   ├── memory/<id>.md
│   ├── requirements/<id>.md
│   ├── scenarios/<id>.yaml
│   └── build-manifest.json             compiler-owned outputs + hashes (written by exporters, planned P2)
├── README.md                           generated once; owned only if the compiler created it (planned P2)
├── CLAUDE.md, .claude/…                compiled for Claude Code (planned P2)
├── AGENTS.md, .agents/skills/…, .codex/…   compiled for Codex; AGENTS.md shared with Copilot / OpenCode / Pi (planned P2)
└── .github/…, opencode.json, .opencode/…, .pi/…   other targets (planned P2/P8)
```

Path helpers in `layout.ts`: `manifestPath(sourceDir)`, `entityMainPath(sourceDir, kind, id)`, `workflowGraphPath`, `skillResourcePath`, `kindDir`, `buildManifestPath`, and the inverse `parseEntityPath(sourceDir, path)` which returns `{ kind, id, role: 'main' | 'graph' | 'resource' }` or `undefined` for non-artifact files. Constants: `MANIFEST_FILE = 'blueprint.yaml'`, `BUILD_MANIFEST_FILE = 'build-manifest.json'`, `SKILL_FILE = 'SKILL.md'`, `WORKFLOW_GRAPH_SUFFIX = '.workflow.json'`.

Paths are POSIX, relative to the repository root, no leading `./`. `normalizePath` rejects `..` segments.

## 2. Manifest: `blueprint.yaml`

Schema: `manifestSchema` = Blueprint header + `artifacts` (ordered id lists per collection). The manifest never contains entity content.

```yaml
schemaVersion: '1.0'
id: dotnet-testing-expert
name: .NET Testing Expert
version: 1.0.0
description: An expert .NET agent that writes and reviews high-quality xUnit unit tests.
settings:
  primaryAgentId: testing-expert
targets:
  - harnessId: claude-code
  - harnessId: codex
artifacts:
  agents:
    - testing-expert
  skills:
    - xunit
    - test-design
    - fluent-assertions
  workflows:
    - write-tests
    - review-tests
  ironLaws:
    - never-fake-verification
    - deterministic-tests
    - no-implementation-details
  rules:
    - prefer-existing-framework
  hooks:
    - run-tests-after-change
  gates:
    - tests-pass
  tools:
    - dotnet-cli
    - filesystem
  references:
    - testing-patterns
  memories:
    - project-conventions
  requirements:
    - verify-before-claiming
    - use-existing-framework
  scenarios:
    - payment-service-tests
```

Rules:

- Key order is the schema order: `schemaVersion, id, name, version, description, settings, targets, artifacts`.
- `version` is always written (it is part of the project's identity) even though the schema has a default. Other defaults are omitted: `settings.sourceDir: blueprint`, `targets[].enabled: true`, `targets[].options: {}`. Empty collections are omitted from `artifacts`.
- `artifacts.<collection>` order **is** the collection order in memory (agent roster order, skill priority order). The reader loads listed ids first, in that order, then appends files found on disk that are not listed (warning `BP-PROJECT-004`).
- `settings.sourceDir` in the manifest is informational. The reader always uses the directory it was asked to read; a mismatch produces info `BP-PROJECT-006`.

## 3. Artifact file formats

The format per kind comes from `ENTITY_KIND_INFO[kind].format`:

| Format     | Kinds                                                 | File                                                                                                                                                 |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markdown` | agent, iron-law, rule, reference, memory, requirement | `<dir>/<id>.md`: YAML frontmatter = fields, body = the entity's `body`                                                                               |
| `skill`    | skill                                                 | `skills/<id>/SKILL.md` (frontmatter + body) plus one file per `resources[]` entry at `skills/<id>/<resource.path>`                                   |
| `workflow` | workflow                                              | `workflows/<id>.md` (frontmatter: name, description, tags, metadata, triggers; body) plus `workflows/<id>.workflow.json` (entryNodeId, nodes, edges) |
| `yaml`     | hook, gate, tool, scenario                            | `<dir>/<id>.yaml`: the whole entity as a YAML mapping                                                                                                |

### 3.1 Frontmatter contract (markdown, skill, workflow `.md`)

```
---
<yaml mapping, schema key order>
---

<body>
```

- `id` is **never** written; it is the file name (`agents/testing-expert.md` → `testing-expert`, `skills/xunit/SKILL.md` → `xunit`).
- `body` is never in the frontmatter; it is the Markdown after the closing `---`, separated by one blank line. Bodies are normalized (LF, no trailing whitespace, single trailing newline in the file). An empty body yields a file ending right after the closing `---`.
- Keys appear in schema order (`Object.keys(schema.shape)`); nested objects are in schema order too because the value has been parsed by the schema.
- Values equal to their schema default are omitted (`stripDefaults`), then empty strings, empty arrays and empty objects are omitted (`pruneEmpty`). The reader restores defaults through the same schema, so read → write → read is lossless. Examples: an iron law's `severity: high`, `scope: { all: true }` and `enforcement: [instruction]` are not written; a rule's `category: general` / `priority: normal` are not written; a hook's `onSuccess: continue`, `onFailure: block`, `severity: high` are not written.
- Unknown keys are preserved: the reader moves them under `metadata` (when they are JSON values and the key is not already used) and reports info `BP-PROJECT-005`. They are written back as `metadata` entries.
- Frontmatter that is not a YAML mapping is an error (`BP-PROJECT-003`). Missing frontmatter is tolerated (`data = {}`), which then fails schema validation because `name` is required.

Example, `laws/deterministic-tests.md` (defaults omitted):

```markdown
---
name: Keep Tests Deterministic
description: Tests must produce the same result on every run.
rule: Never write a test that depends on wall-clock time, random values, network access, test ordering or shared mutable state.
rationale: Flaky tests erode trust in the suite and hide real regressions.
category: testing
---
```

Example, `agents/testing-expert.md` (excerpt):

```markdown
---
name: Testing Expert
description: Senior .NET engineer specialised in unit testing with xUnit and FluentAssertions.
tags:
  - dotnet
  - testing
role: worker
expertise:
  - C# and .NET 8+
  - xUnit
responsibilities:
  - Write unit tests for the code the user points at
skillIds:
  - xunit
  - test-design
  - fluent-assertions
permissions:
  operations:
    fs.read: allow
    fs.write: allow
    git.push: deny
  patterns:
    - operation: shell.mutating
      pattern: dotnet test *
      decision: allow
model:
  preference: strong
---

You are a senior .NET engineer who specialises in unit testing.

## How you work

1. Read the code under test and the existing tests before writing anything.
```

`permissions.operations` keys are written in `PERMISSION_OPERATIONS` order (normalization reorders them).

### 3.2 Skills

`skills/<id>/SKILL.md` frontmatter holds every skill field except `id`, `body` and `resources`. Resources are files:

| Path prefix                       | `resource.kind`                                     |
| --------------------------------- | --------------------------------------------------- |
| `references/`                     | `reference`                                         |
| `scripts/`                        | `script`                                            |
| anything else under the skill dir | `asset` when under `assets/`, otherwise `reference` |

The reader lists everything under `skills/<id>/` other than `SKILL.md` and infers `kind` from the first path segment (`inferResourceKind`). Resource paths must be relative and must not contain `..` (`relativePathSchema`).

A resource may be binary — a diagram, a font, a screenshot. The reader reads bytes and decides from the content, not from the extension: a file that decodes as UTF-8 and holds no NUL byte is text, and `encoding` is `utf8` with `content` the file itself; anything else is `base64`. An extension list would get a `.dat` full of text wrong in one direction and a `.md` full of bytes wrong in the other. Text resources are written with a single trailing newline; a binary resource is written as its bytes, since a newline would corrupt it.

The source SKILL.md uses the Blueprint field names (`name` is the display name, `whenToUse`, `activation`, …). The **compiled** SKILL.md emitted by adapters (planned P2) is Agent-Skills-spec conformant (`name` = slug, `description` ≤ 1024, `allowed-tools`, …); the two are different files.

### 3.3 Workflows

`workflows/<id>.md`:

```markdown
---
name: Write Unit Tests
description: From a request to the finished, verified test file.
tags:
  - testing
triggers:
  intents:
    - write tests
    - add unit tests
---

Understand the unit, design the tests, implement them, run them, and only then report.
```

`workflows/<id>.workflow.json` is written with `stableJson` (2-space indent, insertion order, trailing newline). Keys follow the schema: top-level `entryNodeId, nodes, edges`; nodes `id, type, label, description, position, config`; edges `id, from, to, kind, required, condition, label`. Defaults are omitted (`kind: sequential`, `required: true`, empty `config`, empty `contextInputs`). Nodes and edges are sorted by id by normalization.

```json
{
  "entryNodeId": "start",
  "nodes": [
    {
      "id": "assess",
      "type": "skill",
      "label": "Assess design",
      "position": {
        "x": 0,
        "y": 240
      },
      "config": {
        "skillId": "test-design"
      }
    },
    {
      "id": "end",
      "type": "end",
      "label": "Done",
      "position": {
        "x": 0,
        "y": 600
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "from": "start",
      "to": "read"
    },
    {
      "id": "e6",
      "from": "run-tests",
      "to": "implement",
      "kind": "retry",
      "required": false,
      "condition": "tests fail",
      "label": "fix and retry"
    }
  ]
}
```

A missing `.workflow.json` is tolerated (empty graph, which then fails `BP-WF-001`). A `.workflow.json` without its `.md` is not an artifact (the `.md` is the main file) and is reported as missing via the manifest.

### 3.4 YAML kinds

`hooks/run-tests-after-change.yaml`:

```yaml
name: Run tests after change
description: Runs the affected test project whenever a C# file is edited and returns failures to the agent.
trigger: after-file-change
conditions:
  filePatterns:
    - '**/*.cs'
action:
  type: run-tests
  command: dotnet test --no-restore
  timeoutSec: 600
onFailure: return-to-agent
```

`gates/tests-pass.yaml`:

```yaml
name: Tests must pass
description: The task cannot be reported as complete while any test fails.
criteria:
  - kind: tests-pass
    description: All tests in the affected projects pass.
    command: dotnet test
```

Same rules as frontmatter: schema key order, defaults and empties omitted, `id` from the file name, unknown keys kept under `metadata`.

## 4. Serialization contract

`serialize.ts`:

| Function                                                    | Guarantee                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toYaml(value)`                                             | `yaml` library, `lineWidth: 0` (no wrapping), indent 2, plain keys and strings where possible, literal block scalars (`\|`) for multi-line strings, no anchors/aliases, trailing newline. Strings that would parse as another type are quoted automatically (`"1.0"`, `"**/*.cs"`). |
| `fromYaml(text)`                                            | strict, duplicate keys rejected                                                                                                                                                                                                                                                     |
| `stableJson(value)`                                         | `JSON.stringify(value, null, 2)` + newline, insertion order (used for workflow graphs)                                                                                                                                                                                              |
| `canonicalJson(value)`                                      | same but keys sorted recursively (used for hashing / equality)                                                                                                                                                                                                                      |
| `encodeFrontmatter(data, body)` / `decodeFrontmatter(text)` | as in §3.1; the decoder normalizes CRLF to LF and strips trailing newlines                                                                                                                                                                                                          |
| `pruneEmpty(value)`                                         | removes `undefined`, `''`, `[]`, `{}` recursively; keeps `false` and `0`                                                                                                                                                                                                            |
| `stripDefaults(value, schema)`                              | removes values equal to their Zod `default`/`prefault`, recursively through `optional`, `object`, `array`                                                                                                                                                                           |
| `sha256Hex(text)`                                           | Web Crypto SHA-256, used for build-manifest hashes                                                                                                                                                                                                                                  |

Line endings are always LF (`.gitattributes` enforces it in this repo too). No timestamps, no random ids, no generator banners in source files.

Determinism tests (`packages/core/tests/project.test.ts`): rendering the fixture reproduces it byte for byte; rendering twice is identical; cosmetic input differences (key order, CRLF, trailing whitespace, duplicate ids, node order) do not change the output.

## 5. Reader: `readProject(fs, { sourceDir })`

Returns `{ blueprint, diagnostics, sourceSchemaVersion }`. Tolerant by design: a broken artifact becomes an error diagnostic and is skipped; the rest still loads so the UI can show the problem in place.

Fatal (`ProjectReadError`, with `code`):

| Code                         | When                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `MANIFEST_MISSING`           | no `<sourceDir>/blueprint.yaml`                                                                      |
| `MANIFEST_INVALID`           | not YAML, not a mapping, or fails `manifestSchema`                                                   |
| `UNSUPPORTED_SCHEMA_VERSION` | (thrown as `UnsupportedSchemaVersionError` from migrations) no migration path to the current version |

Diagnostics (`PROJECT_DIAGNOSTICS`):

| Code             | Severity | When                                                                                                                           |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `BP-PROJECT-002` | error    | id listed in the manifest but the main file does not exist; entity skipped                                                     |
| `BP-PROJECT-003` | error    | main file cannot be parsed (YAML/JSON/frontmatter) or fails the entity schema; entity skipped; message includes the Zod issues |
| `BP-PROJECT-004` | warning  | main file found on disk but not listed in the manifest; appended after the listed ones (alphabetical)                          |
| `BP-PROJECT-005` | info     | unknown keys moved under `metadata`                                                                                            |
| `BP-PROJECT-006` | info     | manifest `settings.sourceDir` differs from the directory actually read                                                         |

Order of operations: read manifest → `migrateManifest` → parse → for each kind: listed ids then discovered ids → read main file (+ graph / resources) → `migrateEntity` → move unknown keys → schema parse → `normalizeBlueprint` over the assembled object.

## 6. Writer: `renderProjectFiles` and `writeProject`

`renderProjectFiles(bp, { sourceDir? }): Record<string, string>` is pure: normalize, then render every file, sorted by path. It is what tests compare and what ZIP / GitHub exporters consume.

`writeProject(bp, fs, { sourceDir?, prune? })`:

1. Renders all files.
2. Writes only files whose content differs from what `fs.read` returns (`written` vs `unchanged`), so timestamps and Git status stay clean.
3. When `prune !== false`, lists each kind directory and deletes files that are recognised artifacts (`parseEntityPath` succeeds) but were not rendered: stale files after a delete or rename. Files it does not recognise (`blueprint/notes.md`, a stray `README` inside `skills/`) are never touched. Nothing outside the kind directories and the manifest is ever written or deleted.

## 7. VirtualFs

```ts
type ProjectFile = string | Uint8Array

interface VirtualFs {
  read(path): Promise<string | undefined> // undefined when the bytes are not text
  readBinary(path): Promise<Uint8Array | undefined>
  write(path, content: string): Promise<void>
  writeBinary(path, content: Uint8Array): Promise<void>
  delete(path): Promise<void>
  exists(path): Promise<boolean>
  list(prefix?): Promise<string[]> // sorted
}
```

`MemoryFs` is the in-memory implementation (`new MemoryFs(files)`). The web app's backends are
`filesToZip` / `zipToFiles` (jszip), `IndexedDbStore`, `FileSystemAccessStore` (Chromium
directory handle) and `GitHubTreeFs` (read-only view of a remote tree); a `NodeFs` for the CLI
is deferred. Core has no Node or browser dependency.

Most of a project is text, and `read`/`write` are what nearly everything uses. `readBinary` and
`writeBinary` exist for a skill's `assets/`: a font or a diagram read as UTF-8 comes back as
something that is no longer the file. `renderProjectFiles` therefore returns
`Record<string, ProjectFile>` — a union, so that a backend which ignores the byte case is a
compile error rather than a file quietly lost (P8-04).

## 8. `build-manifest.json`

Written by the compiler (planned P2) at `<sourceDir>/build-manifest.json`; schema in `build-manifest.ts`:

```json
{
  "schemaVersion": 1,
  "shared": {
    "adapterVersion": "1.0.0",
    "files": { "AGENTS.md": "sha256:…" }
  },
  "targets": {
    "claude-code": {
      "adapterVersion": "1.0.0",
      "files": {
        "CLAUDE.md": "sha256:…",
        ".claude/skills/xunit/SKILL.md": "sha256:…"
      }
    }
  }
}
```

- `ownedPaths(manifest)` lists every path the compiler owns. A re-export deletes owned paths it no longer produces and refuses to overwrite unowned paths without confirmation.
- Hashes let the app detect that a user edited a generated file by hand.
- No timestamps: the file changes only when generated content changes.

## 9. Compiled output locations (summary; details in docs/04-compiler.md)

| Target      | Root files                                     | Directories                                                                                                                   |
| ----------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| claude-code | `CLAUDE.md`                                    | `.claude/skills/<id>/SKILL.md`, `.claude/agents/<id>.md`, `.claude/rules/<id>.md`, `.claude/settings.json`                    |
| codex       | `AGENTS.md`                                    | `.agents/skills/<id>/SKILL.md` (+ `agents/openai.yaml`), `.codex/agents/<id>.toml`, `.codex/config.toml`, `.codex/hooks.json` |
| copilot     | `AGENTS.md`, `.github/copilot-instructions.md` | `.github/skills/`, `.github/agents/*.agent.md`, `.github/instructions/*.instructions.md`, `.github/hooks/*.json`              |
| opencode    | `AGENTS.md`, `opencode.json`                   | `.agents/skills/`, `.opencode/agents/`, `.opencode/commands/`                                                                 |
| pi          | `AGENTS.md`                                    | `.agents/skills/`, `.pi/prompts/`, `.pi/settings.json`                                                                        |

`AGENTS.md` and `.agents/skills/` are shared between targets; the shared emitter composes one file and the build manifest records it under `shared`.

## 10. Migrations

`packages/core/src/migrations/index.ts`. Migrations run on raw data before Zod parsing, so an old project loads in a newer app. Blueprint schema versioning is independent of adapter versions.

```ts
interface Migration {
  from: string
  to: string
  description: string
  manifest(raw: RawRecord): RawRecord
  entity(kind: EntityKind, raw: RawRecord): RawRecord
}
```

`MIGRATIONS` is an ordered chain (`from` of each = `to` of the previous). `migrationPath(version)` returns the chain to `CURRENT_SCHEMA_VERSION` or throws `UnsupportedSchemaVersionError`; `migrateManifest(raw)` and `migrateEntity(kind, raw, fromVersion)` apply it. A numeric `schemaVersion: 1.0` in YAML is accepted and normalized to the string `"1.0"`.

To add one:

1. Bump `BLUEPRINT_SCHEMA_VERSION` in `src/schema/blueprint.ts`.
2. Append `{ from: '1.0', to: '1.1', … }` to `MIGRATIONS`.
3. Add a fixture project at the old version under `packages/fixtures/projects/` and a test in `packages/core/tests/migrations.test.ts` that reads it and asserts the migrated shape.
4. Document the change in this file and in `docs/10-decisions.md`.

## 11. Worked example: the fixture

`packages/fixtures/projects/dotnet-testing-expert/blueprint/` contains 23 files: the manifest, 1 agent, 3 skills (one with a reference resource), 2 workflows (4 files), 3 iron laws, 1 rule, 1 hook, 1 gate, 2 tools, 1 reference, 1 memory, 2 requirements, 1 scenario.

```
blueprint/
├── blueprint.yaml
├── agents/testing-expert.md
├── skills/xunit/SKILL.md
├── skills/xunit/references/xunit-patterns.md
├── skills/test-design/SKILL.md
├── skills/fluent-assertions/SKILL.md
├── workflows/write-tests.md
├── workflows/write-tests.workflow.json
├── workflows/review-tests.md
├── workflows/review-tests.workflow.json
├── laws/never-fake-verification.md
├── laws/deterministic-tests.md
├── laws/no-implementation-details.md
├── rules/prefer-existing-framework.md
├── hooks/run-tests-after-change.yaml
├── gates/tests-pass.yaml
├── tools/dotnet-cli.yaml
├── tools/filesystem.yaml
├── references/testing-patterns.md
├── memory/project-conventions.md
├── requirements/verify-before-claiming.md
├── requirements/use-existing-framework.md
└── scenarios/payment-service-tests.yaml
```

`requirements/verify-before-claiming.md` shows declarative checks:

```markdown
---
name: Verify before claiming success
statement: The agent must run the tests and observe the result before reporting a task as complete.
checks:
  - type: workflow-has-node-type
    nodeType: verification
    workflowId: write-tests
  - type: iron-law-matches
    pattern: never (claim|fake).*verif
  - type: gate-exists
    criterionKind: tests-pass
---
```

(`level: must` is the default and therefore omitted.)

The fixture is kept canonical by `pnpm --filter @agent-blueprint/core fixtures:canonicalize` (reads, normalizes, rewrites). `packages/core/tests/project.test.ts` fails if the fixture drifts from canonical form.

## 12. Future CLI (planned)

The format is usable without the web app. A CLI is a thin wrapper over `core` and `exporters` with a Node `VirtualFs`:

```ts
// blueprint validate
const fs = new NodeFs(process.cwd())
const { blueprint, diagnostics } = await readProject(fs, { sourceDir: 'blueprint' })
const all = [...diagnostics, ...validateBlueprint(blueprint)]
print(all)
process.exitCode = summarizeDiagnostics(all).errors > 0 ? 1 : 0

// blueprint build / export <harness>
const result = compileBlueprint(blueprint, { targets: ['claude-code'] }) // exporters, planned P2
await writeGeneratedFiles(result, fs) // honours build-manifest.json ownership

// blueprint test
runScenarios(blueprint, { mode: 'manual' | 'ai-judge' }) // planned P8+
```

Nothing in `packages/core` or `packages/exporters` imports React, Next.js or browser APIs, so this needs only a `NodeFs` implementation and an argument parser.
