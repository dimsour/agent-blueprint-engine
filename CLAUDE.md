@AGENTS.md

## Claude Code specifics

- Use the Bash tool for `pnpm` commands from the repository root; each package can also be run with `pnpm --filter <name> <script>`.
- The `.NET AI Toolkit` plugin is installed in this environment but this repository is TypeScript; ignore `/dotnet:*` suggestions unless a task explicitly concerns .NET fixtures.
- When editing files under `packages/fixtures/projects`, finish with `pnpm --filter @agent-blueprint/core fixtures:canonicalize` so the byte-identity test in `packages/core` stays green.
- Before reporting a task as done, paste the actual output of `pnpm check` (never claim tests pass without running them).
