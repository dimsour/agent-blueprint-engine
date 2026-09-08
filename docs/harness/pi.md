# Harness reference: Pi

Verified against the project docs on 2026-09-08 (`github.com/badlogic/pi-mono`, which now
redirects to `earendil-works/pi`). Pi is a minimal coding agent with skills, prompt templates,
settings and a TypeScript extension API. It deliberately has **no sub-agents**. **MVP scope
(roadmap P2): the adapter emits `AGENTS.md` and skills only.** The full mapping (prompts,
extensions) is specified here and scheduled for roadmap P8.

## File layout

| Path                                                                                                         | Purpose                                                    |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `AGENTS.md` / `CLAUDE.md` in `~/.pi/agent/`, ancestors, cwd; `AGENTS.override.md` replaces per directory     | Context files, concatenated. `--no-context-files` disables |
| `.pi/SYSTEM.md`, `~/.pi/agent/SYSTEM.md`; `APPEND_SYSTEM.md`                                                 | Replace or append the system prompt                        |
| `.pi/settings.json`, `~/.pi/agent/settings.json`                                                             | Settings (nested merge)                                    |
| `.pi/extensions/*.ts` or `*/index.ts`, `~/.pi/agent/extensions/`                                             | Extensions                                                 |
| `.pi/skills/`, `.agents/skills/` (ancestors), `~/.pi/agent/skills/`, `~/.agents/skills/`                     | Skills (Agent Skills standard; `/skill:name`)              |
| `.pi/prompts/*.md`, `~/.pi/agent/prompts/`                                                                   | Prompt templates (`/name`)                                 |
| `.pi/themes/`, `~/.pi/agent/themes/`; `~/.pi/agent/trust.json`, `keybindings.json`                           | Themes, project trust, keys                                |
| `package.json` `"pi": { "extensions": [], "skills": [], "prompts": [], "themes": [] }`, keyword `pi-package` | Installable packages (`pi install npm:…` / `git:…`)        |

## settings.json

