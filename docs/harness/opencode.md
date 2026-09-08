# Harness reference: OpenCode

Verified against official docs on 2026-09-08. **MVP scope (roadmap P2): the adapter emits
`AGENTS.md` and skills only.** The full native mapping (`opencode.json` agents, permissions,
commands, plugin hooks) is specified here and scheduled for roadmap P8.

Note: current docs use plural directories (`.opencode/agents/`, `commands/`, `skills/`,
`plugins/`); older third-party posts use singular forms.

## File layout

| Path                                                                                                                                           | Purpose                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `AGENTS.md` (walk up from cwd), fallback `CLAUDE.md`; `~/.config/opencode/AGENTS.md`, fallback `~/.claude/CLAUDE.md`                           | Rules. `opencode.json` `"instructions": ["docs/*.md", "https://…"]` adds more |
| `opencode.json` / `opencode.jsonc` (root), `~/.config/opencode/opencode.json`, `OPENCODE_CONFIG`; `$schema: https://opencode.ai/config.json`   | Config, merged (later overrides). Vars `{env:X}`, `{file:path}`               |
| `.opencode/agents/<name>.md`, `~/.config/opencode/agents/`                                                                                     | Agents (filename = id)                                                        |
| `.opencode/commands/<name>.md`, `~/.config/opencode/commands/`                                                                                 | Commands                                                                      |
| `.opencode/skills/<n>/SKILL.md`, `~/.config/opencode/skills/`, plus `.claude/skills`, `~/.claude/skills`, `.agents/skills`, `~/.agents/skills` | Skills (Agent Skills spec; loaded through the `skill` tool)                   |
| `.opencode/plugins/*.ts \| js`, `~/.config/opencode/plugins/`, npm via `"plugin": []`                                                          | Plugins (hooks are code)                                                      |

## `opencode.json` keys

`model`, `small_model`, `agent`, `default_agent`, `subagent_depth`, `command`, `permission`,
`instructions`, `mcp`, `plugin`, `tools`, `provider`, `formatter`, `lsp`, `compaction`, `share`,
`autoupdate`, `keybinds`, `theme`, `server`, `experimental`.

## Agent fields (JSON under `agent.<id>` or Markdown frontmatter)

| Field                  | Type / values                      |
| ---------------------- | ---------------------------------- |
| `description`          | string, required                   |
| `mode`                 | `primary` \| `subagent` \| `all`   |
| `model`                | `provider/id`                      |
| `prompt`               | string or `{file:…}`               |
| `temperature`, `top_p` | number                             |
| `steps`                | integer (`maxSteps` deprecated)    |
| `disable`, `hidden`    | boolean                            |
| `color`                | string                             |
| `permission`           | object (see below)                 |
| `tools`                | object (deprecated)                |
| provider passthrough   | `reasoningEffort`, `textVerbosity` |

Built-ins: `build`, `plan`, `general`, `explore`, `scout`. Invoke with `@name` or the Task tool.

## Command fields (`.opencode/commands/<name>.md`)

`template` (required in JSON; the body in Markdown), `description`, `agent`, `model`, `subtask`
(bool). Body supports `$ARGUMENTS`, `$1..$n`, `` !`cmd` ``, `@file`.

## Permissions

Keys: `read`, `edit`, `glob`, `grep`, `list`, `bash`, `task`, `skill`, `lsp`, `question`,
`webfetch`, `websearch`, `external_directory`, `doom_loop`, `todowrite`. Values: `allow` \| `ask`
\| `deny`, or a pattern object `{ "git *": "allow", "*": "ask" }` (last match wins). Per-agent
override under `agent.<name>.permission`.

## Plugin hooks (`.opencode/plugins/*.ts`)

```ts
export const BlueprintHooks = async ({ project, client, $, directory, worktree }) => ({
  'tool.execute.before': async (input, output) => {
    /* throw to block */
  },
  'tool.execute.after': async (input, output) => {},
  'chat.message': async () => {},
  'chat.params': async () => {},
  'permission.ask': async () => {},
  'shell.env': async () => {},
  'experimental.session.compacting': async () => {},
  event: async ({ event }) => {
    /* session.created/idle/compacted/error, file.edited, permission.asked/replied, message.updated, todo.updated, tui.*, lsp.*, command.executed */
  },
  tool: {/* name: tool({ description, args, execute }) */},
})
```

## Support matrix

