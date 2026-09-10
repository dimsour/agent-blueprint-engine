# Harness reference: Pi

Verified against the project docs on 2026-09-08; `settings.json`, prompt templates and the
system-prompt files re-verified on 2026-09-10 against `earendil-works/pi` while building the
adapter. Pi is a minimal coding agent with skills, prompt templates, settings and a TypeScript
extension API. It deliberately has **no sub-agents**. The adapter is complete (roadmap P8-03)
apart from hooks: prompts, `.pi/settings.json` and `.pi/APPEND_SYSTEM.md` are emitted. Hooks and
gates need a TypeScript extension, which is code rather than configuration, recorded as P8-11.
Where the built mapping differs from the plan written here, the table below says what was built;
the reasoning is in `docs/04-compiler.md` under "Implementation notes (P8-03)".

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

| Concept                   | Support     | Explanation                                                                |
| ------------------------- | ----------- | -------------------------------------------------------------------------- |
| Skills                    | native      | `.pi/skills`, `.agents/skills`                                             |
| Agents / subagents        | unsupported | "No sub-agents" by design; adaptable via an extension or tmux              |
| Parallel agents           | unsupported | Same                                                                       |
| Workflows / orchestration | adapted     | Prompt template plus orchestration skill, single agent                     |
| Hooks                     | adapted     | Extensions are TypeScript; not generated (roadmap P8-11)                   |
| Gates                     | adapted     | `agent_end` / `tool_call` handlers in an extension; otherwise instructions |
| Permissions               | limited     | `defaultTools` allowlist only; no `ask`, no per-command rules, no network  |
| Memory                    | unsupported | Context files only                                                         |
| Path-scoped rules         | adapted     | Nested `AGENTS.md`                                                         |
| Commands / prompts        | native      | `.pi/prompts`                                                              |
| Iron laws                 | adapted     | Section in `AGENTS.md`; `APPEND_SYSTEM.md` for critical ones               |
| References                | native      | Files beside `SKILL.md`                                                    |
| `AGENTS.md`               | native      |                                                                            |

## How Agent Blueprint compiles to Pi

Adapter `pi`. **Built (P8-03):**

| Blueprint                                            | Output                                                                                                                                                                        | Support          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Primary persona, laws, rules, roster, workflow index | `AGENTS.md` (shared); iron laws with `severity: critical` additionally in `.pi/APPEND_SYSTEM.md`                                                                              | native / adapted |
| Skills                                               | `.agents/skills/<id>/SKILL.md` + resources (shared with Codex and OpenCode)                                                                                                   | native           |
| Non-primary agents                                   | Not representable. Each becomes `.pi/prompts/<id>.md`, a template that puts the one session into that persona and takes the task as `$ARGUMENTS`, plus an `unsupported` issue | unsupported      |
| Workflows                                            | `.pi/prompts/<id>.md` whose body points at the orchestration skill                                                                                                            | adapted          |
| Permissions                                          | `.pi/settings.json` `defaultTools` from the primary agent's permissions (table below)                                                                                         | limited          |
| Rules whose globs are plain directories              | nested `AGENTS.md`, byte-identical to the one Codex and OpenCode emit, so the file is shared                                                                                  | adapted          |
| Rules with other globs                               | inlined in `AGENTS.md` with an "Applies to" line, and reported                                                                                                                | adapted          |
| Hooks, gates                                         | not emitted; they need an extension, which is code (P8-11). Described in `AGENTS.md` and the workflow skills                                                                  | adapted          |
| Memory                                               | unsupported; seed text in `AGENTS.md`                                                                                                                                         | unsupported      |

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

`defaultTools` filters the built-in tools a session starts with. Pi has no `ask`, so a tool is
enabled unless every operation behind it is denied, and the approval is reported as lost.

| Operation                       | Pi                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `fs.read`                       | `read`, `grep`, `find`, `ls`                                                        |
| `fs.write`                      | `edit`, `write`                                                                     |
| `fs.delete`, `shell.*`, `git.*` | `bash` and `powershell` together — the same capability on two platforms             |
| `net.docs`, `net.any`           | not representable: Pi has no built-in network tool. A grant is reported             |
| `mcp`                           | not applicable                                                                      |
| Any `ask` decision              | not representable; the tool stays enabled and the approval becomes a written policy |
| Any pattern                     | not representable; `defaultTools` names tools, not commands                         |

## Known limitations and open questions

- No subagents and no memory; multi-agent Blueprints compile with `unsupported` issues and persona-switch prompts.
- `ask` permissions have no equivalent, and neither do per-command patterns.
- No built-in network tool, so `net.docs` and `net.any` cannot be granted.
- Extension API details (event payloads) should be re-verified against the current `docs/extensions.md` before implementing P8-11. The lowering table above the permission section is the plan, not something that has been run.

## Sources

- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/settings.md
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md
- https://agentskills.io/specification
