# 05 — Validation and evaluation

Validation answers "is this Blueprint well-formed and coherent?" with a list of `Diagnostic`s. Evaluation turns those findings plus heuristics into per-dimension scores with actionable items. Both are pure functions in `packages/core`; the UI only renders them.

All of it is implemented: `packages/core/src/validation/` (types, context, engine, structural, semantic, orphan, contradiction and requirement rules), `packages/core/src/evaluation/`, `packages/core/src/dependencies/graph.ts`, and the reader diagnostics in `packages/core/src/project/read.ts`. `packages/core/tests/docs.test.ts` fails when a code this catalogue does not list can be emitted, so the two cannot drift.

## 1. Diagnostic

```ts
interface Diagnostic {
  code: string // stable, e.g. 'BP-WF-001'
  severity: 'error' | 'warning' | 'info'
  message: string // complete sentence, names the artifact
  ref?: EntityRef // artifact to navigate to (absent for blueprint-level findings)
  related?: EntityRef[] // other artifacts involved (both sides of a contradiction)
  path?: string // file path when the finding comes from reading a project
  data?: JsonObject // rule-specific details (nodeId, relation, …)
}
```

Severity semantics:

| Severity  | Meaning                                                                                 | Effect                                              |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `error`   | The Blueprint is inconsistent or a file is broken; compilation may produce wrong output | Export and push are blocked until fixed (UI policy) |
| `warning` | Legal but probably not what the author wants; hurts quality or portability              | Counted in Health; export allowed                   |
| `info`    | Advisory                                                                                | Shown, not counted against Health                   |

`sortDiagnostics` orders by severity (error, warning, info), then code, then `ref` (`kind:id`, empty first, so blueprint-level findings precede entity findings), then message. `validateBlueprint` always returns sorted output. `summarizeDiagnostics` returns `{ errors, warnings, infos }`.

Rules are pure `(ctx: ValidationContext) => Diagnostic[]` with a `code` and `description`; `ValidationContext` exposes `blueprint`, a lazy `index` (`EntityIndex`) and a lazy `graph` (`DependencyGraph`). `validateBlueprint(bp, rules = ALL_RULES)` runs them; `ruleByCode(code)` finds one.

Code format: `BP-<AREA>-<nnn>`. Areas: `ID`, `REF`, `DESC`, `AGENT`, `WF`, `SKILL`, `LAW`, `TARGET`, `PROJECT`, `ORPHAN`, `CONTRA`, `REQ`, `HOOK`, `GATE`, `PORT`. Numbers 001–009 are structural, 010+ semantic.

## 2. Code catalogue

Every code below is also an entry in `validation/codes.ts`, which carries an optional `fields` list — the fields of the artifact the code is about, dotted for a key inside an object (`action.command`) — read by the editor to mark those controls (docs/07, P9-20) and by the AI fix as the only fields it may change (docs/06, P9-18). It also carries two pieces of prose the app shows and this table does not: a `summary` (what the code means, in one line) and a `remedy` (what to do about it, in a short paragraph). A finding's `message` says what is wrong _here_ and has to fit on a row; the remedy is the part that says how to make it go away, and the app renders it behind the **How to fix** control on every finding (docs/07, P9-10). `tests/docs.test.ts` fails if a code has no remedy, so adding a code means writing one. The "Fix" columns here are the spec-level note for whoever implements the rule; the remedy is the one written for the person the finding is shown to.

### 2.1 Implemented: reader (`project/read.ts`, `PROJECT_DIAGNOSTICS`)

| Code             | Severity | Fires when                                                                                                      | Fix                                                       |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `BP-PROJECT-002` | error    | An id is listed in `blueprint.yaml` but its main file is missing. Entity skipped.                               | Restore the file or remove the id from `artifacts`        |
| `BP-PROJECT-003` | error    | A file cannot be parsed or fails its schema. Message lists the Zod issues (`path: message; …`). Entity skipped. | Fix the listed fields                                     |
| `BP-PROJECT-004` | warning  | A main file exists on disk but is not listed in the manifest; it was appended.                                  | Save the project (the writer lists it) or delete the file |
| `BP-PROJECT-005` | info     | Unknown frontmatter keys were kept under `metadata`.                                                            | Remove them or accept them as metadata                    |
| `BP-PROJECT-006` | info     | Manifest `settings.sourceDir` differs from the directory read.                                                  | Save to update the manifest                               |