| Concept                   | Support       | Explanation                                                                          |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| Skills                    | native        | `.opencode/skills/` and `.agents/skills/`                                            |
| Agents / subagents        | native        | `mode: subagent`                                                                     |
| Parallel agents           | limited       | Task tool; `subagent_depth`; no explicit parallel control documented                 |
| Workflows / orchestration | adapted       | Commands with `subtask` plus the orchestration skill                                 |
| Hooks                     | native (code) | TypeScript plugins, not JSON                                                         |
| Gates                     | adapted       | `tool.execute.before` throw, or `session.idle` event handler; otherwise instructions |
| Permissions               | native        | `permission` allow / ask / deny with patterns, per agent                             |
| Memory                    | unsupported   | `AGENTS.md` only                                                                     |
| Path-scoped rules         | adapted       | Nested `AGENTS.md` or `instructions` globs                                           |
| Commands / prompts        | native        | `.opencode/commands/`                                                                |
| Iron laws                 | adapted       | Section in `AGENTS.md`                                                               |
| References                | native        | Files beside `SKILL.md`; `instructions` globs                                        |
| `AGENTS.md`               | native        |                                                                                      |

## How Agent Blueprint compiles to OpenCode

Adapter `opencode`. **MVP (P2):** `AGENTS.md` (shared emitter) and `.agents/skills/<id>/SKILL.md`
(shared with Codex and Pi, emitted once). **Full mapping (P8):**

| Blueprint                                            | Output                                                                                                                                                                                                                     | Support       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Primary persona, laws, rules, roster, workflow index | `AGENTS.md`                                                                                                                                                                                                                | native        |
| Skills                                               | `.agents/skills/<id>/SKILL.md` + resources                                                                                                                                                                                 | native        |
| Agents                                               | `.opencode/agents/<id>.md`: `description`, `mode` (`primary` for the primary agent, `subagent` otherwise), `model` from `model.hint` (`provider/id` format), `permission` from the agent's permissions, body = persona     | native        |
| `opencode.json`                                      | `default_agent: <primary id>`, `agent.<id>` entries mirroring the files when needed, `permission` (global, from primary agent), `instructions: ["blueprint/references/*.md"]` for agent-level references, `mcp` from tools | native        |
| Workflows                                            | `.opencode/commands/<id>.md` with `agent: <primary>`, `subtask: false`, body = orchestration text; plus the orchestration skill                                                                                            | adapted       |
| Hooks                                                | `.opencode/plugins/blueprint-hooks.ts` generated from the hook list (table below)                                                                                                                                          | native (code) |
| Gates with commands                                  | `event` handler on `session.idle` running the command and posting a message via `client`; otherwise instructions                                                                                                           | adapted       |
| Permissions                                          | `permission` object (table below)                                                                                                                                                                                          | native        |
| Rules with `paths`                                   | `instructions` entries pointing at `.opencode/rules/<id>.md`, with an "Applies to" line, or nested `AGENTS.md` for plain directories                                                                                       | adapted       |
| Memory                                               | unsupported; seed in `AGENTS.md`                                                                                                                                                                                           | unsupported   |

### Hook trigger lowering

| Blueprint trigger   | OpenCode plugin hook                                  |
| ------------------- | ----------------------------------------------------- |
| `session-start`     | `event` where `event.type === 'session.created'`      |
| `user-prompt`       | `chat.message`                                        |
| `before-tool`       | `tool.execute.before` (filter on `input.tool`)        |
| `after-tool`        | `tool.execute.after`                                  |
| `after-file-change` | `event` where `event.type === 'file.edited'`          |
| `before-stop`       | `event` where `event.type === 'session.idle'`         |
| `subagent-stop`     | `event` on `session.idle` for child sessions (verify) |

Actions: `command`-like actions run through `$` (the plugin's shell); `onFailure: block` throws inside `tool.execute.before`, elsewhere it posts a message through `client`. `prompt-check` / `check-iron-laws` inject text via `chat.params` or a message (adapted).

### Permission lowering

| Operation                                                 | `permission` key                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `fs.read`                                                 | `read`, `glob`, `grep`, `list`                                                          |
| `fs.write`                                                | `edit`                                                                                  |
| `fs.delete`                                               | `bash: { "rm *": … }`                                                                   |
| `shell.readonly`                                          | `bash` pattern object with a curated read-only list                                     |
| `shell.mutating`                                          | `bash: { "*": … }`                                                                      |
| `git.read` / `git.commit` / `git.push` / `git.force-push` | `bash: { "git log *": …, "git commit *": …, "git push *": …, "git push --force *": … }` |
| `net.docs` / `net.any`                                    | `webfetch`, `websearch`                                                                 |
| `mcp`                                                     | tool-level entries (verify key names)                                                   |

Pattern semantics match the harness: last match wins, so the adapter emits the broad `"*"` entry first and specific patterns after it.

## Known limitations and open questions

- Hooks are TypeScript code; generated plugins must be deterministic and dependency-free.
- No memory primitive.
- Parallelism is not explicitly configurable.
- Exact permission keys for MCP tools need verification.

## Sources

- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/commands/
- https://opencode.ai/docs/rules/
- https://opencode.ai/docs/skills/
- https://opencode.ai/docs/plugins/
- https://opencode.ai/docs/permissions/
- https://opencode.ai/docs/config/
