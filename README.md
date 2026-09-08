# Agent Blueprint

**Design once. Test it. Compile it everywhere.**

Agent Blueprint is a visual IDE for designing, validating and compiling AI agent systems.
You describe agents, skills, workflows, iron laws, rules, hooks, gates, tools, references and
memory once, as a _Blueprint_; the compiler turns that Blueprint into the files each AI
coding harness expects (Claude Code, OpenAI Codex, GitHub Copilot, OpenCode, Pi), and the
validator tells you what is missing, contradictory or unsupported before you ship it.

This repository is a pnpm monorepo:

| Path                 | Package                      | Role                                                                                                                                                               |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`           | `web`                        | Next.js IDE                                                                                                                                                        |
| `packages/core`      | `@agent-blueprint/core`      | canonical model, project format, validation, dependency graph, migrations, change-sets                                                                             |
| `packages/exporters` | `@agent-blueprint/exporters` | harness adapters and the compile pipeline                                                                                                                          |
| `packages/ai`        | `@agent-blueprint/ai`        | OpenAI-compatible AI client producing reviewable change-sets                                                                                                       |
| `packages/templates` | `@agent-blueprint/templates` | starter blueprints and artifact templates                                                                                                                          |
| `packages/fixtures`  | `@agent-blueprint/fixtures`  | canonical sample projects used by tests                                                                                                                            |
| `docs/`              |                              | the specification set: vision, architecture, domain model, project format, compiler, validation, AI, web app, security, roadmap, decisions, per-harness references |

## Getting started

```bash
# Node 22 and pnpm 10 (corepack enable, or npm i -g pnpm)
pnpm install
pnpm check      # lint + typecheck + test
pnpm dev        # http://localhost:3000
```

## Status

Phase P0 is complete: the workspace, the documentation set, and `@agent-blueprint/core`
(model, schemas, `blueprint/` project format reader/writer, validation, dependency graph,
migrations, change-sets) with tests and a canonical fixture project. The IDE, adapters and AI
layer are the next phases; see `docs/09-roadmap.md`.

Working in this repo with an AI agent? Start at `AGENTS.md`.

## License

MIT