Manifest problems are thrown as `ProjectReadError` (`MANIFEST_MISSING`, `MANIFEST_INVALID`) or `UnsupportedSchemaVersionError` and are not diagnostics.

### 2.2 Implemented: structural rules (`validation/rules/structural.ts`, `STRUCTURAL_RULES`)

| Code            | Severity | Fires when                                                                                                                                                                                                                                                      | Fix                                                                                  |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `BP-ID-001`     | error    | Two entities of the same kind share an id (only possible in memory; files cannot collide).                                                                                                                                                                      | Rename one with `renameEntity`                                                       |
| `BP-ID-002`     | error    | An id is not a slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 64).                                                                                                                                                                                                         | Rename                                                                               |
| `BP-REF-001`    | error    | A reference points to a non-existent entity. Message: `Agent "x" references unknown skill "y" (uses-skill).` or `Blueprint "id" references unknown agent "y" (primary-agent).` `ref` = owner (absent for blueprint-level), `related` = target, `data.relation`. | Create the target or remove the reference (the UI offers both)                       |
| `BP-DESC-001`   | warning  | An agent, skill, workflow, iron law, gate or hook has no description.                                                                                                                                                                                           | Add one; descriptions drive skill activation and subagent selection in every harness |
| `BP-AGENT-001`  | warning  | An agent has no `responsibilities`.                                                                                                                                                                                                                             | Add responsibilities; they feed coverage checks                                      |
| `BP-AGENT-002`  | warning  | More than one agent and no `settings.primaryAgentId`. Blueprint-level (no `ref`).                                                                                                                                                                               | Pick the primary agent; otherwise the first agent becomes the root instruction file  |
| `BP-WF-001`     | error    | Workflow has no nodes, no `entryNodeId`, an `entryNodeId` that does not exist, or one that is not a `start` node. Message suggests the first start node id.                                                                                                     | Set `entryNodeId` to a start node                                                    |
| `BP-WF-002`     | warning  | Workflow has nodes but no `end` node.                                                                                                                                                                                                                           | Add an end node                                                                      |
| `BP-WF-003`     | error    | An edge's `from` or `to` is not a node id.                                                                                                                                                                                                                      | Fix or delete the edge                                                               |
| `BP-WF-004`     | error    | Duplicate node id inside a workflow.                                                                                                                                                                                                                            | Rename the node                                                                      |
| `BP-WF-005`     | warning  | An `agent`/`delegate` node without `agentId`, `skill` node without `skillId`, `gate` node without `gateId`, `tool` node without `toolId`. `data.nodeId`.                                                                                                        | Assign the target in the inspector                                                   |
| `BP-SKILL-001`  | warning  | Skill description longer than `SKILL_DESCRIPTION_MAX_LENGTH` (1024).                                                                                                                                                                                            | Shorten; move detail to the body                                                     |
| `BP-TARGET-001` | info     | No enabled export target.                                                                                                                                                                                                                                       | Enable a target                                                                      |
| `BP-TARGET-002` | error    | The same harness configured twice in `targets`.                                                                                                                                                                                                                 | Remove the duplicate                                                                 |
| `BP-LAW-001`    | warning  | An iron law or rule has `scope.all: false` with empty `agentIds` and `workflowIds`.                                                                                                                                                                             | Add ids or set `all: true`                                                           |

### 2.3 Semantic rules (implemented: `validation/rules/semantic.ts`, `rules/orphans.ts`, `contradictions.ts`, `requirements.ts`)

