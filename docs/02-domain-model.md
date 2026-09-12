# 02 — Domain model

The canonical Blueprint model lives in `packages/core`. Every shape is defined **once** as a Zod schema (`packages/core/src/schema/*.ts`); the TypeScript types in `packages/core/src/model/types.ts` are inferred from those schemas (`z.output` = normalized form with defaults applied, `z.input` = what callers may pass). Markdown files, the visual graph and harness outputs are all derived from this model. Never the other way round.

Source files:

| File                       | Contents                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| `src/model/ids.ts`         | `Slug`, `SLUG_RE`, `isSlug`, `slugify`, `uniqueSlug`                      |
| `src/model/kinds.ts`       | `ENTITY_KINDS`, `ENTITY_KIND_INFO`, `HARNESS_IDS`, collection/dir mapping |
| `src/model/refs.ts`        | `visitRefs`, `collectRefs`, every cross-reference site                    |
| `src/model/types.ts`       | inferred types, `EntityRef`, `refKey`                                     |
| `src/schema/common.ts`     | `entityBaseSchema`, shared enums, `scopeSchema`                           |
| `src/schema/agent.ts`      | Agent, permissions                                                        |
| `src/schema/skill.ts`      | Skill, activation, resources                                              |
| `src/schema/workflow.ts`   | Workflow, nodes, edges                                                    |
| `src/schema/governance.ts` | IronLaw, Rule, Hook, Gate                                                 |
| `src/schema/knowledge.ts`  | Tool, Reference, MemoryDefinition                                         |
| `src/schema/quality.ts`    | Requirement, RequirementCheck, Scenario                                   |
| `src/schema/blueprint.ts`  | Blueprint header, settings, targets, manifest                             |

## 1. Identifiers

- `id` is a **slug**: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1–64 characters (`SLUG_MAX_LENGTH`). The limit and character set come from the Agent Skills specification, which requires a skill's `name` to equal its directory name.
- Ids are unique **per entity kind** (a skill and a workflow may share an id).
- The id is the file name on disk and the key used by every cross-reference. Changing an id is a refactor: call `renameEntity(bp, kind, oldId, newId)`, which rewrites every reference site and throws `RenameError` (`NOT_FOUND`, `INVALID_SLUG`, `ID_TAKEN`, `NO_CHANGE`) otherwise.
- Display names live in `name` (free text, ≤200 chars). `slugify('xUnit Testing!')` → `xunit-testing`; `uniqueSlug(text, taken, fallback)` appends `-2`, `-3`, … on collision.
- Workflow node ids and edge ids are slugs too, unique within their workflow.

## 2. EntityBase

Every entity extends `entityBaseSchema`:

| Field         | Type                      | Default | Required | Meaning                                                                                                    |
| ------------- | ------------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `id`          | Slug                      |         | yes      | File name and reference key                                                                                |
| `name`        | string (1–200)            |         | yes      | Display name                                                                                               |
| `description` | string (≤4000)            |         | no       | One-paragraph summary; validation warns when missing on agents, skills, workflows, iron laws, gates, hooks |
| `tags`        | string[]                  | `[]`    | no       | Free tags; deduplicated and sorted by normalization                                                        |
| `metadata`    | Record<string, JsonValue> | `{}`    | no       | Open bag; unknown frontmatter keys are preserved here by the reader; keys sorted by normalization          |

`JsonValue` (`src/model/json.ts`) is any plain JSON value.

## 3. Blueprint

```ts
interface Blueprint {
  schemaVersion: '1.0'
  id: Slug
  name: string
  version: string
  description?: string
  settings: { primaryAgentId?: Slug; sourceDir: string }
  targets: TargetConfig[]
  agents: Agent[]
  skills: Skill[]
  workflows: Workflow[]
  ironLaws: IronLaw[]
  rules: Rule[]
  hooks: Hook[]
  gates: Gate[]
  tools: Tool[]
  references: Reference[]
  memories: MemoryDefinition[]
  requirements: Requirement[]
  scenarios: Scenario[]
}
```

Header (`blueprintHeaderSchema`):

| Field                     | Type                                         | Default                              | Required | Meaning                                                                                                    |
| ------------------------- | -------------------------------------------- | ------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `schemaVersion`           | literal `'1.0'` (`BLUEPRINT_SCHEMA_VERSION`) |                                      | yes      | Model version; see migrations                                                                              |
| `id`                      | Slug                                         |                                      | yes      | Project id                                                                                                 |
| `name`                    | string (1–200)                               |                                      | yes      | Project name                                                                                               |
| `version`                 | semver string                                | `'0.1.0'`                            | no       | The user's version of their agent system                                                                   |
| `description`             | string (≤4000)                               |                                      | no       |                                                                                                            |
| `settings.primaryAgentId` | Slug                                         |                                      | no       | Agent whose persona becomes the root instruction file (CLAUDE.md / AGENTS.md); others compile to subagents |
| `settings.sourceDir`      | relative dir path                            | `'blueprint'` (`DEFAULT_SOURCE_DIR`) | no       | Where the source project lives inside the repository                                                       |
| `targets`                 | TargetConfig[]                               | `[]`                                 | no       | Export targets                                                                                             |

TargetConfig (`targetConfigSchema`):

| Field       | Type       | Default | Meaning                                                                 |
| ----------- | ---------- | ------- | ----------------------------------------------------------------------- |
| `harnessId` | HarnessId  |         | One of `HARNESS_IDS`                                                    |
| `enabled`   | boolean    | `true`  | Compile this target                                                     |
| `options`   | JsonObject | `{}`    | Harness-specific, validated by the adapter's own schema at compile time |

Collections and their kinds (`ENTITY_KIND_INFO`):

| Kind          | Collection     | Dir             | Format                                      |
| ------------- | -------------- | --------------- | ------------------------------------------- |
| `agent`       | `agents`       | `agents/`       | markdown                                    |
| `skill`       | `skills`       | `skills/`       | skill (`<id>/SKILL.md` + resources)         |
| `workflow`    | `workflows`    | `workflows/`    | workflow (`<id>.md` + `<id>.workflow.json`) |
| `iron-law`    | `ironLaws`     | `laws/`         | markdown                                    |
| `rule`        | `rules`        | `rules/`        | markdown                                    |
| `hook`        | `hooks`        | `hooks/`        | yaml                                        |
| `gate`        | `gates`        | `gates/`        | yaml                                        |
| `tool`        | `tools`        | `tools/`        | yaml                                        |
| `reference`   | `references`   | `references/`   | markdown                                    |
| `memory`      | `memories`     | `memory/`       | markdown                                    |
| `requirement` | `requirements` | `requirements/` | markdown                                    |
| `scenario`    | `scenarios`    | `scenarios/`    | yaml                                        |

A compile-time assertion in `schema/blueprint.ts` fails the build if `BLUEPRINT_COLLECTION_KEYS` and the schema's collection keys drift apart.

## 4. Agent

`agentSchema` = EntityBase +

