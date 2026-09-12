# Harness reference: OpenAI Codex

Verified against official docs on 2026-09-08. Codex (CLI, cloud and IDE) is the second fully
supported target (roadmap P2). Documentation moved from `developers.openai.com/codex/*` to
`learn.chatgpt.com/docs/*`; old URLs redirect. Codex has native skills (Agent Skills standard),
custom subagents, hooks, memories, and a coarse sandbox / approval permission model.

## File layout

| Path                                                                                                                                  | Purpose                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `~/.codex/AGENTS.override.md`, `~/.codex/AGENTS.md`                                                                                   | User-level instructions                                                                                                         |
| `<git-root>/…/<cwd>/AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames`                                              | Project instructions, one file per directory, concatenated root → cwd; total capped by `project_doc_max_bytes` (32 KiB default) |
| `~/.codex/config.toml`, `.codex/config.toml` (project, only when trusted), `/etc/codex/config.toml`, `~/.codex/<profile>.config.toml` | Config layering: CLI > project > profile > user > system                                                                        |
| `.agents/skills/<name>/SKILL.md` (cwd, parents, repo root), `~/.agents/skills/`, `/etc/codex/skills`, system                          | Skills (Agent Skills standard). Optional `agents/openai.yaml` beside `SKILL.md`                                                 |
| `.codex/agents/<name>.toml`, `~/.codex/agents/`                                                                                       | Custom subagents                                                                                                                |
| `~/.codex/hooks.json`, `.codex/hooks.json`, or `[hooks]` in `config.toml`; plugin `hooks/hooks.json`                                  | Hooks                                                                                                                           |
| `~/.codex/memories/`                                                                                                                  | Generated memories                                                                                                              |

## config.toml fields

| Key                         | Type / values                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`                     | string                                                                                                                                                              |
| `model_reasoning_effort`    | `minimal` \| `low` \| `medium` \| `high` \| `xhigh`                                                                                                                 |
| `approval_policy`           | `untrusted` \| `on-request` \| `never` (or table)                                                                                                                   |
| `sandbox_mode`              | `read-only` \| `workspace-write` \| `danger-full-access`                                                                                                            |
| `[sandbox_workspace_write]` | `writable_roots[]`, `network_access` (bool), `exclude_tmpdir_env_var`, `exclude_slash_tmp`                                                                          |
| `[projects."<path>"]`       | `trust_level = "trusted" \| "untrusted"`                                                                                                                            |
| `[mcp_servers.<id>]`        | `command`, `args`, `env`, `cwd`, `url`, `bearer_token_env_var`, `enabled`, `required`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools` |
| `[features]`                | flags incl. `hooks`, `memories`, `multi_agent`, `web_search`                                                                                                        |
| `[agents]`                  | `enabled`, `max_concurrent_threads_per_session`, `default_subagent_model`, `default_subagent_reasoning_effort`, `<name>.description`, `<name>.config_file`          |
| `[memories]`                | `generate_memories`, `use_memories`, `disable_on_external_context`, `max_unused_days`, `extract_model`, `consolidation_model`                                       |
| other                       | `model_instructions_file`, `notify`, `web_search`, `personality`, `[shell_environment_policy]`, `[history]`                                                         |

## Custom agent TOML (`.codex/agents/<name>.toml`)

Required: `name`, `description`, `developer_instructions`. Optional: any config key (`model`,
`model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`). Built-ins: `default`,
`explorer`, `worker`. Agents are spawned via the multi-agent tools; precedence: explicit spawn
values > `[agents]` defaults > parent.

## Skills: `agents/openai.yaml`

```yaml
interface:
  display_name: xUnit
  short_description: Write idiomatic xUnit tests
  icon_small: ''
  icon_large: ''
  brand_color: ''
  default_prompt: ''
policy:
  allow_implicit_invocation: true
dependencies:
  tools: []
```

Invoke a skill with `$skill-name`.

## Hooks

Events: `SessionStart` (matcher `startup` \| `resume` \| `clear` \| `compact`), `SessionEnd`,
`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`,
`SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`.