| Code                                                                                                                                   | Severity                            | Spec                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BP-WF-010`                                                                                                                            | warning                             | Unreachable node: not reachable from `entryNodeId` by following edges (any kind). `data.nodeId`. Ignore when `BP-WF-001` already fired for the workflow.                                                                                                                   |
| `BP-WF-011`                                                                                                                            | warning                             | Workflow has no `verification`, `gate`, `review` or `human-approval` node on any path from start to an end node. Message names the workflow and suggests a verification step before the end.                                                                               |
| `BP-WF-012`                                                                                                                            | warning                             | A `parallel` node with fewer than two outgoing edges, or a `merge`/`synthesis` node with fewer than two incoming edges.                                                                                                                                                    |
| `BP-WF-013`                                                                                                                            | warning                             | Dead end: a non-`end` node with no outgoing edge.                                                                                                                                                                                                                          |
| `BP-WF-014`                                                                                                                            | info                                | Cycle without a `retry` edge or `maxAttempts` (possible infinite loop in orchestration instructions).                                                                                                                                                                      |
| `BP-AGENT-010`                                                                                                                         | warning                             | Agent is not referenced by any workflow node (`node-agent`), has no `workflowIds`, is not the primary agent and is not a delegation target.                                                                                                                                |
| `BP-AGENT-011`                                                                                                                         | warning                             | Agent responsibilities without matching skills: no skill in `skillIds` whose name, description, tags or `whenToUse` shares a keyword (stemmed, stop-words removed) with the responsibility sentence. One diagnostic per responsibility; `data.responsibility`.             |
| `BP-AGENT-012`                                                                                                                         | info                                | Agent has tools but every permission operation is unset (harness defaults will apply).                                                                                                                                                                                     |
| `BP-SKILL-010`                                                                                                                         | warning                             | Skill is never activated: empty `activation` in every list **and** not referenced by any agent (`uses-skill`) or workflow node (`node-skill`).                                                                                                                             |
| `BP-SKILL-011`                                                                                                                         | info                                | Skill has no `## Verification` (or equivalent heading) in its body.                                                                                                                                                                                                        |
| `BP-ORPHAN-001`, `BP-ORPHAN-002`, `BP-ORPHAN-003`, `BP-ORPHAN-004`, `BP-ORPHAN-005`, `BP-ORPHAN-006`, `BP-ORPHAN-007`, `BP-ORPHAN-008` | warning                             | Unreferenced skill (001), workflow (002), iron law (003), rule (004), gate (005), tool (006), reference (007), memory (008), computed by `findOrphans(graph)` (see §5).                                                                                                    |
| `BP-LAW-010`                                                                                                                           | warning                             | Two iron laws conflict: same category, `rule` sentences that pass the contradiction heuristic (§3). `related` = the other law. Emitted once per pair (lower id first).                                                                                                     |
| `BP-LAW-011`                                                                                                                           | info                                | Iron law with `enforcement` containing `gate` but no gate mentions it. Implementation note: `hook` enforcement never fires this code, because every adapter generates the check automatically from `enforcement`, so demanding a hand-written hook would be a false alarm. |
| `BP-CONTRA-001`                                                                                                                        | warning                             | Contradiction across kinds (skill vs skill, skill vs law, law vs workflow body, rule vs law): see §3. `ref` = first artifact, `related` = second.                                                                                                                          |
| `BP-HOOK-010`                                                                                                                          | info                                | Hook with `action.type` `command`/`run-tests`/`format`/`lint`/`secret-scan` but neither a `command` nor a `script`.                                                                                                                                                        |
| `BP-HOOK-011`                                                                                                                          | info                                | Hook with both a `command` and a `script`; the script runs and the command is ignored (P9-30).                                                                                                                                                                             |
| `BP-GATE-010`                                                                                                                          | warning                             | Gate referenced by a workflow node whose `criteria` is empty.                                                                                                                                                                                                              |
| `BP-REQ-001`                                                                                                                           | error (`must`) / warning (`should`) | Requirement not satisfied: no check passed.                                                                                                                                                                                                                                |
| `BP-REQ-002`                                                                                                                           | warning                             | Requirement partially satisfied: some but not all checks passed. `data.passed`, `data.failed`.                                                                                                                                                                             |
| `BP-REQ-003`                                                                                                                           | info                                | Requirement has no checks (only prose), so it cannot be verified automatically.                                                                                                                                                                                            |
| `BP-REQ-004`                                                                                                                           | info                                | Requirement has only `ai-judged` checks and no AI is configured; skipped.                                                                                                                                                                                                  |
| `BP-REQ-005`                                                                                                                           | warning                             | A requirement check could not run, for example an invalid regular expression.                                                                                                                                                                                              |

### 2.4 Compilation and portability (implemented: `@agent-blueprint/exporters`, surfaced through validation)

