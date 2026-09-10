# Harness reference: OpenCode

Verified against official docs on 2026-09-08; the permission, agent, command and MCP shapes
re-verified on 2026-09-10 while building the adapter. The adapter is complete (roadmap P8-02)
apart from hooks: `opencode.json`, subagent files and commands are emitted. Hooks and gates
need a TypeScript plugin, which is code rather than configuration and is recorded as P8-10.
Where the built mapping differs from the plan written here, the table below says what was built;
the reasoning is in `docs/04-compiler.md` under "Implementation notes (P8-02)".

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

| Concept                   | Support     | Explanation                                                                          |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| Skills                    | native      | `.opencode/skills/` and `.agents/skills/`                                            |
| Agents / subagents        | native      | `mode: subagent`                                                                     |
| Parallel agents           | limited     | Task tool; `subagent_depth`; no explicit parallel control documented                 |
| Workflows / orchestration | adapted     | A command in `.opencode/commands/` plus the orchestration skill                      |
| Hooks                     | adapted     | TypeScript plugins, not JSON; not generated (roadmap P8-10)                          |
| Gates                     | adapted     | `tool.execute.before` throw, or `session.idle` event handler; otherwise instructions |
| Permissions               | native      | `permission` allow / ask / deny with patterns, per agent                             |
| Memory                    | unsupported | `AGENTS.md` only                                                                     |
| Path-scoped rules         | adapted     | Nested `AGENTS.md` or `instructions` globs                                           |
| Commands / prompts        | native      | `.opencode/commands/`                                                                |
| Iron laws                 | adapted     | Section in `AGENTS.md`                                                               |
| References                | native      | Files beside `SKILL.md`; `instructions` globs                                        |
| `AGENTS.md`               | native      |                                                                                      |

## How Agent Blueprint compiles to OpenCode

Adapter `opencode`. **Built (P8-02):**

| Blueprint                                            | Output                                                                                                                                                                          | Support     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Primary persona, laws, rules, roster, workflow index | `AGENTS.md` (shared). The primary agent gets no agent file: its permissions are the global `permission` block                                                                   | native      |
| Skills                                               | `.agents/skills/<id>/SKILL.md` + resources (shared with Codex and Pi, emitted once)                                                                                             | native      |
| Non-primary agents                                   | `.opencode/agents/<id>.md`: `description`, `mode: subagent`, `model` from `model.hint` only when it is `provider/id`, `permission` from the agent's permissions, body = persona | native      |
| `opencode.json`                                      | `$schema`, `permission` (global, from the primary agent), `instructions: [".agents/references/*.md"]` when there are loose references, `mcp` from tools                         | native      |
| Workflows                                            | `.opencode/commands/<id>.md` whose body points at the orchestration skill, plus the skill itself                                                                                | adapted     |
| Rules whose globs are plain directories              | nested `AGENTS.md`, byte-identical to the one Codex emits, so the file is shared                                                                                                | adapted     |
| Rules with other globs                               | inlined in `AGENTS.md` with an "Applies to" line, and reported                                                                                                                  | adapted     |
| Permissions                                          | `permission` object (table below), globally and per subagent                                                                                                                    | native      |
| Hooks, gates                                         | not emitted; they need a plugin, which is code (P8-10). Described in `AGENTS.md` and the workflow skills                                                                        | adapted     |
| Memory                                               | unsupported; seed in `AGENTS.md`                                                                                                                                                | unsupported |

Not built, with the reason: **a primary agent file and `default_agent`**, because the primary
persona is already `AGENTS.md`, which OpenCode always loads, and a second copy in an agent file
would put the same persona in context twice. **`.opencode/rules/<id>.md` plus `instructions`
entries**, because `instructions` adds always-loaded files rather than scoping them, so it would
duplicate what `AGENTS.md` already carries without gaining any scoping. **`subtask`** on
commands, because the default already runs the workflow in the session that invoked it.

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

| Operation                                                 | `permission` key                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `fs.read`                                                 | `read`, and `glob` + `grep` with it — a read ban that left those open would not be one                |
| `fs.write`                                                | `edit`; path patterns become an `edit` object with `"*"` first                                        |
| `fs.delete`                                               | `bash: { "rm *": … }`                                                                                 |
| `shell.readonly`                                          | `bash` entries for the read-only prefixes, only when the decision differs from `shell.mutating`       |
| `shell.mutating`                                          | `bash: { "*": … }`                                                                                    |
| `git.read` / `git.commit` / `git.push` / `git.force-push` | `bash: { "git log *": …, "git commit *": …, "git push *": …, "git push --force *", "git push -f *" }` |
| `net.docs` / `net.any`                                    | `webfetch` and `websearch`; see below                                                                 |
| `mcp`                                                     | not lowered — the docs do not say whether MCP tools have permission keys, so none is guessed          |

Pattern semantics match the harness: last match wins, so the adapter writes the broad `"*"`
entry first, then the derived rules, then the author's own patterns, which are the most specific
thing they wrote. `stableJson` keeps insertion order for exactly this reason; canonical
(sorted) JSON would silently invert the precedence.

There is one key that cannot hold both answers: OpenCode has a single `webfetch` permission,
so a Blueprint that allows `net.docs` and denies `net.any` gets `webfetch: "ask"` and a
`limited` compatibility issue, with the allowed domains named in the `AGENTS.md` command policy.
Keys with no Blueprint meaning (`task`, `skill`, `lsp`, `question`, `doom_loop`,
`external_directory`) are left unset so the harness default applies: a guess there would
restrict an agent in a way nobody asked for.

## Known limitations and open questions

- Hooks are TypeScript code; generated plugins must be deterministic and dependency-free. Not generated — roadmap P8-10.
- No memory primitive.
- Parallelism is not explicitly configurable.
- Whether MCP tools have permission keys is not documented, so permissions do not name them.
- `list` and `todowrite` appear in some permission listings but not in the current reference; the adapter emits neither.

## Sources

- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/commands/
- https://opencode.ai/docs/rules/
- https://opencode.ai/docs/skills/
- https://opencode.ai/docs/plugins/
- https://opencode.ai/docs/permissions/
- https://opencode.ai/docs/config/
