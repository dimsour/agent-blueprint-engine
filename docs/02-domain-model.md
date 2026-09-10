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

| Field                | Type                                                              | Default                            | Meaning                                                                                     |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `role`               | AgentRole                                                         | required                           | `worker`, `reviewer`, `researcher`, `investigator`, `architect`, `verifier`, `orchestrator` |
| `expertise`          | string[]                                                          | `[]`                               | Domains / technologies                                                                      |
| `responsibilities`   | string[]                                                          | `[]`                               | What the agent is accountable for (warned when empty)                                       |
| `skillIds`           | Slug[]                                                            | `[]`                               | Skills the agent may use (order is meaningful: priority)                                    |
| `workflowIds`        | Slug[]                                                            | `[]`                               | Workflows the agent runs                                                                    |
| `ironLawIds`         | Slug[]                                                            | `[]`                               | Laws bound to the agent                                                                     |
| `ruleIds`            | Slug[]                                                            | `[]`                               | Rules followed                                                                              |
| `toolIds`            | Slug[]                                                            | `[]`                               | Tools available                                                                             |
| `referenceIds`       | Slug[]                                                            | `[]`                               | Deep knowledge available                                                                    |
| `memoryIds`          | Slug[]                                                            | `[]`                               | Memory definitions                                                                          |
| `permissions`        | PermissionSet                                                     | `{ operations: {}, patterns: [] }` | What the agent _may_ do (distinct from tools: what it _can_ do)                             |
| `outputRequirements` | string[]                                                          | `[]`                               | What a finished task must include                                                           |
| `model`              | `{ preference: 'fast' \| 'balanced' \| 'strong'; hint?: string }` |                                    | Model preference; `hint` may carry a concrete model id                                      |
| `delegation`         | `{ canDelegateTo: Slug[] }`                                       |                                    | Agents this one may delegate to                                                             |
| `body`               | Markdown                                                          | `''`                               | Persona / system prompt                                                                     |

PermissionSet (`permissionSetSchema`):

| Field        | Type                                                    | Meaning                                                                                                                                            |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operations` | partial record PermissionOperation → PermissionDecision | Blanket decision per operation; unset falls back to the harness default                                                                            |
| `patterns`   | `{ operation, pattern, decision }[]`                    | Finer overrides evaluated before `operations`; `pattern` is a harness-agnostic glob or command prefix (`git push *`, `src/**`, `docs.example.com`) |

`PERMISSION_OPERATIONS`: `fs.read`, `fs.write`, `fs.delete`, `shell.readonly`, `shell.mutating`, `git.read`, `git.commit`, `git.push`, `git.force-push`, `net.docs`, `net.any`, `mcp`.
`PERMISSION_DECISIONS`: `allow`, `ask`, `deny`.

## 5. Skill

`skillSchema` = EntityBase +

| Field            | Type            | Default        | Meaning                                                                                |
| ---------------- | --------------- | -------------- | -------------------------------------------------------------------------------------- |
| `whenToUse`      | string          |                | Compiled into `when_to_use` / description text                                         |
| `activation`     | SkillActivation | all lists `[]` | When the skill becomes active (see below)                                              |
| `referenceIds`   | Slug[]          | `[]`           | References the skill relies on                                                         |
| `allowedToolIds` | Slug[]          | `[]`           | Tools the skill may use (→ Agent Skills `allowed-tools`)                               |
| `resources`      | SkillResource[] | `[]`           | Files shipped next to SKILL.md                                                         |
| `body`           | Markdown        | `''`           | SKILL.md body: purpose, when to use, instructions, constraints, examples, verification |

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

| Field         | Type                                      | Default                         | Meaning                                                  |
| ------------- | ----------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| `entryNodeId` | Slug                                      |                                 | Must point at a `start` node (`BP-WF-001`)               |
| `nodes`       | WorkflowNode[]                            | `[]`                            | Sorted by id by normalization                            |
| `edges`       | WorkflowEdge[]                            | `[]`                            | Sorted by id by normalization                            |
| `triggers`    | `{ intents: string[]; agentIds: Slug[] }` | `{ intents: [], agentIds: [] }` | What starts the workflow                                 |
| `body`        | Markdown                                  | `''`                            | Prose description, compiled into the orchestration skill |

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

| Field               | Type                                                | Default      | Meaning                                                                                                          |
| ------------------- | --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `trigger`           | HookTrigger                                         | required     | `session-start`, `user-prompt`, `before-tool`, `after-tool`, `after-file-change`, `before-stop`, `subagent-stop` |
| `conditions`        | `{ toolKinds: ToolKind[]; filePatterns: string[] }` | both `[]`    |                                                                                                                  |
| `action.type`       | HookActionType                                      | required     | `command`, `prompt-check`, `run-tests`, `format`, `lint`, `secret-scan`, `check-iron-laws`                       |
| `action.command`    | string                                              |              | Shell command for command-like actions                                                                           |
| `action.prompt`     | string                                              |              | Natural-language check for `prompt-check` / `check-iron-laws`                                                    |
| `action.timeoutSec` | int 1–3600                                          |              |                                                                                                                  |
| `onSuccess`         | literal `'continue'`                                | `'continue'` |                                                                                                                  |
| `onFailure`         | `'block' \| 'warn' \| 'return-to-agent'`            | `'block'`    | `HOOK_FAILURE_BEHAVIORS`                                                                                         |
| `severity`          | Severity                                            | `'high'`     |                                                                                                                  |

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