Handler: `type` (`command` \| `mcp_tool`), `command`, `commandWindows`, `timeout`, `statusMessage`,
`async`, `additionalContextLimit`, `server` / `tool` / `input` (mcp_tool).

Exit codes: `0` ok, `2` block (stderr = reason), other = failure. JSON output mirrors Claude Code:
`continue`, `stopReason`, `systemMessage`, `suppressOutput`,
`hookSpecificOutput { hookEventName, additionalContext, permissionDecision, permissionDecisionReason, updatedInput, decision: block | approve }`.
Non-managed hooks require one-time trust (`/hooks`). Hooks require `[features] hooks = true`.

## Support matrix

| Concept                   | Support          | Explanation                                                                                        |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| Skills                    | native           | `.agents/skills/<id>/SKILL.md`                                                                     |
| Agents / subagents        | native           | `.codex/agents/<id>.toml` with `[features] multi_agent`                                            |
| Parallel agents           | native           | `max_concurrent_threads_per_session`                                                               |
| Workflows / orchestration | adapted          | Orchestration skill invoked with `$workflow-id`                                                    |
| Hooks                     | native           | 12 events in `.codex/hooks.json`                                                                   |
| Gates                     | native / adapted | `Stop` hook for executable criteria; instructions otherwise                                        |
| Permissions               | limited          | `approval_policy` + `sandbox_mode` are global and coarse; per-command patterns become instructions |
| Memory                    | native           | `[features] memories`, opt-in                                                                      |
| Path-scoped rules         | adapted          | Nested `AGENTS.md` per directory (plain directory patterns only)                                   |
| Commands / prompts        | adapted          | `$skill` invocation; no separate prompt files                                                      |
| Iron laws                 | adapted          | Section in `AGENTS.md`; optional `Stop` hook                                                       |
| References                | native           | Files beside `SKILL.md`                                                                            |
| `AGENTS.md`               | native           |                                                                                                    |

## How Agent Blueprint compiles to Codex

Adapter `codex` .