| Field                | Type                                                              | Default                            | Meaning                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role`               | AgentRole                                                         | required                           | `worker`, `reviewer`, `researcher`, `investigator`, `architect`, `verifier`, `orchestrator`                                                                     |
| `expertise`          | string[]                                                          | `[]`                               | Domains / technologies                                                                                                                                          |
| `responsibilities`   | string[]                                                          | `[]`                               | What the agent is accountable for (warned when empty)                                                                                                           |
| `skillIds`           | Slug[]                                                            | `[]`                               | Skills the agent may use (order is meaningful: priority)                                                                                                        |
| `workflowIds`        | Slug[]                                                            | `[]`                               | Workflows the agent runs                                                                                                                                        |
| `ironLawIds`         | Slug[]                                                            | `[]`                               | Laws bound to the agent                                                                                                                                         |
| `ruleIds`            | Slug[]                                                            | `[]`                               | Rules followed                                                                                                                                                  |
| `toolIds`            | Slug[]                                                            | `[]`                               | Tools available                                                                                                                                                 |
| `referenceIds`       | Slug[]                                                            | `[]`                               | Deep knowledge available                                                                                                                                        |
| `memoryIds`          | Slug[]                                                            | `[]`                               | Memory definitions                                                                                                                                              |
| `permissions`        | PermissionSet                                                     | `{ operations: {}, patterns: [] }` | What the agent _may_ do (distinct from tools: what it _can_ do)                                                                                                 |
| `outputRequirements` | string[]                                                          | `[]`                               | What a finished task must include                                                                                                                               |
| `model`              | `{ preference: 'fast' \| 'balanced' \| 'strong'; hint?: string }` |                                    | Model preference; `hint` may carry a concrete model id                                                                                                          |
| `budget`             | `{ effort?: 'low' \| 'medium' \| 'high'; maxTurns?: int 1–1000 }` |                                    | How hard it may think and how long it may run (P9-32). Claude Code: `effort`, `maxTurns`; Codex: `model_reasoning_effort`, the turn limit reported; others told |
| `delegation`         | `{ canDelegateTo: Slug[] }`                                       |                                    | Agents this one may delegate to                                                                                                                                 |
| `body`               | Markdown                                                          | `''`                               | Persona / system prompt                                                                                                                                         |

PermissionSet (`permissionSetSchema`):

| Field        | Type                                                    | Meaning                                                                                                                                            |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operations` | partial record PermissionOperation → PermissionDecision | Blanket decision per operation; unset falls back to the harness default                                                                            |
| `patterns`   | `{ operation, pattern, decision }[]`                    | Finer overrides evaluated before `operations`; `pattern` is a harness-agnostic glob or command prefix (`git push *`, `src/**`, `docs.example.com`) |

`PERMISSION_OPERATIONS`: `fs.read`, `fs.write`, `fs.delete`, `shell.readonly`, `shell.mutating`, `git.read`, `git.commit`, `git.push`, `git.force-push`, `net.docs`, `net.any`, `mcp`.
`PERMISSION_DECISIONS`: `allow`, `ask`, `deny`.

## 5. Skill

`skillSchema` = EntityBase +

