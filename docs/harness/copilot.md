# Harness reference: GitHub Copilot

Verified against official docs on 2026-09-08. Covers the Copilot coding agent (cloud), Copilot
CLI and VS Code agent mode. **MVP scope (roadmap P2): the adapter emits `AGENTS.md` and skills
only.** The full native mapping (custom agents, path-scoped instructions, hooks, prompt files) is
specified here and scheduled for roadmap P8.

## File layout

| Path                                                                                             | Purpose                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/copilot-instructions.md`                                                                | Repository-wide instructions                                                                                                                                            |
| `.github/instructions/*.instructions.md`                                                         | Path-scoped instructions; frontmatter `applyTo` (glob, comma-separated for several, `**` = all), `name`, `description`, `excludeAgent` (`code-review` \| `cloud-agent`) |
| `AGENTS.md` (root and nested, nearest wins), `CLAUDE.md` / `GEMINI.md` (root only)               | Agent instructions. VS Code settings `chat.useAgentsMdFile`, `chat.useNestedAgentsMdFiles`, `chat.useClaudeMdFile`                                                      |
| `.github/agents/*.agent.md`                                                                      | Custom agents (repo; org via `.github` / `.github-private` repo; enterprise `agents/`). Body ≤ 30 000 chars                                                             |
| `.github/prompts/*.prompt.md`                                                                    | Prompt files, invoked as `/name`                                                                                                                                        |
| `.github/hooks/*.json`, `~/.copilot/hooks/`, inline in `.github/copilot/settings.json`           | Hooks (CLI and cloud agent; the cloud agent reads only `.github/hooks/*.json`)                                                                                          |
| `.github/skills/`, `.claude/skills/`, `.agents/skills/`; `~/.copilot/skills`, `~/.agents/skills` | Agent Skills (open spec)                                                                                                                                                |
| `.vscode/mcp.json`                                                                               | MCP servers for VS Code: `servers{ type: stdio \| http, command, args, env, url, headers }`                                                                             |
| Repo Settings > Copilot > MCP                                                                    | MCP for the coding agent: `mcpServers{ type: local \| stdio \| http \| sse, tools[], command, args, env / headers with $COPILOT_MCP_* secrets }`                        |

## Custom agent frontmatter (`.github/agents/<name>.agent.md`)

| Field                                        | Type / values                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`                                       | string                                                                                                  |
| `description`                                | string, required                                                                                        |
| `target`                                     | `vscode` \| `github-copilot`                                                                            |
| `tools`                                      | list or string; aliases `execute`, `read`, `edit`, `search`, `agent`, `web`, `todo`; `server/tool`; `*` |
| `model`                                      | string or list                                                                                          |
| `agents`                                     | list of subagents (needs the `agent` tool)                                                              |
| `handoffs[]`                                 | `{ label, agent, prompt, send, model }`                                                                 |
| `hooks`                                      | object (VS Code preview, `chat.useCustomAgentHooks`)                                                    |
| `user-invocable`, `disable-model-invocation` | boolean                                                                                                 |
| `infer`                                      | retired                                                                                                 |
| `argument-hint`                              | string                                                                                                  |
| `mcp-servers`                                | github-copilot target only                                                                              |
| `metadata`                                   | map                                                                                                     |

## Prompt file frontmatter (`.github/prompts/<name>.prompt.md`)

`name`, `description`, `agent` (`ask` \| `agent` \| `plan` \| custom), `model`, `tools`,
`argument-hint`. Body variables: `${input:x}`, `${input:x:placeholder}`, `${selection}`, `#tool:name`.

## Hooks schema

```json
{
  "version": 1,
  "disableAllHooks": false,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "./scripts/check.sh",
        "powershell": "./scripts/check.ps1",
        "cwd": ".",
        "env": {},
        "timeoutSec": 60,
        "matcher": "edit|write"
      }
    ]
  }
}
```

Handler `type`: `command` \| `http` \| `prompt`. Fields: `bash`, `powershell`, `command`, `cwd`,
`env`, `timeoutSec`, `matcher` (regex).

Events: `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `userPromptTransformed`, `preToolUse`,
`postToolUse`, `postToolUseFailure`, `agentStop`, `subagentStart`, `subagentStop`, `errorOccurred`,
`preCompact`; CLI-only `notification`, `permissionRequest`. Claude-style PascalCase aliases are accepted.

Output: `preToolUse` → `{ permissionDecision: allow | deny | ask, permissionDecisionReason, modifiedArgs }`;
`postToolUse` → `{ modifiedResult, additionalContext }`; `agentStop` → `{ decision: block | allow, reason, modifiedResponse }`.
`preToolUse` fails closed on non-zero exit; exit 2 = deny.

## Support matrix

| Concept                   | Support     | Explanation                                                                             |
| ------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| Skills                    | native      | `.github/skills/<id>/SKILL.md` (also reads `.claude/skills`, `.agents/skills`)          |
| Agents / subagents        | native      | `.github/agents/*.agent.md`; `agents:` list for subagents in VS Code                    |
| Parallel agents           | limited     | Subagents exist, but no documented concurrency control                                  |
| Workflows / orchestration | adapted     | `handoffs`, prompt files, orchestration skill                                           |
| Hooks                     | native      | `.github/hooks/*.json`                                                                  |
| Gates                     | adapted     | `agentStop` hook with `decision: block` for executable criteria; otherwise instructions |
| Permissions               | adapted     | Agent `tools` allowlist plus `preToolUse` deny hooks; no allow / ask / deny rule syntax |
| Memory                    | unsupported | Instructions only                                                                       |
| Path-scoped rules         | native      | `.github/instructions/*.instructions.md` with `applyTo`                                 |
| Commands / prompts        | native      | `.github/prompts/*.prompt.md`                                                           |
| Iron laws                 | adapted     | Section in `AGENTS.md` / `copilot-instructions.md`                                      |
| References                | native      | Files beside `SKILL.md`                                                                 |
| `AGENTS.md`               | native      |                                                                                         |

## How Agent Blueprint compiles to Copilot

Adapter `copilot`. **MVP (P2):** `AGENTS.md` via the shared emitter and `.github/skills/<id>/SKILL.md`
via `emitSkillDir`, plus a capability matrix and `CompatibilityIssue`s for everything else.
**Full mapping (P8):**

| Blueprint                                                       | Output                                                                                                                                                                                                                                                                                        | Support     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Primary agent persona, iron laws, rules, roster, workflow index | `AGENTS.md` (shared) and a short `.github/copilot-instructions.md` pointing to it                                                                                                                                                                                                             | native      |
| Skills                                                          | `.github/skills/<id>/SKILL.md` + resources                                                                                                                                                                                                                                                    | native      |
| Non-primary agents                                              | `.github/agents/<id>.agent.md`: `name`, `description`, `tools` (from `toolIds` → aliases: filesystem → `read`, `edit`; shell → `execute`; search/browser → `web`, `search`; mcp → `server/tool`), `model` from `model.hint`, `agents` from `delegation.canDelegateTo`, `user-invocable: true` | native      |
| Workflows                                                       | `.github/prompts/<id>.prompt.md` (`agent: <primary agent id>`) whose body is the orchestration text, plus the orchestration skill for other clients; `delegate` nodes → `handoffs[]` entries on the primary agent file                                                                        | adapted     |
| Rules with `paths`                                              | `.github/instructions/<id>.instructions.md` with `applyTo: <globs joined by ", ">`                                                                                                                                                                                                            | native      |
| Hooks                                                           | `.github/hooks/blueprint.json` (table below)                                                                                                                                                                                                                                                  | native      |
| Gates with commands                                             | `agentStop` hook returning `{ decision: "block", reason }` on failure                                                                                                                                                                                                                         | adapted     |
| Permissions                                                     | `tools` allowlist on each agent file (deny → tool omitted) and `preToolUse` hooks returning `permissionDecision` for `ask` / `deny` patterns                                                                                                                                                  | adapted     |
| Memory                                                          | Not supported; `CompatibilityIssue` with `unsupported` and the seed text kept in `AGENTS.md`                                                                                                                                                                                                  | unsupported |
| Tools with `mcp`                                                | `.vscode/mcp.json` `servers` entry; coding-agent MCP must be configured in repo settings (README note)                                                                                                                                                                                        | limited     |

### Hook trigger lowering

| Blueprint trigger   | Copilot event                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| `session-start`     | `sessionStart`                                                                |
| `user-prompt`       | `userPromptSubmitted`                                                         |
| `before-tool`       | `preToolUse` (matcher from `conditions.toolKinds`)                            |
| `after-tool`        | `postToolUse`                                                                 |
| `after-file-change` | `postToolUse` with matcher `edit\|write` (verify tool names against the docs) |
| `before-stop`       | `agentStop`                                                                   |
| `subagent-stop`     | `subagentStop`                                                                |

Actions lower to `{ "type": "command", "bash": …, "powershell": … }` (both variants generated from `action.command`, PowerShell using the same command text; `timeoutSec` copied). `prompt-check` / `check-iron-laws` → `{ "type": "prompt" }` where supported (verify), otherwise instructions.

### Permission lowering

| Operation                           | Copilot                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `fs.read`                           | `read` tool alias                                                        |
| `fs.write`                          | `edit` tool alias                                                        |
| `fs.delete`                         | `execute` + `preToolUse` deny for `rm` when `deny`                       |
| `shell.readonly` / `shell.mutating` | `execute`; `ask` / `deny` patterns via `preToolUse` `permissionDecision` |
| `git.*`                             | `execute` + `preToolUse` matcher on `git push`, `git push --force`       |
| `net.docs` / `net.any`              | `web` alias; domain restrictions only via `preToolUse`                   |
| `mcp`                               | `server/tool` entries                                                    |

## Known limitations and open questions

- No memory primitive.
- Permissions are allowlists per agent plus hook-based denial; there is no `ask` at the rule level, so `ask` lowers to `permissionDecision: "ask"` from a `preToolUse` hook (verify the CLI honours it in cloud runs).
- The coding agent reads only `.github/hooks/*.json`; VS Code custom-agent hooks are preview.
- MCP for the cloud coding agent is configured in repository settings, not in files.

## Sources

- https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
- https://docs.github.com/en/copilot/reference/custom-agents-configuration
- https://docs.github.com/en/copilot/reference/hooks-configuration
- https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp
- https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- https://code.visualstudio.com/docs/copilot/customization/prompt-files
- https://code.visualstudio.com/docs/copilot/customization/custom-agents
- https://code.visualstudio.com/docs/copilot/customization/mcp-servers
