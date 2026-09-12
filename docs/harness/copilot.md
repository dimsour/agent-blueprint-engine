# Harness reference: GitHub Copilot

Verified against official docs on 2026-09-08. Covers the Copilot coding agent (cloud), Copilot
CLI and VS Code agent mode. The adapter is complete (roadmap P8-01): custom agents, path-scoped
instructions, prompt files, hooks and the editor's MCP configuration are all emitted. Where the
built mapping differs from the plan that was written here, the table below says what was built
and why; the reasoning is in `docs/04-compiler.md` under "Implementation notes (P8-01)".

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

| Concept                   | Support     | Explanation                                                                                    |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Skills                    | native      | `.github/skills/<id>/SKILL.md` (also reads `.claude/skills`, `.agents/skills`)                 |
| Agents / subagents        | native      | `.github/agents/*.agent.md`; `agents:` list for subagents in VS Code                           |
| Parallel agents           | limited     | Subagents exist, but no documented concurrency control                                         |
| Workflows / orchestration | adapted     | Orchestration skill plus a prompt file that invokes it                                         |
| Hooks                     | native      | `.github/hooks/*.json`                                                                         |
| Gates                     | adapted     | `agentStop` hook with `decision: block` for executable criteria; otherwise instructions        |
| Permissions               | limited     | Agent `tools` allowlist only; no allow / ask / deny rule syntax, so per-command rules are lost |
| Memory                    | unsupported | Instructions only                                                                              |
| Path-scoped rules         | native      | `.github/instructions/*.instructions.md` with `applyTo`                                        |
| Commands / prompts        | native      | `.github/prompts/*.prompt.md`                                                                  |
| Iron laws                 | adapted     | Section in `AGENTS.md` / `copilot-instructions.md`                                             |
| References                | native      | Files beside `SKILL.md`                                                                        |
| `AGENTS.md`               | native      |                                                                                                |

## How Agent Blueprint compiles to Copilot

Adapter `copilot`. **MVP (P2):** `AGENTS.md` via the shared emitter and `.github/skills/<id>/SKILL.md`
via `emitSkillDir`, plus a capability matrix and `CompatibilityIssue`s for everything else.
**Built (P8-01):**

| Blueprint                                                       | Output                                                                                                                                                                                                                    | Support     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Primary agent persona, iron laws, rules, roster, workflow index | `AGENTS.md` (shared) and a short `.github/copilot-instructions.md` pointing to it                                                                                                                                         | native      |
| Skills                                                          | `.github/skills/<id>/SKILL.md` + resources, references in `.github/references/`                                                                                                                                           | native      |
| Non-primary agents                                              | `.github/agents/<id>.agent.md`: `name`, `description`, `tools` (below), `model` from `model.hint` only, `agents` from `delegation.canDelegateTo`, `user-invocable: true`                                                  | native      |
| Workflows                                                       | `.github/skills/<id>/SKILL.md` (the orchestration body) plus `.github/prompts/<id>.prompt.md` (`agent: agent`) that makes it `/<id>`-invocable and points at the skill                                                    | adapted     |
| Rules with `paths`                                              | `.github/instructions/<id>.instructions.md` with `applyTo: <globs joined by ", ">`                                                                                                                                        | native      |
| Hooks, gates, hook-enforced laws                                | `.github/hooks/blueprint.json` (tables below)                                                                                                                                                                             | native      |
| Gates with commands                                             | `agentStop` handler printing `{ "decision": "block", "reason" }` when the command exits non-zero                                                                                                                          | adapted     |
| Permissions                                                     | `tools` allowlist per agent: an alias is dropped only when every operation behind it is denied. Per-command patterns cannot be expressed and stay the command policy in `AGENTS.md`, with a `limited` compatibility issue | limited     |
| Memory                                                          | Not supported; `CompatibilityIssue` with `unsupported` and the seed text kept in `AGENTS.md`                                                                                                                              | unsupported |
| Tools with `mcp`                                                | `.vscode/mcp.json` `servers` entry (names of env vars only); the cloud coding agent needs MCP configured in repository settings, which the adapter reports                                                                | limited     |