| Code                                                                              | Severity | Spec                                                                                                        |
| --------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `BP-PORT-001`                                                                     | warning  | A feature used by the Blueprint is `unsupported` on an enabled target (from the adapter capability matrix). |
| `BP-PORT-002`                                                                     | info     | A feature is `adapted` or `limited` on an enabled target; message carries the adapter's explanation.        |
| `BP-TARGET-003`                                                                   | error    | `TargetConfig.options` failed the adapter schema; the target was skipped.                                   |
| `BP-COMPILE-001`                                                                  | error    | Two adapters produced different content for one path; neither was written. This is an adapter bug.          |
| `BP-CLAUDE-001`, `BP-CODEX-001`, `BP-COPILOT-001`, `BP-OPENCODE-001`, `BP-PI-001` | error    | A workflow and a skill share an id, so they compile to the same file and overwrite each other.              |
| `BP-CODEX-002`                                                                    | warning  | `AGENTS.md` is still over the Codex instruction budget after optional sections moved to a skill.            |
| `BP-COPILOT-002`                                                                  | warning  | A custom agent file is longer than the 30 000 characters Copilot reads.                                     |
| `BP-OPENCODE-002`                                                                 | warning  | An agent and a workflow share an id, so OpenCode has a `@name` and a `/name` that are not the same thing.   |
| `BP-PI-002`                                                                       | error    | An agent and a workflow share an id, so both compile to the same Pi prompt template.                        |

### 2.5 Evaluation-only findings (implemented: `evaluation/score.ts`)

Quality judgements rather than correctness ones, so `validateBlueprint` never returns them. They appear only in an `EvaluationReport` and carry `data.penalty`.

| Code                  | Penalty | Meaning                                                                         |
| --------------------- | ------- | ------------------------------------------------------------------------------- |
| `BP-EVAL-SKILL-001`   | 5       | Skill body under 200 characters.                                                |
| `BP-EVAL-SKILL-002`   | 3       | Skill has no Instructions section.                                              |
| `BP-EVAL-AGENT-001`   | 5       | Agent states no output requirements.                                            |
| `BP-EVAL-WF-001`      | 5       | Workflow has no triggers.                                                       |
| `BP-EVAL-LAW-001`     | 3       | Iron Law has no rationale.                                                      |
| `BP-EVAL-LAW-002`     | 2       | Iron Law has no examples or counterexamples.                                    |
| `BP-EVAL-LAW-003`     | n/a     | No Iron Laws at all; the dimension scores 40.                                   |
| `BP-EVAL-PORT-001`    | n/a     | Portability was not assessed because no capability data was injected.           |
| `BP-EVAL-VERIFY-001`  | 10      | No workflow has a verification step.                                            |
| `BP-EVAL-VERIFY-002`  | 5       | No gates exist.                                                                 |
| `BP-EVAL-VERIFY-003`  | 5       | No hook runs tests, a linter or a secret scan.                                  |
| `BP-EVAL-COMPLEX-001` | 2       | Workflow with more than 25 steps.                                               |
| `BP-EVAL-COMPLEX-002` | 3       | Two skills whose descriptions overlap by Jaccard 0.7 or more.                   |
| `BP-EVAL-COMPLEX-003` | 1       | Agent with more than 12 skills.                                                 |
| `BP-SAFETY-001`       | 10      | An agent may force-push without asking.                                         |
| `BP-SAFETY-002`       | 10      | An agent may make arbitrary network requests and no security law constrains it. |
| `BP-SAFETY-003`       | 5       | No Iron Law covers security.                                                    |
| `BP-SAFETY-004`       | 5       | No hook scans for secrets.                                                      |

The catalogue lives in code as well, in `packages/core/src/validation/codes.ts`; `packages/core/tests/docs.test.ts` fails when a code there is missing from this document.

### 2.6 AI findings (implemented: `@agent-blueprint/ai`, `operations/codes.ts`)

Findings a model produced rather than a rule. They are kept apart from the codes above because
they are not deterministic and a user is entitled to know which kind they are reading: every one
carries `data.source: 'ai'` and `data.claimedSeverity`, the UI marks them, and a filter removes
them. They never come from `validateBlueprint`; an operation returns them and the caller decides
whether to merge them into a view.

A finding whose `ref` names an artifact that does not exist is dropped before it is returned,
with a note. A finding in this product is something you click to get to the artifact, and one
that goes nowhere teaches the user that the list is not to be trusted.