| Key                                                                | Type / values                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `defaultProvider`, `defaultModel`                                  | string                                                                            |
| `defaultThinkingLevel`                                             | `off` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max`             |
| `modelThinkingLevels`                                              | map                                                                               |
| `theme`                                                            | string                                                                            |
| `steeringMode`, `followUpMode`                                     | `one-at-a-time` \| `all`                                                          |
| `compaction`                                                       | `{ enabled, reserveTokens, keepRecentTokens }`                                    |
| `retry`                                                            | `{ enabled, maxRetries }`                                                         |
| `packages[]`, `extensions[]`, `skills[]`, `prompts[]`, `themes[]`  | lists                                                                             |
| `enableSkillCommands`                                              | boolean                                                                           |
| `defaultTools[]`                                                   | `read` \| `bash` \| `powershell` \| `edit` \| `write` \| `grep` \| `find` \| `ls` |
| `defaultProjectTrust`                                              | `ask` \| `always` \| `never` (global only)                                        |
| `transport`, `externalEditor`, `hideThinkingBlock`, `quietStartup` | misc                                                                              |

## SKILL.md frontmatter

`name` (required, ≤ 64), `description` (required, ≤ 1024), `license`, `compatibility`, `metadata`,
`allowed-tools`, `disable-model-invocation` (bool; hides from the system prompt).

## Prompt template frontmatter (`.pi/prompts/<name>.md`)

`description`, `argument-hint`. Body: `$1`, `$@` / `$ARGUMENTS`, `${1:-default}`, `${@:N}`.

## Extension API

```ts
export default function (pi: ExtensionAPI) {
  pi.on('tool_call', async (event) => ({ block: false, reason: '', terminate: false }))
}
```

Events: `project_trust`, `session_start`, `session_shutdown`, `resources_discover`,
`session_before_switch | fork | compact`, `session_compact`, `before_agent_start` (returns
`{ message?, systemPrompt? }`), `agent_start`, `agent_end`, `agent_settled`, `input`
(`{ action: continue | transform | handled }`), `turn_start`, `turn_end`,
`message_start | update | end`, `tool_call` (`{ block, reason, terminate }`), `tool_result`
(patch), `tool_execution_start | update | end`, `context` (`{ messages }`),
`before_provider_request`, `after_provider_response`, `model_select`, `thinking_level_select`,
`user_bash`.

Registration: `registerTool`, `registerCommand`, `registerShortcut`, `registerFlag`,
`registerMessageRenderer`, `registerProvider`, `sendMessage`, `sendUserMessage`, `exec`,
`setModel`, `setActiveTools`, `ctx.ui.*`.

## Support matrix

| Concept                   | Support       | Explanation                                                                |
| ------------------------- | ------------- | -------------------------------------------------------------------------- |
| Skills                    | native        | `.pi/skills`, `.agents/skills`                                             |
| Agents / subagents        | unsupported   | "No sub-agents" by design; adaptable via an extension or tmux              |
| Parallel agents           | unsupported   | Same                                                                       |
| Workflows / orchestration | adapted       | Prompt template plus orchestration skill, single agent                     |
| Hooks                     | native (code) | Extensions                                                                 |
| Gates                     | adapted       | `agent_end` / `tool_call` handlers in an extension; otherwise instructions |
| Permissions               | adapted       | `defaultTools` allowlist; `tool_call` block in an extension                |
| Memory                    | unsupported   | Context files only                                                         |
| Path-scoped rules         | adapted       | Nested `AGENTS.md`                                                         |
| Commands / prompts        | native        | `.pi/prompts`                                                              |
| Iron laws                 | adapted       | Section in `AGENTS.md`; `APPEND_SYSTEM.md` for critical ones               |
| References                | native        | Files beside `SKILL.md`                                                    |
| `AGENTS.md`               | native        |                                                                            |

## How Agent Blueprint compiles to Pi

Adapter `pi`. **MVP (P2):** `AGENTS.md` (shared emitter) and `.agents/skills/<id>/SKILL.md`
(shared location with Codex and OpenCode). **Full mapping (P8):**

| Blueprint                                            | Output                                                                                                                                                                                                              | Support          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Primary persona, laws, rules, roster, workflow index | `AGENTS.md`; iron laws with `severity: critical` additionally in `.pi/APPEND_SYSTEM.md`                                                                                                                             | native / adapted |
| Skills                                               | `.agents/skills/<id>/SKILL.md` + resources (`disable-model-invocation` when `metadata.blueprint.explicitOnly`)                                                                                                      | native           |
| Non-primary agents                                   | Not representable. Each becomes a prompt template `.pi/prompts/<id>.md` that switches the persona for the current session ("Act as …") and a `CompatibilityIssue` with `unsupported` for delegation and parallelism | unsupported      |
| Workflows                                            | `.pi/prompts/<id>.md` (`description`, `argument-hint`) whose body is the orchestration text with delegate nodes rewritten as "adopt the `<agent>` persona for this step"                                            | adapted          |
| Hooks                                                | `.pi/extensions/blueprint-hooks.ts` (table below)                                                                                                                                                                   | native (code)    |
| Gates with commands                                  | `agent_end` handler running the command with `pi.exec`, sending a user message on failure                                                                                                                           | adapted          |
| Permissions                                          | `.pi/settings.json` `defaultTools` from the primary agent's permissions, plus `tool_call` blocks in the extension for `deny` patterns                                                                               | adapted          |
| Memory                                               | unsupported; seed text in `AGENTS.md`                                                                                                                                                                               | unsupported      |
| Rules with `paths`                                   | Nested `AGENTS.md` for plain directories; otherwise inlined                                                                                                                                                         | adapted          |

### Hook trigger lowering

| Blueprint trigger   | Pi extension event                               |
| ------------------- | ------------------------------------------------ |
| `session-start`     | `session_start`                                  |
| `user-prompt`       | `input`                                          |
| `before-tool`       | `tool_call` (return `{ block, reason }`)         |
| `after-tool`        | `tool_result`                                    |
| `after-file-change` | `tool_result` filtered to `edit` / `write` tools |
| `before-stop`       | `agent_end`                                      |
| `subagent-stop`     | unsupported                                      |

Actions run via `pi.exec`; `onFailure: block` returns `{ block: true, reason }` for `tool_call`, or `sendUserMessage` with the output for other events. `prompt-check` / `check-iron-laws` inject text through `before_agent_start` `{ systemPrompt }` (adapted).

### Permission lowering

| Operation          | Pi                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `fs.read`          | `read`, `grep`, `find`, `ls` in `defaultTools`                                                                          |
| `fs.write`         | `edit`, `write`                                                                                                         |
| `fs.delete`        | `bash` + `tool_call` block on `rm`                                                                                      |
| `shell.*`, `git.*` | `bash` / `powershell` + `tool_call` blocks for `deny` patterns; `ask` is not representable and lowers to an instruction |
| `net.*`            | Not representable (no network tool by default)                                                                          |
| `mcp`              | Not applicable                                                                                                          |

## Known limitations and open questions

- No subagents and no memory; multi-agent Blueprints compile with `unsupported` issues and persona-switch prompts.
- `ask` permissions have no equivalent.
- Extension API details (event payloads) should be re-verified against the current `docs/extensions.md` before implementing P8.

## Sources

- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/settings.md
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md
- https://agentskills.io/specification