Not built, with the reason: **`handoffs[]`**, because it hangs off an agent file while the
Blueprint's delegate steps hang off a workflow, and the primary agent has no agent file at all;
`delegation.canDelegateTo` becomes the `agents` list instead. **Model tiers**, because Copilot
names a model explicitly and has no fast/balanced/strong equivalent, so a preference without a
`model.hint` is left to the user's model picker and reported.

### Hook trigger lowering

| Blueprint trigger    | Copilot event                                                                 |
| -------------------- | ----------------------------------------------------------------------------- |
| `session-start`      | `sessionStart`                                                                |
| `user-prompt`        | `userPromptSubmitted`                                                         |
| `before-tool`        | `preToolUse` (matcher from `conditions.toolKinds`)                            |
| `after-tool`         | `postToolUse` (matcher from `conditions.toolKinds`)                           |
| `after-file-change`  | `postToolUse` with matcher `edit\|write` (verify tool names against the docs) |
| `before-stop`        | `agentStop`                                                                   |
| `subagent-stop`      | `subagentStop`                                                                |
| `after-tool-failure` | `postToolUseFailure` (matcher from `conditions.toolKinds`)                    |
| `subagent-start`     | `subagentStart`                                                               |
| `before-compact`     | `preCompact`                                                                  |
| `after-compact`      | none — not emitted, reported as unsupported (P9-29)                           |

Actions lower to `{ "type": "command", "bash": …, "powershell": … }` (both variants generated
from `action.command`, PowerShell using the same command text; `timeoutSec` copied). A hook with
`action.script` also writes `.github/hooks/scripts/<id>.sh` and both variants run it as
`bash .github/hooks/scripts/<id>.sh` (P9-30), so bash has to be on the PATH on Windows. A
`before-stop` hook with `onFailure: block` gets the same refusal wrapper a gate does. Copilot does not document background hooks, so `action.async` runs in the foreground and is reported as limited.
`prompt-check` / `check-iron-laws` print a reminder instead: Copilot documents a `prompt`
handler type but not the field carrying the text, and a `preToolUse` handler fails closed on
a shape it cannot parse, so the shape is not guessed. `conditions.filePatterns` has no
equivalent — a matcher selects tools, not paths — and is reported.

### Permission lowering

Blanket decisions become the `tools` allowlist; there is no per-command syntax anywhere in
Copilot, so patterns are reported rather than lowered. An alias survives while any operation
behind it may run, which is why denying `git.push` alone does not remove `execute`.

| Operation                                     | Alias                                              |
| --------------------------------------------- | -------------------------------------------------- |
| `fs.read`                                     | `read`                                             |
| `fs.write`, `fs.delete`                       | `edit`                                             |
| `shell.readonly`, `shell.mutating`, `git.*`   | `execute`                                          |
| `net.docs`, `net.any`                         | `web`                                              |
| `delegation.canDelegateTo` (not an operation) | `agent`                                            |
| MCP tools                                     | `<server>/<operation>` for each declared operation |

## Known limitations and open questions

- No memory primitive.
- No per-command permissions: `ask` and `deny` patterns cannot be enforced. A `preToolUse` handler returning `permissionDecision` could do it, but only by parsing tool arguments in a script the compiler would be inventing, and one that fails closed. The patterns are written into the `AGENTS.md` command policy and reported as `limited`.
- The `prompt` handler's payload field is undocumented in the sources below; revisit the reminder workaround when it is confirmed.
- An MCP server whose operations the Blueprint does not name cannot be put in a `tools` allowlist, because an entry is `server/tool`. The adapter reports this rather than guessing a wildcard.
- The coding agent reads only `.github/hooks/*.json`; VS Code custom-agent hooks are preview.
- MCP for the cloud coding agent is configured in repository settings, not in files. `.vscode/mcp.json` serves the editor; `sse` is written as `http`, the transport that replaced it.

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
