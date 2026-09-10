# Agent Blueprint: Vision

This document states what Agent Blueprint is, the vocabulary every package and screen must respect, and the experience the product is built around. Read it before touching the domain model, the UI, or the AI prompts: the concept boundaries defined here are enforced in code (`packages/core/src/model/kinds.ts`) and in prompts, and blurring them is a bug.

## One sentence

Agent Blueprint is a visual IDE for designing, validating and compiling AI agent systems: **design once, test it, compile it everywhere.**

## What the product is

- An **authoring environment** for agent architecture: agents, the knowledge they carry, the way work is orchestrated, and the constraints that govern them.
- A **validation environment**: structural checks, semantic checks, contradiction detection, requirement verification, and a quality score with actionable findings.
- A **compilation environment**: one canonical Blueprint compiled deterministically into the file conventions of Claude Code, OpenAI Codex, GitHub Copilot, OpenCode and Pi.

## What the product is not

| Not this                      | Because                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A chatbot with export buttons | The Blueprint is a structured model, not a transcript. AI proposes ChangeSets; it never edits directly.                                                                               |
| A prompt generator            | Markdown files are _outputs_ of the model, not the model. The same Blueprint compiles to different file sets per harness.                                                             |
| A runtime                     | The app never executes an agent. It produces a Git repository that a harness executes. Scenario simulation is deferred and, when added, runs through the harness, not inside the IDE. |
| A hosted SaaS with accounts   | Local-first. No database. Projects live on disk, in the browser, or in a Git repository the user owns.                                                                                |

## Source of truth

```
blueprint/            ← source of truth, authored (blueprint.yaml + one file per artifact)
CLAUDE.md, .claude/   ← compiled for Claude Code
AGENTS.md, .agents/   ← compiled for Codex (AGENTS.md shared with Copilot, OpenCode, Pi)
```

The visual graph is a _view_ of the Blueprint. The Markdown editor shows the _file_ the Blueprint would write. The compiled directories are _derived_ and owned by the compiler (tracked in `blueprint/build-manifest.json`). Editing a compiled file by hand is a mistake the tooling detects; editing a source file by hand is supported and expected.

## Concept glossary

Each concept is a distinct entity kind in `packages/core/src/model/kinds.ts` (or a distinct field on one), a distinct screen in the IDE, and a distinct target in the compiler. They must stay distinct.

| Concept             | Definition                                                                                                                                                                                                                                                                     | Where it lives                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Blueprint**       | The complete specification of one agent system: every entity below plus project settings and export targets.                                                                                                                                                                   | `blueprint.yaml` + artifact files          |
| **Agent**           | _Who_ performs a responsibility. Has a role (worker, reviewer, researcher, investigator, architect, verifier, orchestrator), expertise, responsibilities, and references to the skills, workflows, laws, rules, tools, references and memory it uses. Its body is its persona. | `agents/<id>.md`                           |
| **Skill**           | _What an agent knows_ and how it performs one capability. Concise, operational, with explicit activation conditions. Compiles to an Agent-Skills-spec `SKILL.md`.                                                                                                              | `skills/<id>/SKILL.md`                     |
| **Workflow**        | _How work is orchestrated_: a graph of typed nodes and typed edges with real semantics (sequential, parallel, conditional, retry, delegation, review, aggregation).                                                                                                            | `workflows/<id>.md` + `<id>.workflow.json` |
| **Iron Law**        | _What must never be violated._ Non-negotiable, with rationale, examples, counterexamples, severity, category, scope and enforcement mechanisms.                                                                                                                                | `laws/<id>.md`                             |
| **Rule**            | _Preferred behaviour._ May be traded off. Can be path-scoped.                                                                                                                                                                                                                  | `rules/<id>.md`                            |
| **Hook**            | _Automatic action_ bound to a harness lifecycle event (session start, before/after tool, after file change, before stop).                                                                                                                                                      | `hooks/<id>.yaml`                          |
| **Gate**            | _Checkpoint_ that decides whether a workflow may continue: allow, warn, block, or request human approval. Referenced by workflow gate nodes.                                                                                                                                   | `gates/<id>.yaml`                          |
| **Tool**            | _Capability available_ to an agent: file system, shell, git, browser, search, database, API, documentation, MCP server.                                                                                                                                                        | `tools/<id>.yaml`                          |
| **Permission**      | _What an agent is allowed to do_, as abstract operations (`fs.write`, `shell.mutating`, `git.push`, `net.any`) with allow / ask / deny decisions. A field on Agent, not an entity.                                                                                             | `agents/<id>.md` frontmatter               |
| **Reference**       | _Deeper knowledge_: long-form documentation, examples, domain knowledge. Kept apart from concise skills.                                                                                                                                                                       | `references/<id>.md`                       |
| **Memory**          | _Accumulated context_: what an agent should remember across sessions, at which scope (stateless, session, project, persistent), with seed knowledge.                                                                                                                           | `memory/<id>.md`                           |
| **Requirement**     | _A claim the Blueprint must satisfy_, with declarative checks the validator evaluates (satisfied / partial / not satisfied).                                                                                                                                                   | `requirements/<id>.md`                     |
| **Scenario**        | _A behavioural test case_: an input and expected behaviours. Manual or AI-judged today; runtime later.                                                                                                                                                                         | `scenarios/<id>.yaml`                      |
| **Evaluation**      | _A computed quality report_ per dimension with findings. Never stored as source.                                                                                                                                                                                               | in-memory report                           |
| **Compound**        | _Turning experience into reusable knowledge_: notes or a transcript in, a reviewable ChangeSet of skills, laws, references and workflow steps out.                                                                                                                             | AI operation                               |
| **Harness Adapter** | _Compilation into one runtime's file conventions_, declaring per concept whether support is native, adapted, limited or unsupported.                                                                                                                                           | `packages/exporters`                       |