| Code                | Severity                             | Meaning                                                                                                                                                                |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BP-AI-CONTRA-001`  | warning                              | Two instructions that cannot both be followed. `ref` is the first artifact, `related` the second.                                                                      |
| `BP-AI-MISSING-001` | warning (critical, high) or info     | Something the Blueprint implies but does not specify. `ref` is the artifact that implies it, when there is one.                                                        |
| `BP-AI-REQ-001`     | warning on `fail`, info on `unclear` | An `ai-judged` requirement check the model would not pass. `ref` is the requirement; `data.checkIndex` says which check. A check the model passes produces no finding. |

The catalogue lives in code in `packages/ai/src/operations/codes.ts`; `packages/ai/tests/docs.test.ts` fails when a code there is missing from this document. These three carry a `remedy` like the deterministic codes do, and for the same two uses: the "How to fix" note a person reads, and the steering `fixFinding` is given (docs/06). A finding from a model is still a finding.

### 2.7 What a model can be asked to clear (P9-12)

`fixabilityOf(diagnostic)` in `packages/ai` decides whether a finding is offered a **Fix with AI** control, and it says no for the codes whose remedy is real but is not made of artifact text: `BP-PROJECT-002` to `BP-PROJECT-006` (files on disk — the fix is a save or a restore), `BP-ID-001` and `BP-ID-002` (renaming is a refactor that has to carry every reference, which is `renameEntity` and not a rewrite), `BP-AGENT-002`, `BP-TARGET-001` to `BP-TARGET-003`, `BP-COMPILE-001` and `BP-EVAL-PORT-001` (settings and targets), and the five `BP-<HARNESS>-001` id collisions. Each refusal names the control that does the job instead. Where it agrees, it also narrows the kinds the fix may write — the finding's own `ref` kind and anything in `related`, plus a small per-code extension for the findings whose fix lives elsewhere (an orphan is usually attached to an agent; a Blueprint with no Iron Laws needs a law written).

## 3. Contradiction heuristic (implemented, `validation/contradictions.ts`)

Deterministic first pass; the AI pass (docs/06-ai-layer.md) may add more findings with the same codes and `data.source: 'ai'`.

Inputs: for every skill (`body`, `whenToUse`), iron law (`rule`, `body`), rule (`guidance`, `body`) and workflow (`body`), split text into sentences.

1. Normalize each sentence: lower-case, strip Markdown, collapse whitespace, drop list markers.
2. Keep sentences containing a modal: `always`, `never`, `must`, `must not`, `mustn't`, `do not`, `don't`, `should`, `should not`, `only`.
3. Extract polarity: negative when the modal is `never`, `must not`, `do not`, `should not`, `mustn't`, `don't`; positive otherwise.
4. Extract the noun phrase: tokens after the modal up to the first punctuation, stop-words removed, stemmed (simple suffix stripping: `-ing`, `-ed`, `-s`, `-es`, `-ies`→`y`).
5. Two sentences A and B from different artifacts are a candidate contradiction when polarity differs and the Jaccard overlap of their noun-phrase token sets ≥ 0.5 with at least two shared tokens.
6. Exclusions: both artifacts have explicit scopes (`scope.all: false` or activation lists) that do not intersect (different agents / workflows); the shared tokens are all generic (`test`, `code`, `file`, `change`); one sentence contains the other's negation verbatim inside a "counterexample" or "Do not" heading context.
7. Emit `BP-LAW-010` when both are iron laws, otherwise `BP-CONTRA-001`. `data.sentences: [a, b]`.

Tests: positive fixture pair ("Always use Library X" / "Never use Library X"), negative pair with disjoint scopes, negative pair with generic overlap only.

## 4. Requirement checks (implemented, `validation/requirements.ts`)

Evaluation semantics for each `RequirementCheck` (`packages/core/src/schema/quality.ts`):

| `type`                   | Passes when                                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow-has-node-type` | `workflowId` given: that workflow exists and has a node with `type === nodeType`. Not given: any workflow has one.                                                                                                                       |
| `iron-law-matches`       | `new RegExp(pattern, 'i')` matches `name`, `rule` or `body` of at least one iron law. Invalid regex → check fails with `data.error`.                                                                                                     |
| `hook-exists`            | Some hook matches every given filter: `trigger`, `action.type === actionType`. No filters → any hook.                                                                                                                                    |
| `gate-exists`            | Some gate exists; when `criterionKind` is given it must have a criterion of that kind.                                                                                                                                                   |
| `agent-has-skill-tag`    | `agentId` given: that agent's `skillIds` include a skill whose `tags` contain `tag` (case-insensitive). Not given: any agent.                                                                                                            |
| `text-mentions`          | Regex (case-insensitive) matches the concatenated text fields (`name`, `description`, `body`, plus `rule`, `guidance`, `whenToUse`, `statement`, `input` where present) of at least one entity of the given `kinds` (empty = all kinds). |
| `ai-judged`              | Not evaluated here. Result `skipped`; `BP-REQ-004` when it is the only kind of check. With AI configured, `judgeRequirements` (docs/06) returns `pass`, `fail` or `unclear` with a rationale, and the last two become `BP-AI-REQ-001`.   |

