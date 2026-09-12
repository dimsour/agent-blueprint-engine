# Harness reference: Claude Code

Verified against official docs on 2026-09-08. Claude Code is the first fully supported target
(roadmap P2). It has native primitives for almost every Blueprint concept: skills, subagents,
path-scoped rules, hooks, permissions and memory. When a field below says "verify", check the
linked source before relying on it.

## File layout

| Path                                                                                                     | Purpose                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` or `.claude/CLAUDE.md`                                                                       | Project instructions. All ancestor directories' files are concatenated root → cwd; subdirectory `CLAUDE.md` loads on demand when files there are read. Supports `@path` imports (max depth 4). Claude Code reads `CLAUDE.md`, not `AGENTS.md`; bridge with an `@AGENTS.md` import. |
| `CLAUDE.local.md`                                                                                        | Personal, gitignored instructions.                                                                                                                                                                                                                                                 |
| `~/.claude/CLAUDE.md`                                                                                    | User-level instructions.                                                                                                                                                                                                                                                           |
| `.claude/rules/**/*.md`                                                                                  | Modular rules, discovered recursively. Optional `paths:` frontmatter (glob list) makes a rule lazy-load only when matching files are read.                                                                                                                                         |
| `.claude/skills/<name>/SKILL.md`                                                                         | Skills, also usable as slash commands. Supporting files live alongside (`reference.md`, `references/`, `scripts/`, `assets/`). Also `~/.claude/skills/`, nested `<subdir>/.claude/skills/`, plugin `skills/`.                                                                      |
| `.claude/commands/<name>.md`                                                                             | Legacy single-file slash commands (still work; subset of skill frontmatter).                                                                                                                                                                                                       |
| `.claude/agents/<name>.md`                                                                               | Subagents. Also `~/.claude/agents/`.                                                                                                                                                                                                                                               |
| `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`, managed-settings.json | Permissions, hooks, env, model, `agent`, `skillOverrides`, `autoMemoryEnabled`, `autoMemoryDirectory`, `claudeMdExcludes`.                                                                                                                                                         |
| `~/.claude/projects/<project>/memory/MEMORY.md` + topic files                                            | Auto memory written by Claude. The first 200 lines / 25 KB of `MEMORY.md` load each session.                                                                                                                                                                                       |

## SKILL.md frontmatter

All fields optional; `name` defaults to the directory name.

| Field                      | Type                                            | Notes                                                                                                       |
| -------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `name`                     | string                                          | Must match directory name per Agent Skills spec: ≤ 64 chars, `[a-z0-9-]`, no leading/trailing/double hyphen |
| `description`              | string                                          | ≤ 1024 chars (spec)                                                                                         |
| `when_to_use`              | string                                          | Activation guidance shown to the model                                                                      |
| `argument-hint`            | string                                          |                                                                                                             |
| `arguments`                | string or list                                  | Named `$name` arguments                                                                                     |
| `disable-model-invocation` | boolean                                         | Only the user can invoke                                                                                    |
| `user-invocable`           | boolean                                         |                                                                                                             |
| `allowed-tools`            | string or list                                  | Supports `Bash(git add *)` style rules                                                                      |
| `disallowed-tools`         | string or list                                  |                                                                                                             |
| `model`                    | string                                          |                                                                                                             |
| `effort`                   | `low` \| `medium` \| `high` \| `xhigh` \| `max` |                                                                                                             |
| `context`                  | `fork`                                          | Run in a forked context                                                                                     |
| `agent`                    | string                                          | `Explore` \| `Plan` \| `general-purpose` \| custom agent name                                               |
| `background`               | boolean                                         |                                                                                                             |
| `hooks`                    | map                                             | Skill-scoped hooks                                                                                          |
| `paths`                    | string or list                                  | Globs; lazy-load like rules                                                                                 |
| `shell`                    | `bash` \| `powershell`                          |                                                                                                             |
| `metadata`                 | map                                             | Spec: string → string                                                                                       |
| `license`, `compatibility` | string                                          | Spec fields                                                                                                 |

Substitutions in the body: `$ARGUMENTS`, `$ARGUMENTS[N]` / `$N`, `${CLAUDE_SKILL_DIR}`,
`${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`; `` !`cmd` `` injects command output.
Portable (spec) fields: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`.

## Subagent frontmatter (`.claude/agents/<name>.md`)

| Field                    | Type                                                                                           | Notes                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `name`                   | string, required                                                                               | lowercase + hyphens, no `:`              |
| `description`            | string, required                                                                               | When Claude should delegate to it        |
| `tools`                  | list                                                                                           | Supports `Agent(a, b)`, `mcp__server__*` |
| `disallowedTools`        | list                                                                                           |                                          |
| `model`                  | `sonnet` \| `opus` \| `haiku` \| `fable` \| full id \| `inherit`                               |                                          |
| `permissionMode`         | `default` \| `acceptEdits` \| `auto` \| `dontAsk` \| `bypassPermissions` \| `plan` \| `manual` |                                          |
| `maxTurns`               | integer                                                                                        |                                          |
| `skills`                 | list                                                                                           | Preloaded skills                         |
| `mcpServers`             | list or object                                                                                 |                                          |
| `hooks`                  | object                                                                                         | `PreToolUse` / `PostToolUse` / `Stop`    |
| `memory`                 | `user` \| `project` \| `local`                                                                 | Persistent memory scope                  |
| `background`             | boolean                                                                                        |                                          |
| `effort`                 | as above                                                                                       |                                          |
| `isolation`              | `worktree`                                                                                     |                                          |
| `color`, `initialPrompt` | string                                                                                         |                                          |
| `experimental.cacheTtl`  |                                                                                                |                                          |

The Markdown body is the subagent's system prompt.

## Hooks (`settings.json`)

```json
{
  "hooks": {
    "<Event>": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "dotnet test", "timeout": 600 }]
      }
    ]
  }
}
```

Events: `SessionStart`, `SessionEnd`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `Stop`,
`StopFailure`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`,
`PermissionRequest`, `PermissionDenied`, `SubagentStart`, `SubagentStop`, `TeammateIdle`,
`TaskCreated`, `TaskCompleted`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`,
`DirectoryAdded`, `FileChanged`, `WorktreeCreate` / `WorktreeRemove`, `PreCompact`, `PostCompact`,
`PreModelSwitch`, `PostModelSwitch`, `MessageDisplay`, `Notification`, `Elicitation` / `ElicitationResult`.

Handler fields: `type` (`command` \| `http` \| `mcp_tool` \| `prompt` \| `agent`), `command`,
`args` (exec form), `shell`, `async`, `asyncRewake`, `timeout` (default 600 s), `if`
(permission-rule filter, e.g. `Bash(git *)`), `statusMessage`, `once`, `url` / `headers` /
`allowedEnvVars` (http), `server` / `tool` / `input` (mcp_tool), `prompt` / `model` (prompt).
Matcher: `*` or empty = all; plain `A|B` = exact list; otherwise regex; matched against the tool
name for tool events. `disableAllHooks` at top level.

Exit codes: `0` success (stdout JSON is parsed; plain text becomes context on
`UserPromptSubmit` / `SessionStart`), `2` blocking (stderr is the reason), other = non-blocking error.

JSON output shape:

```json
{
  "continue": true,
  "stopReason": "…",
  "suppressOutput": false,
  "systemMessage": "…",
  "decision": "block",
  "reason": "…",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow | deny | ask",
    "permissionDecisionReason": "…",
    "updatedInput": {},
    "additionalContext": "…",
    "retry": false
  }
}
```

## Permissions (`settings.json`)

```json
{
  "permissions": {
    "allow": ["Bash(dotnet test *)", "Read(./src/**)"],
    "ask": ["Bash(git commit *)"],
    "deny": ["Bash(git push --force *)", "WebFetch"],
    "defaultMode": "default",
    "additionalDirectories": [],
    "disableBypassPermissionsMode": "disable"
  }
}
```

Precedence: deny > ask > allow. Rule forms: `Bash`, `Bash(npm run *)` (trailing ` *` also matches
the bare command; `:*` is an equivalent suffix), `Read(./.env)`, `Edit(/src/**/*.ts)` (`//abs`,
`~/home`, `/settings-relative`, `rel`), `WebFetch(domain:*.example.com)`, `mcp__server`,
`mcp__server__tool`, `mcp__server__*`, `Agent(Explore)`, `Agent(model:opus)`, `Skill(name)`,
`Bash(run_in_background:true)`. Project `allow` / `additionalDirectories` are gated by workspace trust.

## Support matrix

| Concept                   | Support          | Explanation                                                                                              |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| Skills                    | native           | `.claude/skills/<id>/SKILL.md`, Agent Skills spec plus Claude extras                                     |
| Agents / subagents        | native           | `.claude/agents/<id>.md`                                                                                 |
| Parallel agents           | native           | Subagents run in the background; Agent tool fan-out                                                      |
| Workflows / orchestration | adapted          | No workflow primitive; compiled to an orchestration skill (`context: fork`, Agent tool delegation)       |
| Hooks                     | native           | 30+ events, command / prompt / agent handlers                                                            |
| Gates                     | native / adapted | Executable criteria → `Stop` / `SubagentStop` hooks; non-executable → instructions in the workflow skill |
| Permissions               | native           | allow / ask / deny rules with patterns                                                                   |
| Memory                    | native           | Auto memory, `CLAUDE.md`, subagent `memory:`                                                             |
| Path-scoped rules         | native           | `.claude/rules/*.md` with `paths:`; skill `paths:`                                                       |
| Commands / prompts        | native           | Skills are slash commands; legacy `.claude/commands`                                                     |
| Iron laws                 | adapted          | Section in `CLAUDE.md` plus optional `prompt`-type hook check                                            |
| References                | native           | Files beside `SKILL.md` (`references/`)                                                                  |
| `AGENTS.md`               | adapted          | Import via `@AGENTS.md` in `CLAUDE.md`                                                                   |

## How Agent Blueprint compiles to Claude Code

Adapter `claude-code` . Source entities are defined in `packages/core/src/schema`.

| Blueprint                                                                                                             | Output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Support                                                                |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Primary agent (`settings.primaryAgentId`, else first agent): `body`, `role`, `responsibilities`, `outputRequirements` | `CLAUDE.md` persona section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | native                                                                 |
| Iron laws (`ironLaws[]`: `rule`, `rationale`, `violationBehavior`, `severity`)                                        | `CLAUDE.md` "Iron Laws" section, sorted by severity then id; laws with `enforcement` containing `hook` also get a `Stop` hook of type `prompt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | adapted                                                                |
| Rules without `paths`                                                                                                 | `CLAUDE.md` "Rules" section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | adapted                                                                |
| Rules with `paths`                                                                                                    | `.claude/rules/<id>.md` with `paths:` frontmatter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | native                                                                 |
| Skills (`skills[]`)                                                                                                   | `.claude/skills/<id>/SKILL.md` + `resources[]` as sibling files; `activation.filePatterns` + `directories` → `paths:`; `activation.intents` + `whenToUse` → `when_to_use`; `allowedToolIds` → `allowed-tools`; `invocation.userInvocable: false` → `user-invocable: false`; `invocation.argumentHint` → `argument-hint` (P9-31)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | native                                                                 |
| Non-primary agents                                                                                                    | `.claude/agents/<id>.md`: `description`, `tools` (from `toolIds`, minus tools turned off below, plus `Agent(<delegates>)` when the agent has tools and `delegation.canDelegateTo`), `disallowedTools` (P9-26: every tool behind a denied operation when no other decided operation needs it — `fs.read` → Read, Glob, Grep; `fs.write` → Edit, Write, NotebookEdit; the shell and git operations → Bash; `net.docs` → WebFetch; `net.any` → WebFetch, WebSearch; `mcp` → each `mcp__<server>`), a "Not allowed" section for denials that could not turn a tool off, `model` (from `model.preference`: fast → `haiku`, balanced → `sonnet`, strong → `opus`; `hint` wins when set), `skills` (from `skillIds`), `memory: project` when `memoryIds` is non-empty, `permissionMode` derived from permissions (all allow → `acceptEdits`, any ask → `default`) | native                                                                 |
| Workflows (`workflows[]`)                                                                                             | `.claude/skills/<id>/SKILL.md` orchestration skill (`user-invocable: true`); see `docs/04-compiler.md` "emitWorkflowSkill"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | adapted                                                                |
| Hooks (`hooks[]`)                                                                                                     | `.claude/settings.json` → `hooks` (table below); a hook with `action.script` also writes `.claude/hooks/<id>.sh` and runs it as `bash "${CLAUDE_PROJECT_DIR}/.claude/hooks/<id>.sh"` (P9-30)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | native                                                                 |
| Gates (`gates[]`) with executable `criteria[].command`                                                                | `Stop` hooks running the command through the failure wrapper below: `block` → exit 2; `request-approval` → exit 2 with a line asking for the user first; `warn` → exit 1; `allow` → `\|\| true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | native                                                                 |
| Gates without commands                                                                                                | Instructions in the orchestration skill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | adapted                                                                |
| Permissions (`agents[].permissions`) of the primary agent                                                             | `.claude/settings.json` → `permissions` (table below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | native                                                                 |
| Tools (`tools[]` with `mcp`)                                                                                          | `.mcp.json` server entries (`command`, `args`, `url`, `env` names only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | native, verify against [MCP docs](https://code.claude.com/docs/en/mcp) |
| Memory (`memories[]`)                                                                                                 | `CLAUDE.md` "Memory" section listing `categories` and `body` seed; `settings.json` `autoMemoryEnabled: true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | native                                                                 |
| References (`references[]`) attached to skills                                                                        | `.claude/skills/<skill>/references/<id>.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | native                                                                 |
| References attached only to agents                                                                                    | `.claude/references/<id>.md` and an `@.claude/references/<id>.md` import in `CLAUDE.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | adapted                                                                |
| Requirements, scenarios                                                                                               | Not emitted (authoring-time only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | n/a                                                                    |

### Hook trigger lowering

| Blueprint trigger    | Claude event         | Matcher                                                                                                                                              |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-start`      | `SessionStart`       | none                                                                                                                                                 |
| `user-prompt`        | `UserPromptSubmit`   | none                                                                                                                                                 |
| `before-tool`        | `PreToolUse`         | from `conditions.toolKinds`: filesystem → `Edit\|Write\|Read`, shell → `Bash`, git → `Bash`, browser/search → `WebFetch\|WebSearch`, mcp → `mcp__.*` |
| `after-tool`         | `PostToolUse`        | same mapping                                                                                                                                         |
| `after-file-change`  | `PostToolUse`        | `Edit\|Write`                                                                                                                                        |
| `before-stop`        | `Stop`               | none                                                                                                                                                 |
| `subagent-stop`      | `SubagentStop`       | none                                                                                                                                                 |
| `after-tool-failure` | `PostToolUseFailure` | from `conditions.toolKinds`, as `before-tool`; cannot refuse (reported when `onFailure: block`)                                                      |
| `subagent-start`     | `SubagentStart`      | none; cannot refuse                                                                                                                                  |
| `before-compact`     | `PreCompact`         | none; cannot refuse                                                                                                                                  |
| `after-compact`      | `PostCompact`        | none; cannot refuse                                                                                                                                  |

Action lowering: `command` / `run-tests` / `format` / `lint` / `secret-scan` → `{ "type": "command", "command": <wrapped action.command>, "timeout": <timeoutSec> }`; `prompt-check` → `{ "type": "prompt", "prompt": <action.prompt> }`; `check-iron-laws` → `{ "type": "prompt", "prompt": <generated from the iron laws in scope> }`.

Failure wrapper (P9-25). Claude reads a hook's result from its exit code: 2 refuses the action and hands stderr to the model; any other non-zero exit is a non-blocking error shown to the user. A test runner exits 1 and writes to stdout, so run as written it can neither block nor be seen by the agent. Every command is therefore emitted as `out=$(<command> 2>&1) || { printf '%s\n' "$out" >&2; exit <code>; }` — nothing on success, the output on stderr with the right code on failure. `onFailure: block` and `return-to-agent` → exit 2 (the same mechanism: on `PostToolUse` it feeds the output back, on `Stop` and `PreToolUse` it also refuses); `warn` → exit 1. The wrapper is POSIX shell; Claude Code runs hooks in `sh` and, on Windows, in the Git Bash it requires.

`action.async: true` → the handler's `async: true`, and the command is emitted as written: a background hook's result is discarded, so there is nothing to wrap its failure for.

`conditions.filePatterns` on `PreToolUse` / `PostToolUse` / `PostToolUseFailure` → the handler's `if` field, one `Tool(<glob>)` rule per path-taking tool the matcher names (`Edit`, `NotebookEdit`, `Read`, `Write`; all four when the matcher names none), joined with `|`. On other events, or when the matcher names only tools that take no path (`Bash`), the pattern stays a note in the compatibility view and the command has to check the path itself.

### Permission lowering

| Operation        | Claude rule                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `fs.read`        | `Read`                                                                                             |
| `fs.write`       | `Edit`, `Write`                                                                                    |
| `fs.delete`      | `Bash(rm *)` (there is no delete tool; deletion happens through the shell)                         |
| `shell.readonly` | `Bash(git status *)`, `Bash(git diff *)`, `Bash(ls *)`, `Bash(cat *)` and a curated read-only list |
| `shell.mutating` | `Bash`                                                                                             |
| `git.read`       | `Bash(git log *)`, `Bash(git status *)`, `Bash(git diff *)`, `Bash(git show *)`                    |
| `git.commit`     | `Bash(git add *)`, `Bash(git commit *)`                                                            |
| `git.push`       | `Bash(git push *)`                                                                                 |
| `git.force-push` | `Bash(git push --force *)`, `Bash(git push -f *)`                                                  |
| `net.docs`       | `WebFetch(domain:<each documentation domain from tools of kind documentation>)`                    |
| `net.any`        | `WebFetch`, `WebSearch`                                                                            |
| `mcp`            | `mcp__<server>` per MCP tool                                                                       |

Decision → list: `allow` → `permissions.allow`, `ask` → `permissions.ask`, `deny` → `permissions.deny`.
`patterns[]` lower to the same rule with the pattern substituted, e.g. `{ operation: shell.mutating, pattern: "dotnet test *", decision: allow }` → `Bash(dotnet test *)` in `allow`. Since deny > ask > allow, a broad deny on `shell.mutating` with an allow pattern would still deny; the adapter therefore emits `ask` (not `deny`) for the broad operation when any allow pattern exists, and reports a `CompatibilityIssue` explaining the widening.

## Known limitations and open questions

- Hook file-pattern conditions are native only on tool events, through `if`; a `Stop` or `Bash` hook with a pattern has to check the path itself.
- `CLAUDE.md` size: keep the compiled file focused; long references are moved to skills or `.claude/references/` and imported.
- Whether unknown keys in `settings.json` are tolerated is not documented; the adapter emits only documented keys and never writes a generated-file header into JSON.
- MCP server env values are never emitted; only variable names, with a README note.
- `permissionMode` derivation is a heuristic; the user can override through target `options`.

## Sources

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/settings
- https://agentskills.io/specification