| Field            | Type                                                | Default                   | Meaning                                                                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whenToUse`      | string                                              |                           | Compiled into `when_to_use` / description text                                                                                                                                                                                                                    |
| `activation`     | SkillActivation                                     | all lists `[]`            | When the skill becomes active (see below)                                                                                                                                                                                                                         |
| `invocation`     | `{ userInvocable: boolean; argumentHint?: string }` | `{ userInvocable: true }` | How a person reaches it (P9-31): `userInvocable: false` keeps a knowledge skill out of the command menu (Claude `user-invocable: false`); `argumentHint` says what to type after the command (Claude `argument-hint`; an **Argument** line in the body elsewhere) |
| `referenceIds`   | Slug[]                                              | `[]`                      | References the skill relies on                                                                                                                                                                                                                                    |
| `allowedToolIds` | Slug[]                                              | `[]`                      | Tools the skill may use (→ Agent Skills `allowed-tools`)                                                                                                                                                                                                          |
| `resources`      | SkillResource[]                                     | `[]`                      | Files shipped next to SKILL.md                                                                                                                                                                                                                                    |
| `body`           | Markdown                                            | `''`                      | SKILL.md body: purpose, when to use, instructions, constraints, examples, verification                                                                                                                                                                            |

SkillActivation (`skillActivationSchema`), every list ORed with the others:

| Field          | Type        | Meaning                                |
| -------------- | ----------- | -------------------------------------- |
| `filePatterns` | string[]    | Globs such as `**/*.test.*`            |
| `fileTypes`    | string[]    | Language names (`C#`, `TypeScript`)    |
| `directories`  | string[]    | Directory globs (`/tests/**`)          |
| `intents`      | string[]    | User intents (`write tests`)           |
| `agentRoles`   | AgentRole[] | Roles that activate the skill          |
| `workflowIds`  | Slug[]      | Workflows in which the skill is active |

SkillResource: `{ path: relative path (no leading `/`, no drive letter, no `..`), kind: 'reference' \| 'script' \| 'asset', encoding: 'utf8' \| 'base64', content: string }`. The reader infers `kind` from the first path segment (`scripts/` → script, `assets/` → asset, otherwise reference) and `encoding` from the bytes: a file that decodes as UTF-8 and holds no NUL byte is text, and `content` is the file; anything else is `base64`. The model stays JSON-serializable — it travels through ChangeSets, undo history and IndexedDB — while the bytes on disk stay the bytes. `SKILL_DESCRIPTION_MAX_LENGTH` = 1024 (Agent Skills limit; validation `BP-SKILL-001`).

## 6. Workflow

`workflowSchema` = EntityBase +

| Field          | Type                                      | Default                         | Meaning                                                                                                                                |
| -------------- | ----------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `entryNodeId`  | Slug                                      |                                 | Must point at a `start` node (`BP-WF-001`)                                                                                             |
| `nodes`        | WorkflowNode[]                            | `[]`                            | Sorted by id by normalization                                                                                                          |
| `edges`        | WorkflowEdge[]                            | `[]`                            | Sorted by id by normalization                                                                                                          |
| `triggers`     | `{ intents: string[]; agentIds: Slug[] }` | `{ intents: [], agentIds: [] }` | What starts the workflow                                                                                                               |
| `argumentHint` | string                                    |                                 | What to type after the command that starts it (P9-31); the orchestration skill opens with a Usage line and Claude gets `argument-hint` |
| `body`         | Markdown                                  | `''`                            | Prose description, compiled into the orchestration skill                                                                               |

WorkflowNode (`workflowNodeSchema`):

| Field         | Type                       | Default                 | Meaning                                      |
| ------------- | -------------------------- | ----------------------- | -------------------------------------------- |
| `id`          | Slug                       | required                | Unique within the workflow (`BP-WF-004`)     |
| `type`        | WorkflowNodeType           | required                | see list                                     |
| `label`       | string (1–200)             | required                |                                              |
| `description` | string                     |                         |                                              |
| `position`    | `{ x: number; y: number }` | required                | Canvas position; part of the authored source |
| `config`      | WorkflowNodeConfig         | `{ contextInputs: [] }` | Flat optional bag (see below)                |

`WORKFLOW_NODE_TYPES`: `start`, `end`, `agent`, `skill`, `tool`, `condition`, `verification`, `review`, `gate`, `human-approval`, `output`, `parallel`, `merge`, `retry`, `delegate`, `synthesis`.

WorkflowNodeConfig is deliberately **not** a discriminated union so a node can change type in the editor without losing settings; validation reports fields missing for a type (`BP-WF-005`).

| Field            | Type                                                                         | Used by          | Meaning                        |
| ---------------- | ---------------------------------------------------------------------------- | ---------------- | ------------------------------ |
| `agentId`        | Slug                                                                         | agent, delegate  | Which agent performs the step  |
| `skillId`        | Slug                                                                         | skill            |                                |
| `toolId`         | Slug                                                                         | tool             |                                |
| `gateId`         | Slug                                                                         | gate             | Reusable Gate definition       |
| `contextInputs`  | string[] (default `[]`)                                                      | any              | What context the step receives |
| `outputSpec`     | string                                                                       | any              | What the step must produce     |
| `expression`     | string                                                                       | condition        | Human-readable predicate       |
| `mergeStrategy`  | `'all' \| 'any' \| 'first' \| 'synthesize'`                                  | merge, synthesis | `MERGE_STRATEGIES`             |
| `maxAttempts`    | int 1–20                                                                     | retry            |                                |
| `verification`   | `{ method: 'command' \| 'tests' \| 'review' \| 'manual'; command?: string }` | verification     | `VERIFICATION_METHODS`         |
| `approvalPrompt` | string                                                                       | human-approval   |                                |
| `onFailure`      | `'stop' \| 'continue' \| 'fallback' \| 'retry'`                              | any              | `NODE_FAILURE_BEHAVIORS`       |

WorkflowEdge (`workflowEdgeSchema`):

| Field        | Type             | Default        | Meaning                                                                                             |
| ------------ | ---------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `id`         | Slug             | required       |                                                                                                     |
| `from`, `to` | Slug             | required       | Node ids (`BP-WF-003` when unknown)                                                                 |
| `kind`       | WorkflowEdgeKind | `'sequential'` | `sequential`, `parallel`, `conditional`, `fallback`, `retry`, `delegation`, `review`, `aggregation` |
| `required`   | boolean          | `true`         | Required edges must complete for the workflow to proceed                                            |
| `condition`  | string           |                | For conditional edges                                                                               |
| `label`      | string           |                |                                                                                                     |

## 7. Governance: IronLaw, Rule, Hook, Gate

Shared: `GOVERNANCE_CATEGORIES` = `security`, `testing`, `architecture`, `reliability`, `data`, `code-quality`, `communication`, `process`, `general`. `SEVERITIES` = `critical`, `high`, `medium`, `low`. Scope (`scopeSchema`): `{ all: boolean (default true); agentIds: Slug[]; workflowIds: Slug[] }`; when `all` is false and both lists are empty the artifact applies to nothing (`BP-LAW-001`).

IronLaw (`ironLawSchema`) = EntityBase +

| Field               | Type                                    | Default           | Meaning                                                          |
| ------------------- | --------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| `rule`              | string                                  | required          | The law, one or two imperative sentences                         |
| `rationale`         | string                                  |                   |                                                                  |
| `examples`          | string[]                                | `[]`              | Compliant behaviour                                              |
| `counterexamples`   | string[]                                | `[]`              | Violations                                                       |
| `violationBehavior` | string                                  |                   | What to do when the law cannot be honoured                       |
| `severity`          | `'critical' \| 'high' \| 'medium'`      | `'high'`          | `IRON_LAW_SEVERITIES`                                            |
| `category`          | GovernanceCategory                      | required          |                                                                  |
| `scope`             | Scope                                   | `{ all: true }`   |                                                                  |
| `enforcement`       | `('instruction' \| 'hook' \| 'gate')[]` | `['instruction']` | `ENFORCEMENT_MECHANISMS`; adapters use what the harness supports |
| `body`              | Markdown                                | `''`              |                                                                  |

Rule (`ruleSchema`) = EntityBase +

| Field      | Type                          | Default         | Meaning                                               |
| ---------- | ----------------------------- | --------------- | ----------------------------------------------------- |
| `guidance` | string                        | required        | Preferred behaviour (may be traded off, unlike a law) |
| `category` | GovernanceCategory            | `'general'`     |                                                       |
| `priority` | `'high' \| 'normal' \| 'low'` | `'normal'`      | `RULE_PRIORITIES`                                     |
| `paths`    | string[]                      | `[]`            | Globs; compiles to path-scoped rules where supported  |
| `scope`    | Scope                         | `{ all: true }` |                                                       |
| `body`     | Markdown                      | `''`            |                                                       |

Hook (`hookSchema`) = EntityBase + (no body; stored as YAML)

| Field               | Type                                                | Default      | Meaning                                                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trigger`           | HookTrigger                                         | required     | `session-start`, `user-prompt`, `before-tool`, `after-tool`, `after-file-change`, `before-stop`, `subagent-stop`, `after-tool-failure`, `subagent-start`, `before-compact`, `after-compact` (the last four: P9-29; they report something that already happened, so a hook on them cannot refuse) |
| `conditions`        | `{ toolKinds: ToolKind[]; filePatterns: string[] }` | both `[]`    |                                                                                                                                                                                                                                                                                                  |
| `action.type`       | HookActionType                                      | required     | `command`, `prompt-check`, `run-tests`, `format`, `lint`, `secret-scan`, `check-iron-laws`                                                                                                                                                                                                       |
| `action.command`    | string                                              |              | Shell command for command-like actions                                                                                                                                                                                                                                                           |
| `action.prompt`     | string                                              |              | Natural-language check for `prompt-check` / `check-iron-laws`                                                                                                                                                                                                                                    |
| `action.script`     | string                                              |              | A POSIX shell script run in place of `command`, for a check too long for one line (P9-30). Written as `<id>.sh` where each harness keeps hook scripts and run from the hook; a shebang is added when missing. A hook with both gets `BP-HOOK-011`                                                |
| `action.timeoutSec` | int 1–3600                                          |              |                                                                                                                                                                                                                                                                                                  |
| `action.async`      | boolean                                             | `false`      | Run in the background: nothing waits, the result is discarded, and the hook cannot block (P9-29). Reported where a harness has no background hooks                                                                                                                                               |
| `onSuccess`         | literal `'continue'`                                | `'continue'` |                                                                                                                                                                                                                                                                                                  |
| `onFailure`         | `'block' \| 'warn' \| 'return-to-agent'`            | `'block'`    | `HOOK_FAILURE_BEHAVIORS`                                                                                                                                                                                                                                                                         |
| `severity`          | Severity                                            | `'high'`     |                                                                                                                                                                                                                                                                                                  |

Gate (`gateSchema`) = EntityBase + (YAML)

| Field      | Type                                                                    | Default   | Meaning                                                                                                                              |
| ---------- | ----------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `criteria` | `{ kind: GateCriterionKind; description?: string; command?: string }[]` | `[]`      | `GATE_CRITERION_KINDS`: `tests-pass`, `command`, `lint`, `security-scan`, `requirements-check`, `review`, `human-approval`, `custom` |
| `onFail`   | `'allow' \| 'warn' \| 'block' \| 'request-approval'`                    | `'block'` | `GATE_FAILURE_BEHAVIORS`                                                                                                             |

## 8. Knowledge: Tool, Reference, MemoryDefinition

Tool (`toolSchema`) = EntityBase + (YAML)

| Field        | Type      | Default  | Meaning                                                                                                                                                                      |
| ------------ | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | ToolKind  | required | `filesystem`, `shell`, `git`, `browser`, `search`, `database`, `api`, `documentation`, `mcp`, `custom`                                                                       |
| `operations` | string[]  | `[]`     | Free text per tool (`read`, `write`, `query`)                                                                                                                                |
| `mcp`        | McpServer |          | `{ transport: 'stdio' \| 'http' \| 'sse'; command?; args: string[]; url?: URL; envVars: string[] }`. `envVars` holds variable **names** only; values never enter a Blueprint |

Reference (`referenceSchema`) = EntityBase +

| Field  | Type                                                                                  | Default      | Meaning              |
| ------ | ------------------------------------------------------------------------------------- | ------------ | -------------------- |
| `kind` | `'markdown' \| 'text' \| 'example' \| 'documentation' \| 'domain-knowledge' \| 'url'` | `'markdown'` | `REFERENCE_KINDS`    |
| `url`  | URL                                                                                   |              | For `url` references |
| `body` | Markdown                                                                              | `''`         | The knowledge itself |

MemoryDefinition (`memoryDefinitionSchema`) = EntityBase +

| Field        | Type                                                    | Default  | Meaning                                                              |
| ------------ | ------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `scope`      | `'stateless' \| 'session' \| 'project' \| 'persistent'` | required | `MEMORY_SCOPES`                                                      |
| `categories` | string[]                                                | `[]`     | What is worth remembering                                            |
| `body`       | Markdown                                                | `''`     | Seed knowledge written into the compiled memory file where supported |

## 9. Quality: Requirement, RequirementCheck, Scenario

Requirement (`requirementSchema`) = EntityBase +

| Field       | Type                 | Default  | Meaning                                         |
| ----------- | -------------------- | -------- | ----------------------------------------------- |
| `statement` | string               | required | The requirement in prose                        |
| `level`     | `'must' \| 'should'` | `'must'` | `REQUIREMENT_LEVELS`                            |
| `checks`    | RequirementCheck[]   | `[]`     | Declarative checks the validator evaluates (P1) |
| `body`      | Markdown             | `''`     | Notes                                           |

RequirementCheck (`requirementCheckSchema`, discriminated on `type`):

| `type`                   | Fields                                                        | Satisfied when                                                        |
| ------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `workflow-has-node-type` | `nodeType: WorkflowNodeType`, `workflowId?: Slug`             | The workflow (or any workflow) has a node of that type                |
| `iron-law-matches`       | `pattern: string`                                             | Some iron law's name, rule or body matches the case-insensitive regex |
| `hook-exists`            | `trigger?: HookTrigger`, `actionType?: HookActionType`        | A hook with the given trigger and/or action type exists               |
| `gate-exists`            | `criterionKind?: GateCriterionKind`                           | A gate (with a criterion of that kind) exists                         |
| `agent-has-skill-tag`    | `agentId?: Slug`, `tag: string`                               | The agent (or any agent) has a skill carrying the tag                 |
| `text-mentions`          | `kinds: EntityKind[]` (default `[]` = all), `pattern: string` | Some entity of those kinds mentions the regex in its text fields      |
| `ai-judged`              | `prompt: string`                                              | Delegated to the AI evaluator; skipped otherwise                      |

Scenario (`scenarioSchema`) = EntityBase + (YAML)

| Field               | Type                                                  | Default    | Meaning                                                       |
| ------------------- | ----------------------------------------------------- | ---------- | ------------------------------------------------------------- |
| `agentId`           | Slug                                                  |            | Agent under test                                              |
| `input`             | string                                                | required   | The user request                                              |
| `expectedBehaviors` | `{ description: string; check?: RequirementCheck }[]` | `[]`       |                                                               |
| `mode`              | `'manual' \| 'ai-judge' \| 'runtime'`                 | `'manual'` | `SCENARIO_MODES`; `runtime` is reserved for future simulation |
| `notes`             | string[]                                              | `[]`       |                                                               |

## 10. Harnesses

`HARNESS_IDS`: `claude-code`, `codex`, `copilot`, `opencode`, `pi` (`HARNESS_LABELS` gives display names). Core knows only the ids; adapters live in `@agent-blueprint/exporters`.

## 11. Reference table

Every cross-reference site, as implemented in `src/model/refs.ts` (`visitRefs`). "From" is the owner; `relation` is the `RefRelation` name used by the dependency graph.

| From        | Field                                               | To kind          | Relation                           |
| ----------- | --------------------------------------------------- | ---------------- | ---------------------------------- |
| blueprint   | `settings.primaryAgentId`                           | agent            | `primary-agent`                    |
| agent       | `skillIds[]`                                        | skill            | `uses-skill`                       |
| agent       | `workflowIds[]`                                     | workflow         | `runs-workflow`                    |
| agent       | `ironLawIds[]`                                      | iron-law         | `bound-by-law`                     |
| agent       | `ruleIds[]`                                         | rule             | `follows-rule`                     |
| agent       | `toolIds[]`                                         | tool             | `uses-tool`                        |
| agent       | `referenceIds[]`                                    | reference        | `reads-reference`                  |
| agent       | `memoryIds[]`                                       | memory           | `has-memory`                       |
| agent       | `delegation.canDelegateTo[]`                        | agent            | `delegates-to`                     |
| skill       | `referenceIds[]`                                    | reference        | `reads-reference`                  |
| skill       | `allowedToolIds[]`                                  | tool             | `allowed-tool`                     |
| skill       | `activation.workflowIds[]`                          | workflow         | `activates-in-workflow`            |
| workflow    | `nodes[].config.agentId`                            | agent            | `node-agent`                       |
| workflow    | `nodes[].config.skillId`                            | skill            | `node-skill`                       |
| workflow    | `nodes[].config.toolId`                             | tool             | `node-tool`                        |
| workflow    | `nodes[].config.gateId`                             | gate             | `node-gate`                        |
| workflow    | `triggers.agentIds[]`                               | agent            | `triggered-by-agent`               |
| iron-law    | `scope.agentIds[]`                                  | agent            | `scoped-to-agent`                  |
| iron-law    | `scope.workflowIds[]`                               | workflow         | `scoped-to-workflow`               |
| rule        | `scope.agentIds[]`                                  | agent            | `scoped-to-agent`                  |
| rule        | `scope.workflowIds[]`                               | workflow         | `scoped-to-workflow`               |
| requirement | `checks[].workflowId` (`workflow-has-node-type`)    | workflow         | `checks-workflow`                  |
| requirement | `checks[].agentId` (`agent-has-skill-tag`)          | agent            | `checks-agent`                     |
| scenario    | `agentId`                                           | agent            | `tests-agent`                      |
| scenario    | `expectedBehaviors[].check.workflowId` / `.agentId` | workflow / agent | `checks-workflow` / `checks-agent` |

`RefSite.replace(newId | null)` rewrites or removes a reference in place; `renameEntity`, `deleteEntity`, `buildDependencyGraph` and dangling-reference detection all go through this one table. Adding a reference-bearing field anywhere else means adding a line here.

## 12. Normalization

`normalizeBlueprint(input)` (`src/blueprint/normalize.ts`) parses through `blueprintSchema` then canonicalizes. It is idempotent and is applied by the reader, by `renderProjectFiles`, by `applyChangeSet` and by `diffBlueprints`.

| What                                                                                                                                    | Rule                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Markdown bodies, skill resource contents                                                                                                | CRLF → LF, trailing whitespace stripped per line, trailing blank lines removed (`normalizeMarkdown`) |
| `description` (blueprint and entities)                                                                                                  | trimmed; empty → removed                                                                             |
| `tags`                                                                                                                                  | deduplicated, sorted                                                                                 |
| `metadata`                                                                                                                              | keys sorted                                                                                          |
| Agent id lists (`skillIds`, `workflowIds`, `ironLawIds`, `ruleIds`, `toolIds`, `referenceIds`, `memoryIds`, `delegation.canDelegateTo`) | deduplicated, order kept                                                                             |
| Skill `referenceIds`, `allowedToolIds`, `activation.workflowIds`                                                                        | deduplicated                                                                                         |
| Skill `resources`                                                                                                                       | sorted by path                                                                                       |
| Workflow `nodes`, `edges`                                                                                                               | sorted by id (order carries no meaning; the graph is the edges)                                      |
| Workflow `triggers.agentIds`, law/rule `scope.*Ids`, law `enforcement`                                                                  | deduplicated                                                                                         |
| Collections (`agents`, `skills`, …)                                                                                                     | order kept (it is the manifest order and is meaningful in the UI)                                    |

## 13. Public API of `@agent-blueprint/core`

Everything is exported from `src/index.ts`.

Model and schemas

| Export                                                                                | Description                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ENTITY_KINDS`, `ENTITY_KIND_INFO`, `kindForCollection`, `kindForDir`, `isEntityKind` | Closed set of kinds and their storage info                                      |
| `HARNESS_IDS`, `HARNESS_LABELS`                                                       | Known harnesses                                                                 |
| `isSlug`, `slugify`, `uniqueSlug`, `SLUG_RE`, `SLUG_MAX_LENGTH`                       | Id helpers                                                                      |
| `entityRef(kind, id)`, `sameRef`, `refKey`                                            | `EntityRef` helpers                                                             |
| `*Schema`, `ENTITY_SCHEMAS`, `entitySchemaFor(kind)`                                  | Zod schemas; all enum constant arrays (`AGENT_ROLES`, `WORKFLOW_NODE_TYPES`, …) |
| `BLUEPRINT_SCHEMA_VERSION`, `DEFAULT_SOURCE_DIR`                                      | Constants                                                                       |

Blueprint operations (all pure; they return new objects)

| Signature                                                                      | Description                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createEmptyBlueprint({ id, name, description?, version? }): Blueprint`        | Valid empty Blueprint with defaults                                                                                                                           |
| `normalizeBlueprint(input: unknown): Blueprint`                                | Parse + canonicalize (throws ZodError on invalid input)                                                                                                       |
| `REQUIREMENT_CHECK_TYPES`                                                      | The check types, for a UI that has to offer them; guarded against the schema union at compile time                                                            |
| `createEntity(bp, kind, { name, id?, description? }): EntityOf<K>`             | A new, valid artifact of any kind; seeds the fields the schema cannot default, and derives a free slug from the name. Not inserted: pass it to `upsertEntity` |
| `getCollection(bp, kind): EntityOf<K>[]`                                       | The array for a kind                                                                                                                                          |
| `findEntity(bp, kind, id)`, `hasEntity(bp, ref)`                               | Lookups                                                                                                                                                       |
| `listEntityRefs(bp)`, `countEntities(bp)`, `buildEntityIndex(bp): EntityIndex` | Enumeration                                                                                                                                                   |
| `upsertEntity(bp, kind, input): Blueprint`                                     | Insert or replace after validating through the kind's schema                                                                                                  |
| `removeEntityRaw(bp, ref): Blueprint`                                          | Remove without touching references (prefer `deleteEntity`)                                                                                                    |
| `renameEntity(bp, kind, oldId, newId): { blueprint, updatedRefs }`             | Id refactor; throws `RenameError`                                                                                                                             |
| `deleteEntity(bp, ref): { blueprint, impact, removedRefs }`                    | Delete + reference clean-up + impact report                                                                                                                   |
| `visitRefs(bp, visitor)`, `collectRefs(bp): EntityReference[]`                 | Reference walking                                                                                                                                             |

Dependencies

| Signature                                   | Description                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `buildDependencyGraph(bp): DependencyGraph` | `nodes`, `edges`, `dangling`, `primaryAgentId`, `dependenciesOf(ref)`, `dependentsOf(ref)`, `has(ref)` |
| `impactOf(graph, ref): ImpactReport`        | `direct`, `transitive` dependents, `isPrimaryAgent`                                                    |
| `findOrphans(graph): EntityRef[]`           | Unreferenced entities of `ORPHANABLE_KINDS`                                                            |

Project format

| Signature                                                                                                                     | Description                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `interface VirtualFs { read, write, delete, exists, list }`, `class MemoryFs`, `normalizePath`, `joinPath`                    | IO abstraction                                                        |
| `readProject(fs, { sourceDir? }): Promise<{ blueprint, diagnostics, sourceSchemaVersion }>`                                   | Tolerant loader; throws `ProjectReadError` only for manifest problems |
| `renderProjectFiles(bp, { sourceDir? }): Record<string, string>`                                                              | Pure Blueprint → files                                                |
| `writeProject(bp, fs, { sourceDir?, prune? }): Promise<{ written, deleted, unchanged }>`                                      | Writes changed files, prunes stale artifacts                          |
| `manifestPath`, `entityMainPath`, `workflowGraphPath`, `skillResourcePath`, `kindDir`, `parseEntityPath`, `buildManifestPath` | Path helpers                                                          |
| `canonicalJson`, `toYaml`, `fromYaml`, `pruneEmpty`, `encodeFrontmatter`, `decodeFrontmatter`, `isJsonValue`, `sha256Hex`     | Serialization                                                         |
| `buildManifestSchema`, `createEmptyBuildManifest`, `ownedPaths`                                                               | build-manifest.json                                                   |

Migrations

| Signature                                                                                 | Description                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `MIGRATIONS`, `CURRENT_SCHEMA_VERSION`, `interface Migration`                             | Registry                                                                   |
| `migrationPath(version)`, `migrateManifest(raw)`, `migrateEntity(kind, raw, fromVersion)` | Run the chain; throw `UnsupportedSchemaVersionError` when there is no path |

Change-sets

| Signature                                                                                           | Description                                                           |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ChangeSet`, `ChangeOp` = `CreateOp \| UpdateOp \| DeleteOp \| UpdateBlueprintOp`, `changeOpId(op)` | Reviewable edits; ids are deterministic (`create:skill:xunit`)        |
| `applyChangeSet(bp, cs, { accept? }): { blueprint, applied, rejected }`                             | Applies accepted ops independently; failures are reported, not thrown |
| `diffBlueprints(before, after): ChangeSet`                                                          | Semantic diff after normalization                                     |

Validation

| Signature                                                                | Description                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `Diagnostic`, `summarizeDiagnostics`, `sortDiagnostics`                  | Findings                                                            |
| `validateBlueprint(bp, rules = ALL_RULES): Diagnostic[]`                 | Runs rules; result sorted                                           |
| `ALL_RULES`, `STRUCTURAL_RULES`, `ruleByCode`, `createValidationContext` | Rule registry and context (`blueprint`, lazy `index`, lazy `graph`) |

## 14. Checklists

Add a field to an existing entity

1. Add it to the schema in `src/schema/<file>.ts` with a default or `optional()`; place it in the position you want it written (key order = schema order).
2. If it references another entity, add the site to `visitRefs` in `src/model/refs.ts` and, if new, the relation name to `RefRelation`.
3. If it needs canonicalization (dedupe, sort), extend `normalizeBlueprint`.
4. Add a validation rule if a bad value is possible but not a schema error.
5. Update the fixture (`packages/fixtures/projects/…`), run `pnpm --filter @agent-blueprint/core fixtures:canonicalize`, then `pnpm --filter @agent-blueprint/core test`.
6. Update `docs/02-domain-model.md` and, if it affects compiled output, `docs/04-compiler.md`.

Add an entity kind

1. `src/model/kinds.ts`: add to `ENTITY_KINDS`, `BLUEPRINT_COLLECTION_KEYS`, `ENTITY_KIND_INFO` (dir, format).
2. `src/schema/`: create the schema (extend `entityBaseSchema`), add it to `blueprintCollectionsSchema` and `ENTITY_SCHEMAS`; the compile-time key assertion will fail until both sides match.
3. `src/model/types.ts`: add the type, `EntityTypeMap` and `EntityInputTypeMap` entries.
4. `src/model/refs.ts`: add its reference sites and any relation names.
5. `src/project/`: if the format is one of `markdown`, `yaml`, `skill`, `workflow` nothing changes; a new format needs `layout.ts`, `read.ts` and `write.ts` cases.
6. `src/dependencies/graph.ts`: decide whether the kind belongs in `ORPHANABLE_KINDS`.
7. Validation rules, fixture, canonicalize, tests, docs (this file, `03-project-format.md`, `05-validation-evaluation.md`), and each adapter's capability matrix.

## Options reference

Generated from `packages/core/src/model/options.ts` by `pnpm --filter @agent-blueprint/core options:doc`; `tests/options.test.ts` fails when this section and the table disagree, and when any enum value has no entry. The same sentences are shown in the app beside each option (docs/07, P9-21).

<!-- options:start — generated by `pnpm --filter @agent-blueprint/core options:doc`; do not edit by hand -->
<!-- prettier-ignore-start -->

Every fixed choice a form offers, with what choosing it does. The same text is shown beside each option in the app; both come from `packages/core/src/model/options.ts`.

#### Agent `role`

| Value | Label | Means |
| --- | --- | --- |
| `worker` | Worker | Does the work: writes the code, the tests, the document. The default for an agent that produces something. |
| `reviewer` | Reviewer | Reads what another agent produced and reports what is wrong with it. Never the same agent that wrote it. |
| `researcher` | Researcher | Gathers what is needed before work starts — reads the codebase, the docs, the prior art — and reports findings rather than changes. |
| `investigator` | Investigator | Finds the cause of a specific failure: a bug, a flaky test, a regression. Ends with a diagnosis, not a fix. |
| `architect` | Architect | Decides structure — boundaries, interfaces, what goes where — and writes it down for workers to follow. |
| `verifier` | Verifier | Runs things and reports what happened: builds, tests, checks. Reports observed output, never expected output. |
| `orchestrator` | Orchestrator | Runs the workflow: decides which agent does what, in what order, and when it is done. Usually the primary agent. |

#### Severity (`severity` on hooks, findings and AI checks)

| Value | Label | Means |
| --- | --- | --- |
| `critical` | Critical | Breaking it is never acceptable; the compiled instructions say so in those terms. |
| `high` | High | Breaking it needs a stated reason and a person aware of it. |
| `medium` | Medium | Worth flagging; the agent may proceed if it says why. |
| `low` | Low | Advisory. Mentioned, not enforced. |

#### Iron Law `severity`

| Value | Label | Means |
| --- | --- | --- |
| `critical` | Critical | Breaking it is never acceptable; the compiled instructions say so in those terms. |
| `high` | High | Breaking it needs a stated reason and a person aware of it. |
| `medium` | Medium | Worth flagging; the agent may proceed if it says why. |

#### Iron Law and rule `category`

| Value | Label | Means |
| --- | --- | --- |
| `security` | Security | Credentials, secrets, data exposure, injection. The category `BP-SAFETY-003` looks for when it asks whether any law covers security. |
| `testing` | Testing | What must be tested, how, and what counts as a passing run. |
| `architecture` | Architecture | Boundaries, layering, dependencies between parts, where things go. |
| `reliability` | Reliability | Failure handling, retries, idempotency, what happens when something is down. |
| `data` | Data | Migrations, schemas, backups, anything that could lose or corrupt records. |
| `code-quality` | Code quality | Naming, structure, duplication, readability — the things review comments are made of. |
| `communication` | Communication | How the agent reports, asks, and hands over: commit messages, summaries, questions. |
| `process` | Process | When and how work is done: branches, reviews, deploy windows, sign-offs. |
| `general` | General | Fits no other category. Prefer a specific one. |

#### Tool `kind`

| Value | Label | Means |
| --- | --- | --- |
| `filesystem` | Filesystem | Reading, writing and deleting files in the workspace. |
| `shell` | Shell | Running commands. Whether it may change anything is a permission. |
| `git` | Git | Version control: reading history, committing, pushing. |
| `browser` | Browser | Opening pages and driving a browser, for testing or research. |
| `search` | Search | Searching the web or a codebase index. |
| `database` | Database | Querying or changing a database. Pair with data laws. |
| `api` | API | Calling an HTTP API the agent needs, named by the tool. |
| `documentation` | Documentation | Fetching reference documentation. Covered by the `net.docs` permission. |
| `mcp` | MCP server | A Model Context Protocol server, given by transport and command or URL. Its environment variable names are recorded; their values never are. |
| `custom` | Custom | Anything else. Say what it is in the description, because no harness will know. |

#### Permission operations (`permissions.operations`)

| Value | Label | Means |
| --- | --- | --- |
| `fs.read` | Read files | Open and read files in the workspace. |
| `fs.write` | Write files | Create and edit files. |
| `fs.delete` | Delete files | Remove files. Separate from write because it is the one that loses work. |
| `shell.readonly` | Read-only shell | Commands that inspect and do not change: `ls`, `cat`, `git status`, a test run. |
| `shell.mutating` | Mutating shell | Commands that change the machine or the repository: installs, builds that write, anything with side effects. |
| `git.read` | Read git | History, diffs, branches — nothing that moves a ref. |
| `git.commit` | Commit | Make commits on the current branch. |
| `git.push` | Push | Push to a remote. Usually `ask`. |
| `git.force-push` | Force-push | Rewrite shared history. `BP-SAFETY-001` flags an agent allowed to do this without asking. |
| `net.docs` | Fetch documentation | Reach documentation hosts only. |
| `net.any` | Any network | Reach any host. `BP-SAFETY-002` flags this without a security law beside it. |
| `mcp` | MCP servers | Use the MCP servers the agent’s tools declare. |

#### Permission decisions

| Value | Label | Means |
| --- | --- | --- |
| `allow` | Allow | Without asking. Compiles to the harness’s allow list. |
| `ask` | Ask | Stop and ask the user each time. Harnesses without an approval prompt lower this to allow and say so in the compatibility view. |
| `deny` | Deny | Never. Compiles to the harness’s deny list where it has one, and to an instruction where it does not. |

#### Agent `model.preference`

| Value | Label | Means |
| --- | --- | --- |
| `fast` | Fast | A small, quick model. For routine work where latency matters more than depth. |
| `balanced` | Balanced | The harness default. Most agents. |
| `strong` | Strong | The most capable model available. For review, architecture, and anything that is hard to undo. |

#### Agent `budget.effort`

| Value | Label | Means |
| --- | --- | --- |
| `low` | Low | Little deliberation. For lookups, formatting, and work with one obvious answer. |
| `medium` | Medium | The harness default. Most workers and reviewers. |
| `high` | High | As much thinking as the model will do. For planning, architecture, and anything hard to undo. Slower and dearer. |

#### Iron Law `enforcement`

| Value | Label | Means |
| --- | --- | --- |
| `instruction` | Instruction | Written into the instruction file. The agent is told; nothing checks. |
| `hook` | Hook | Every adapter generates a check that runs before the agent stops. Nothing else to write. |
| `gate` | Gate | A gate you write must name this law in its own name, description or a criterion — `BP-LAW-011` fires until one does. |

#### Rule `priority`

| Value | Label | Means |
| --- | --- | --- |
| `high` | High | Follow unless there is a stated reason not to. |
| `normal` | Normal | Follow by default; may be traded off against other rules. |
| `low` | Low | A preference. Mentioned once, not repeated. |

#### Hook `trigger`

| Value | Label | Means |
| --- | --- | --- |
| `session-start` | Session start | Once, when the agent starts. For setup and context loading. |
| `user-prompt` | User prompt | Each time the user sends a message, before the agent acts on it. |
| `before-tool` | Before a tool | Before any tool runs. Narrow it with the conditions. |
| `after-tool` | After a tool | After any tool has run. |
| `after-file-change` | After a file change | After the agent edits or writes a file. The usual trigger for tests, formatting and linting. |
| `before-stop` | Before stop | When the agent is about to report it has finished. The last chance to block: gates and secret scans live here. |
| `subagent-stop` | Subagent stop | When a delegated agent finishes and returns. |
| `after-tool-failure` | After a tool fails | After a tool call errors out. For hints about what went wrong; nothing can be refused, the failure already happened. |
| `subagent-start` | Subagent start | When a delegated agent is spawned, before it acts. For context the subagent must have — the Iron Laws, the conventions — since it does not see the conversation. |
| `before-compact` | Before compaction | Before the conversation is summarised to make room. The last moment to save state the summary might lose. |
| `after-compact` | After compaction | After the conversation was summarised. For restating what must survive a summary: the rules, the current task. |

#### Hook `action.type`

| Value | Label | Means |
| --- | --- | --- |
| `command` | Command | Run the command as given. Needs a command. |
| `prompt-check` | Prompt check | Ask the model a question about what it just did, from the prompt. No command. |
| `run-tests` | Run tests | Run the test command. Needs a command; counts as verification for `BP-EVAL-VERIFY-003`. |
| `format` | Format | Run the formatter. Needs a command. |
| `lint` | Lint | Run the linter. Needs a command; counts as verification. |
| `secret-scan` | Secret scan | Scan for credentials. Needs a command. This type, not a command that happens to scan, is what `BP-SAFETY-004` and a `hook-exists` check look for. |
| `check-iron-laws` | Check Iron Laws | Ask the model whether the work violates any Iron Law in force. No command; every adapter generates it for laws with hook enforcement. |

#### Hook `onFailure`

| Value | Label | Means |
| --- | --- | --- |
| `block` | Block | The agent may not continue or stop until it passes. |
| `warn` | Warn | Tell the agent and let it continue. |
| `return-to-agent` | Return to agent | Hand the output back to the agent as its next input, so it fixes what failed. |

#### Gate `criteria[].kind`

| Value | Label | Means |
| --- | --- | --- |
| `tests-pass` | Tests pass | The test command exits zero. Compiles to a before-stop hook where the harness has one. |
| `command` | Command | The given command exits zero. |
| `lint` | Lint | The linter reports nothing. |
| `security-scan` | Security scan | The security scanner reports nothing. |
| `requirements-check` | Requirements check | Every requirement in the Blueprint is satisfied, as the validator computes it. |
| `review` | Review | A reviewer agent has passed the work. Compiles to instructions. |
| `human-approval` | Human approval | A person has said yes. The agent stops and asks. |
| `custom` | Custom | Described in words. Compiles to instructions, never to a check. |

#### Gate `onFail`

| Value | Label | Means |
| --- | --- | --- |
| `allow` | Allow | Note the failure and continue. A gate that cannot stop anything. |
| `warn` | Warn | Tell the agent and continue. |
| `block` | Block | Do not continue until it passes. The default, and what a gate is for. |
| `request-approval` | Request approval | Stop and ask the user whether to continue anyway. |

#### Tool `mcp.transport`

| Value | Label | Means |
| --- | --- | --- |
| `stdio` | stdio | A local process the harness starts, talking over its standard streams. Needs a command. |
| `http` | HTTP | A server reached by URL over plain HTTP requests. |
| `sse` | SSE | A server reached by URL that streams over server-sent events. |

#### Reference `kind`

| Value | Label | Means |
| --- | --- | --- |
| `markdown` | Markdown | A document, copied beside the skills that use it. |
| `text` | Text | Plain text, copied as it is. |
| `example` | Example | A worked example of the right thing, for a skill or law to point at. |
| `documentation` | Documentation | Reference material for a library, API or tool. |
| `domain-knowledge` | Domain knowledge | What the agent needs to know about the business or the field, not the code. |
| `url` | URL | A link. The content is fetched at use, not stored; needs the `net.docs` permission. |

#### Memory `scope`

| Value | Label | Means |
| --- | --- | --- |
| `stateless` | Stateless | Nothing is remembered between turns. The seed is all it ever knows. |
| `session` | Session | Remembered until the session ends. |
| `project` | Project | Remembered for this project, across sessions. Compiles to the harness’s project memory where it has one. |
| `persistent` | Persistent | Remembered across projects. Few harnesses support this; the compatibility view says which. |

#### Requirement `checks[].type`

| Value | Label | Means |
| --- | --- | --- |
| `workflow-has-node-type` | Workflow has a step of a type | Passes when a workflow — one named, or any — has a step of the given type. |
| `iron-law-matches` | An Iron Law matches | A case-insensitive regular expression matches the name, rule or body of at least one law. |
| `hook-exists` | A hook exists | A hook has exactly the given trigger and exactly the given action type. Either may be left as any. |
| `gate-exists` | A gate exists | A gate exists, and carries a criterion of the given kind when one is given. |
| `agent-has-skill-tag` | An agent holds a tagged skill | An agent — one named, or any — holds a skill carrying the given tag. |
| `text-mentions` | Text mentions | A case-insensitive regular expression matches the prose of some artifact of the given kinds: name, description, body, rule, guidance, when-to-use, statement. Never ids or tags. |
| `ai-judged` | Judged by a model | A model answers the prompt yes or no. Skipped until an endpoint is configured; run from the evaluation view. |

#### Requirement `level`

| Value | Label | Means |
| --- | --- | --- |
| `must` | Must | Unmet is an error, which blocks export and push. |
| `should` | Should | Unmet is a warning, counted in health. |

#### Scenario `mode`

| Value | Label | Means |
| --- | --- | --- |
| `manual` | Manual | A person runs it and judges the result. |
| `ai-judge` | AI judge | A model judges the result against the expected behaviours. |
| `runtime` | Runtime | Run by a harness and checked automatically. Recorded, not built: no harness runs these yet. |

#### Skill `resources[].kind`

| Value | Label | Means |
| --- | --- | --- |
| `reference` | Reference | A document the skill reads, under `references/` beside it. |
| `script` | Script | Something the skill runs, under `scripts/`. |
| `asset` | Asset | A file the skill uses — a template, an image, data — under `assets/`. |

#### Skill `resources[].encoding`

| Value | Label | Means |
| --- | --- | --- |
| `utf8` | Text | Stored as text, readable in the project files. |
| `base64` | Binary | Stored base64-encoded, for anything that is not text. |

#### Workflow step `type`

| Value | Label | Means |
| --- | --- | --- |
| `start` | Start | Where the workflow begins. Exactly one, named as the entry. |
| `end` | End | Where it finishes and reports the outcome. Every path should reach one. |
| `agent` | Agent | The named agent does this step. |
| `skill` | Skill | Apply the named skill. |
| `tool` | Tool | Use the named tool. |
| `condition` | Condition | Branch on a question; the outgoing connections carry the answers. |
| `verification` | Verification | Prove the work is right — by command, tests, review or by hand. What `BP-WF-011` looks for before the end. |
| `review` | Review | Another agent reads the result. Also counts as verification. |
| `gate` | Gate | The named gate decides whether to continue. Also counts as verification. |
| `human-approval` | Human approval | Stop and ask a person. Also counts as verification. |
| `output` | Output | Produce the result the step names. |
| `parallel` | Parallel | Split into branches; needs at least two outgoing connections. |
| `merge` | Merge | Bring branches back together by the merge strategy; needs at least two incoming. |
| `retry` | Retry | Try the preceding work again, up to the attempt limit. Bounds a loop. |
| `delegate` | Delegate | Hand off to the named agent and wait for it to return. |
| `synthesis` | Synthesis | Combine several branch results into one, in prose. |

#### Workflow connection `kind`

| Value | Label | Means |
| --- | --- | --- |
| `sequential` | Sequential | Then. The ordinary next step. |
| `parallel` | Parallel | At the same time as the other parallel connections from this step. |
| `conditional` | Conditional | Only when the condition on it holds. |
| `fallback` | Fallback | Only when the step failed. |
| `retry` | Retry | Go back and try again. Marks a loop as bounded for `BP-WF-014`. |
| `delegation` | Delegation | Hand off to the agent at the other end. |
| `review` | Review | Send the result to be reviewed. |
| `aggregation` | Aggregation | Collect results into the merge or synthesis at the other end. |

#### Workflow step `config.mergeStrategy`

| Value | Label | Means |
| --- | --- | --- |
| `all` | All | Wait for every branch. |
| `any` | Any | Continue when any branch finishes. |
| `first` | First | Take the first result and cancel the rest. |
| `synthesize` | Synthesize | Wait for all, then combine them in prose. |

#### Workflow step `config.verification.method`

| Value | Label | Means |
| --- | --- | --- |
| `command` | Command | Run the given command; zero exit is success. |
| `tests` | Tests | Run the test suite. |
| `review` | Review | Another agent reads it. |
| `manual` | Manual | A person checks. The agent stops and asks. |

#### Workflow step `config.onFailure`

| Value | Label | Means |
| --- | --- | --- |
| `stop` | Stop | End the workflow and report the failure. |
| `continue` | Continue | Note it and take the next step anyway. |
| `fallback` | Fallback | Follow the fallback connection from this step. |
| `retry` | Retry | Follow the retry connection, up to the attempt limit. |

#### Compile target `harnessId`

| Value | Label | Means |
| --- | --- | --- |
| `claude-code` | Claude Code | Anthropic’s CLI. Native skills, subagents, hooks, permissions and path-scoped rules. |
| `codex` | OpenAI Codex | AGENTS.md and skills; one approval policy per session, so per-command permissions become instructions. |
| `copilot` | GitHub Copilot | Custom agents, instructions and hooks under .github/. |
| `opencode` | OpenCode | opencode.json for agents and permissions; skills shared with Codex. |
| `pi` | Pi | Prompts and extensions under .pi/; no approval prompt, so ask lowers to enabled. |

<!-- prettier-ignore-end -->
<!-- options:end -->