Result per requirement: `satisfied` (all non-skipped checks pass, at least one evaluated), `partial` (some pass), `unsatisfied` (none pass), `unverifiable` (no checks or only skipped). Mapped to `BP-REQ-001/002/003/004` as in §2.3. A `RequirementResult { ref, status, checks: { check, status: 'pass' | 'fail' | 'skipped', evidence?: EntityRef[], nearMisses?: NearMiss[] }[] }` type is returned alongside the diagnostics so the UI can render the ✓ / ⚠ / ✕ list with links to the evidence.

### Near misses (P9-19)

A failed check knows what it looked at, and says which candidate came closest and why it fell short: `NearMiss { ref, because, field? }`, where `field` is the control on that artifact the clause is about (`action.type`, `trigger`, `criteria`, `nodes`, `tags`, `skillIds`) so the editor can put the hint beside it (P9-20), at most three per check, where `because` is a clause — _"its action is command, not secret-scan"_, _"it runs on after-file-change, not before-stop"_, _"its criteria are tests-pass, review; none is human-approval"_, _"it is tagged "rust" but no agent holds it"_. Reported from use: a requirement failed with "nothing in the Blueprint meets its check" and the cause was a hook three artifacts away with the right trigger and the wrong action type. The check had looked straight at it.

| `type`                                           | What counts as a near miss                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `hook-exists`                                    | A hook meeting exactly one of the two filters; the clause names the one it misses                                                 |
| `gate-exists`                                    | Every gate, with its criterion kinds, or "it has no criteria at all"                                                              |
| `workflow-has-node-type`                         | Every workflow looked at, with its step types                                                                                     |
| `agent-has-skill-tag`                            | A skill carrying the tag that no considered agent holds (fix: attach it), and an agent none of whose skills carry it (fix: a tag) |
| `iron-law-matches`, `text-mentions`, `ai-judged` | None — a regular expression that matched nothing has no nearest candidate worth naming                                            |

The near misses of every failed check reach the `BP-REQ-001` / `BP-REQ-002` diagnostic three ways, because three different readers need them: the first one is appended to the **message** (_"The nearest is hook "Secret scan before stop": its action is command, not secret-scan."_), since the message is the one line every surface shows; the refs go in **`related`**, which is what every findings list navigates to; and the full list goes in **`data.nearMisses`** as `{ kind, id, because }`, which is what `fixFindings` reads as evidence (docs/06).

## 5. Dependency graph and orphans (implemented, `dependencies/graph.ts`)

`buildDependencyGraph(bp)` derives nodes (every entity) and edges (`from` depends on `to`, with `relation`) from `collectRefs`. Dangling references are collected separately in `graph.dangling` and drive `BP-REF-001`. `impactOf(graph, ref)` returns direct and transitive dependents plus `isPrimaryAgent`; the UI shows it before any delete.

`findOrphans(graph)` returns entities of `ORPHANABLE_KINDS` with no dependents:

| Kind                                                           | Orphanable | Why                                                                               |
| -------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| skill, workflow, iron-law, rule, gate, tool, reference, memory | yes        | They exist to be used by an agent, a workflow or another artifact                 |
| agent                                                          | no         | Agents are roots. "Agent has no workflow" is `BP-AGENT-010`, a different question |
| hook                                                           | no         | Hooks bind to harness lifecycle events, not to entities                           |
| requirement, scenario                                          | no         | They reference the Blueprint; nothing references them                             |

The primary agent counts as referenced by the Blueprint (`graph.primaryAgentId`).

## 6. Evaluation scoring (implemented, `evaluation/score.ts`)

`evaluateBlueprint(bp, options): EvaluationReport` computes ten dimensions from diagnostics and heuristics. Every score carries the findings that produced it; a score without findings is 100 and says so.

Penalty formula per dimension: `score = max(0, 100 - Σ penalty(finding))` with `error = 15`, `warning = 5`, `info = 1`, where a finding counts toward every dimension its code is mapped to. Dimensions with a coverage input multiply the result by the coverage ratio where noted.