### Knows how vs. is allowed to

The most common modelling mistake is to conflate capability with permission.

- A **Skill** or **Tool** says the agent _knows how_ to run tests or _can_ call the shell.
- A **Permission** says whether it _may_: `shell.mutating: ask`, `git.force-push: deny`.

Both are modelled explicitly, both are compiled (skills to `SKILL.md`, permissions to `settings.json` / `config.toml` / `opencode.json`), and the compatibility view reports where a harness cannot enforce a permission natively.

### Iron Law vs. Rule

An Iron Law has severity, rationale, counterexamples, violation behaviour and enforcement mechanisms because it must be defensible and, where the harness allows, mechanically enforced through a hook or gate. A Rule is guidance with a priority. The UI presents them on separate screens with different visual weight; the compiler places laws above rules in every root instruction file.

## The core pipeline

```
   USER INTENT
        │
        ▼
    BLUEPRINT ───────────────────────────────────────────┐
        │                                                │
  ┌─────┼──────────┐                                     │
  ▼     ▼          ▼                                     │
Knowledge  Behaviour   Governance                        │
Skills     Agents      Iron Laws                         │
References Workflows   Rules                             │
Memory     Delegation  Hooks / Gates                     │
  │          │            │                              │
  └──────────┼────────────┘                              │
             ▼                                           │
        Tools + Permissions                              │
             │                                           │
             ▼                                           │
        VALIDATE ── diagnostics, contradictions,         │
             │      requirements, evaluation score       │
             ▼                                           │
        IMPROVE ─── AI proposes a ChangeSet ── user reviews ──┘
             │
             ▼
        COMPILE ─── normalize → validate → adapters → files → build manifest
             │
   ┌─────────┼──────────┬──────────┬──────────┐
   ▼         ▼          ▼          ▼          ▼
Claude Code  Codex    Copilot   OpenCode     Pi
             │
             ▼
        EXPORT ─── ZIP · local folder · GitHub push
```

The user-facing summary of this pipeline is **Design → Connect → Validate → Improve → Compile → Export**.

## End-to-end experience

This is the reference scenario the product is optimised for. Everything that is not on this path is secondary.

1. **Start.** A new user opens the app and sees _Create your first Blueprint_, templates, recent projects, import, and GitHub.
2. **Describe.** `/new` asks one question: what are you building? They name it "Rust Review Crew" and press Create, and the editor opens on it. With an AI endpoint configured they can instead enter "Create an expert .NET unit-testing agent" and press _Draft this with AI_, and the model returns a ChangeSet: one agent (`testing-expert`), three skills (`xunit`, `test-design`, `fluent-assertions`), two workflows (`write-tests`, `review-tests`), three iron laws, one gate (`tests-pass`). Nothing is applied yet, and nothing is created until Create.
3. **Review.** The ChangeSet review shows every proposed create as a diff. The user accepts all.
4. **See the graph.** The overview graph is derived from typed references: agent → skills, agent → workflows, workflow nodes → gate. No layout is stored; it is computed.
5. **Connect.** In the workflow editor the user wires _Understand → Design → Implement → Run tests → Gate → Done_ with a retry edge from the verification node back to implementation.
6. **Improve.** In the AI panel: "Make this suitable for a senior engineer and add edge cases." The AI proposes updates to two skills. The user reviews the per-field diff and accepts one, rejects the other.
7. **Validate.** Blueprint Health reports the score and findings. Each finding navigates to its artifact. The user fixes a skill with a missing description.
8. **Save.** The project is written to `blueprint/`: one Markdown or YAML file per artifact, a small manifest, deterministic bytes. Saving twice changes nothing.
9. **Compile.** _Export → Claude Code_ and _Export → Codex_. The compatibility view shows that Claude Code compiles hooks natively while the Codex permission model is coarser (adapted). The generated tree is browsable per target.
10. **Push.** _Push to GitHub_ previews the files that will change (source directory plus compiler-owned outputs only), then makes one atomic commit.
11. **Use.** The user clones the repository and runs their harness in it. The harness reads `CLAUDE.md` or `AGENTS.md` and the skills; the workflow is a slash command.

The fixture project `packages/fixtures/projects/dotnet-testing-expert` is exactly the Blueprint this scenario produces and is used by tests across all packages.

## Quality bar

- Every score has actionable findings. A number without a finding is a bug.
- Generation is deterministic: no timestamps, no random ids, stable ordering. Changing one skill produces a one-file diff.
- Every harness limitation is explained in the compatibility view, never silently dropped.
- AI never modifies the Blueprint without review.
- The generated repository is understandable to a developer who has never seen Agent Blueprint.