| Blueprint                                                                          | Output                                                                                                                                                                                                                                                                                                                                                   | Support          |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Primary agent persona, iron laws, rules, agent roster, workflow index, memory seed | `AGENTS.md` via the shared `emitAgentsMd` (see `docs/04-compiler.md`); if the result exceeds 30 KiB the "Rules" and "References" sections move to skills and are replaced by a one-line pointer                                                                                                                                                          | native           |
| Skills                                                                             | `.agents/skills/<id>/SKILL.md` (spec fields only: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`) + `agents/openai.yaml` (`interface.display_name` = skill `name`, `short_description` = first sentence of `description`, `policy.allow_implicit_invocation: true` unless `metadata.blueprint.explicitOnly`) + resources | native           |
| Skill activation                                                                   | `activation.intents`, `filePatterns`, `directories`, `fileTypes` rendered as a "When to use" paragraph at the top of the SKILL.md body (Codex has no `paths:` field)                                                                                                                                                                                     | adapted          |
| Non-primary agents                                                                 | `.codex/agents/<id>.toml`: `name`, `description`, `developer_instructions` (= `body` + responsibilities + attached laws), `model` from `model.hint` when set, `sandbox_mode` from permissions; plus `.codex/config.toml` `[features] multi_agent = true` and `[agents.<id>] description`, `config_file`                                                  | native           |
| Workflows                                                                          | `.agents/skills/<id>/SKILL.md` orchestration skill; delegation phrasing: "spawn the `<agent>` agent"                                                                                                                                                                                                                                                     | adapted          |
| Hooks                                                                              | `.codex/hooks.json` (table below) + `[features] hooks = true`                                                                                                                                                                                                                                                                                            | native           |
| Gates                                                                              | `Stop` hook per executable criterion; otherwise instructions                                                                                                                                                                                                                                                                                             | native / adapted |
| Permissions                                                                        | `.codex/config.toml` `approval_policy`, `sandbox_mode`, `[sandbox_workspace_write]` (table below)                                                                                                                                                                                                                                                        | limited          |
| Rules with `paths`                                                                 | If every glob is `<dir>/**`: nested `AGENTS.md` in `<dir>` with the rule text. Otherwise inlined in the root `AGENTS.md` under "Rules" with an "Applies to: `<globs>`" line                                                                                                                                                                              | adapted          |
| Tools with `mcp`                                                                   | `[mcp_servers.<id>]` with `command`, `args`, `url`, `env` variable names via `bearer_token_env_var` or `env` keys with empty values and a README note                                                                                                                                                                                                    | native           |
| Memory                                                                             | `[features] memories = true`, `[memories] generate_memories = true, use_memories = true`; seed `body` in the `AGENTS.md` "Memory" section                                                                                                                                                                                                                | native           |
| References                                                                         | Attached to skills: beside the skill. Otherwise `.agents/references/<id>.md` referenced from `AGENTS.md`                                                                                                                                                                                                                                                 | adapted          |

### Hook trigger lowering

| Blueprint trigger   | Codex event                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `session-start`     | `SessionStart` (matcher `startup`)                                                                                            |
| `user-prompt`       | `UserPromptSubmit`                                                                                                            |
| `before-tool`       | `PreToolUse`                                                                                                                  |
| `after-tool`        | `PostToolUse`                                                                                                                 |
| `after-file-change` | `PostToolUse` with a generated guard that inspects the tool input for file paths (Codex has no matcher on tool names; verify) |
| `before-stop`       | `Stop`                                                                                                                        |
| `subagent-stop`     | `SubagentStop`                                                                                                                |

Action lowering: `command` / `run-tests` / `format` / `lint` / `secret-scan` → `{ "type": "command", "command": …, "timeout": … }`; `prompt-check` and `check-iron-laws` have no `prompt` handler type in Codex, so they lower to a `command` that prints the check text to stdout as `additionalContext` (adapted; reported as a `CompatibilityIssue`). Failure semantics are the same exit-code convention as Claude Code, so the command goes through the same failure wrapper (`docs/harness/claude-code.md`, P9-25): `block` / `return-to-agent` exit 2 with the output on stderr, `warn` exits 1, a gate's `allow` ignores the result and `request-approval` asks for the user first.

### Permission lowering

Codex permissions are global, so the adapter lowers the **primary agent's** permission set and reports when other agents differ.

| Situation                                   | `config.toml`                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `fs.write` = `deny`                         | `sandbox_mode = "read-only"`                                                                             |
| `fs.write` = `allow` or `ask`               | `sandbox_mode = "workspace-write"`                                                                       |
| `net.any` = `allow`                         | `[sandbox_workspace_write] network_access = true`                                                        |
| `net.any` = `deny` and `net.docs` = `allow` | `network_access = false` plus an `AGENTS.md` instruction listing allowed documentation domains (adapted) |
| every `shell.*` and `git.*` = `allow`       | `approval_policy = "never"`                                                                              |
| any `ask`                                   | `approval_policy = "on-request"`                                                                         |
| `shell.mutating` = `deny`                   | `approval_policy = "untrusted"`                                                                          |
| `git.push` / `git.force-push` = `deny`      | `AGENTS.md` instruction "Never run `git push`" (adapted; no native rule)                                 |
| `patterns[]`                                | `AGENTS.md` "Command policy" list (adapted)                                                              |

## Known limitations and open questions

- Per-command permission patterns cannot be enforced natively; they become instructions and a `CompatibilityIssue` with support `limited`.
- `project_doc_max_bytes` caps instructions; the adapter measures the composed `AGENTS.md` and spills sections into skills.
- `.codex/config.toml` is only read when the project is trusted; the README tells the user to trust the project.
- Hook and multi-agent features are behind `[features]` flags; the adapter sets them and the README explains.
- Whether `PostToolUse` exposes file paths for `after-file-change` guards needs verification against https://learn.chatgpt.com/docs/hooks.

## Sources

- https://learn.chatgpt.com/docs/agent-configuration/agents-md.md
- https://learn.chatgpt.com/docs/config-file/config-reference.md
- https://learn.chatgpt.com/docs/config-file/config-basic.md
- https://learn.chatgpt.com/docs/build-skills
- https://learn.chatgpt.com/docs/hooks
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://learn.chatgpt.com/docs/customization/memories.md
- https://agentskills.io/specification