| Dimension    | Weight | Inputs (codes)                                                      | Extra heuristics                                                                                                                                                          |
| ------------ | ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills       | 1.0    | `BP-SKILL-*`, `BP-DESC-001` (skills), `BP-ORPHAN-001`               | −5 per skill body under 200 chars; −3 per skill without `## Instructions`; −3 without any activation                                                                      |
| Agents       | 1.0    | `BP-AGENT-*`, `BP-DESC-001` (agents)                                | −5 per agent with no `outputRequirements`; −3 per agent with empty permissions                                                                                            |
| Workflows    | 1.0    | `BP-WF-*`, `BP-DESC-001` (workflows), `BP-ORPHAN-002`               | −5 per workflow without `triggers`                                                                                                                                        |
| Iron Laws    | 1.0    | `BP-LAW-*`, `BP-DESC-001` (laws), `BP-ORPHAN-003`                   | −3 per law without `rationale`; −2 without examples; 0 laws → 40                                                                                                          |
| Consistency  | 1.5    | `BP-CONTRA-*`, `BP-LAW-010`, `BP-REF-001`, `BP-ID-*`                |                                                                                                                                                                           |
| Portability  | 1.0    | `BP-PORT-*`                                                         | `Σ over enabled targets of (native = 1, adapted = 0.8, limited = 0.5, unsupported = 0) over features used`, averaged, × 100; no targets → 100 with an info finding        |
| Coverage     | 1.0    | `BP-AGENT-011`, `BP-REQ-*`, `BP-ORPHAN-*`                           | × (satisfied requirements / total requirements with checks)                                                                                                               |
| Verification | 1.5    | `BP-WF-011`, `BP-GATE-*`, `BP-HOOK-*`, `BP-LAW-011`                 | −10 when no workflow has a verification node; −5 when no gate exists; −5 when no `run-tests`/`lint`/`secret-scan` hook                                                    |
| Safety       | 1.5    | `BP-CONTRA-*` involving security laws, `BP-PORT-001` on permissions | −10 when any agent has `git.force-push: allow`; −10 for `net.any: allow` without a security law; −5 when no `security` category law exists; −5 when no `secret-scan` hook |
| Complexity   | 0.5    |                                                                     | −2 per workflow with more than 25 nodes; −3 per pair of skills whose descriptions have Jaccard ≥ 0.7 (redundancy); −1 per agent with more than 12 skills                  |

`overall = Σ(weight × score) / Σ(weight)`, rounded to an integer.

```ts
interface EvaluationReport {
  overall: number
  dimensions: {
    id:
      | 'skills'
      | 'agents'
      | 'workflows'
      | 'ironLaws'
      | 'consistency'
      | 'portability'
      | 'coverage'
      | 'verification'
      | 'safety'
      | 'complexity'
    label: string
    score: number
    weight: number
    findings: Diagnostic[] // each actionable, each with a ref where possible
  }[]
  requirements: RequirementResult[]
  diagnostics: Diagnostic[] // everything, sorted
  computedFrom: { schemaVersion: string; rulesVersion: string } // no timestamps
}
```

Reports are values; they are never written into `blueprint/`.

## 7. Health summary (implemented, `evaluation/health.ts`)

```ts
interface HealthSummary {
  errors: number
  warnings: number
  infos: number
  artifacts: number // countEntities
  orphans: { kind: EntityKind; count: number }[]
  targets: { harnessId: HarnessId; status: 'ok' | 'adapted' | 'limited' | 'blocked' }[]
  overall: number // EvaluationReport.overall
  topFindings: Diagnostic[] // first 5 after sortDiagnostics
}
```

Every entry the UI shows is a `Diagnostic` with a `ref`, so clicking navigates to the artifact.

## 8. Testing guidance

- One test per rule with a positive fixture (fires) and a negative fixture (does not fire). Start from `loadFixture()` in `packages/core/tests/helpers.ts` and mutate a `structuredClone`.
- Assert codes and `ref`s, not full messages, except for one message per rule to pin wording.
- The unmodified fixture must produce **zero** diagnostics from `validateBlueprint` (`tests/validation.test.ts`). When a new rule fires on the fixture, either the fixture has a real gap (fix the fixture) or the rule is too eager (fix the rule).
- Every rule's `code` must be unique and match `/^BP-[A-Z]+-\d{3}$/`; every code must appear in this document.
- Scoring tests: a report for the fixture must have `overall ≥ 90`; each heuristic gets a test that removes the relevant artifact and asserts the drop.
