/**
 * The tutorial (P9-06, extended in P9-38 and P9-39).
 *
 * The product explains itself to someone who already knows what a Blueprint is. This walks
 * the story in docs/00 for someone who does not: what to press, what happens, and a picture
 * of it having happened. Then it takes the parts one at a time — what an agent is, what a
 * permission decides, how a hook fires and what each compiles to — because the loop shows
 * every kind of artifact once and says nothing about what is inside it.
 *
 * Every picture comes from `pnpm --filter web screenshots`, which drives the real app. That
 * is the whole point of generating them: a page that has changed cannot leave a picture of
 * the old one behind here. A shot this page needs and the script does not take is added to
 * the script — never captured by hand. Every source file shown is a starter's, or an excerpt
 * of one, so it is the shape the project writes and not a shape invented for the page.
 *
 * It is a server component, and reads nothing: someone who has never created a project is
 * exactly who it is for, so it must not depend on there being one.
 */
import type { StaticImageData } from 'next/image'
import Image from 'next/image'
import Link from 'next/link'

import agentEditor from '@/assets/screenshots/agent-editor.png'
import agentPermissions from '@/assets/screenshots/agent-permissions.png'
import assistant from '@/assets/screenshots/assistant.png'
import artifactEditor from '@/assets/screenshots/artifact-editor.png'
import compatibility from '@/assets/screenshots/compatibility.png'
import dashboard from '@/assets/screenshots/dashboard.png'
import evaluation from '@/assets/screenshots/evaluation.png'
import exportView from '@/assets/screenshots/export-view.png'
import gateEditor from '@/assets/screenshots/gate-editor.png'
import github from '@/assets/screenshots/github.png'
import healthFindings from '@/assets/screenshots/health-findings.png'
import hookEditor from '@/assets/screenshots/hook-editor.png'
import ironLawEditor from '@/assets/screenshots/iron-law-editor.png'
import newProject from '@/assets/screenshots/new-project.png'
import overviewGraph from '@/assets/screenshots/overview-graph.png'
import settingsAi from '@/assets/screenshots/settings-ai.png'
import settingsGithub from '@/assets/screenshots/settings-github.png'
import sourceTab from '@/assets/screenshots/source-tab.png'
import templateReview from '@/assets/screenshots/template-review.png'
import workflowEditor from '@/assets/screenshots/workflow-editor.png'
import workspace from '@/assets/screenshots/workspace.png'

import { PageHeader } from '@/components/layout/page-header'
import { TutorialNav } from '@/components/tutorial/tutorial-nav'
import { Button } from '@/components/ui/button'

interface Shot {
  src: StaticImageData
  /** What is in the picture, for a reader who cannot see it. Never just the step's name. */
  alt: string
  caption: string
}

interface Step {
  id: string
  title: string
  /** The control to use, named exactly as the app names it. */
  press: string
  body: string
  shots: Shot[]
}

const STEPS: Step[] = [
  {
    id: 'start',
    title: 'Start',
    press: 'Create Blueprint',
    body: 'The dashboard is everything this browser is holding: the projects you have made, the ten starter Blueprints, and the ways in from a ZIP, a folder on disk or a GitHub repository. Nothing here is on a server — a project lives in this browser until you export or push it.',
    shots: [
      {
        src: dashboard,
        alt: 'The dashboard: a Create Blueprint button beside Import ZIP, Open folder and Open from GitHub, above a grid of ten starter Blueprints.',
        caption:
          'Starters are real projects, not samples. Opening one is the fastest way to see a finished Blueprint.',
      },
    ],
  },
  {
    id: 'describe',
    title: 'Describe',
    press: 'Create project',
    body: 'One question: what are you building? The name is the only thing it waits for — the id follows it until you edit the id yourself, and everything else can change later. With an AI endpoint configured, Draft this with AI takes a sentence about the work and proposes a whole first Blueprint instead.',
    shots: [
      {
        src: newProject,
        alt: 'The new-project screen: Name reading "Rust Review Crew", an Id field that has filled itself in as rust-review-crew, a description, and a Draft this with AI panel.',
        caption:
          'The id is derived from the name. Edit it and it stops following, because an id you chose is not something a later typo fix should undo.',
      },
      {
        src: workspace,
        alt: 'The workspace: a project tree on the left listing agents, skills, workflows and iron laws with counts, a graph in the middle, an inspector on the right, and a health bar along the bottom.',
        caption:
          'Create opens the editor on your project. This is the React Expert starter rather than an empty one, so there is something to look at.',
      },
    ],
  },
  {
    id: 'review',
    title: 'Review',
    press: 'New from template',
    body: 'Artifacts are added from the tree or from the inspector, and nothing is added until you accept it. This is the rule the whole product runs on: a template, an AI proposal and an import all arrive as a change you read first. Once it is in, the form on the left and the file path above it are the same artifact.',
    shots: [
      {
        src: templateReview,
        alt: 'A dialog titled "New skill from a template" listing Domain expertise, Coding procedure, Testing and Debugging, with a name filled in as Bundle Budget and the id bundle-budget shown beneath it.',
        caption: '"A template proposes a change; nothing is added until you accept it."',
      },
      {
        src: artifactEditor,
        alt: 'A skill open in the editor: Visual, Markdown and Preview tabs, the file path blueprint/skills/react-rendering/SKILL.md, and fields for name, id, description, tags, when to use, file patterns and intents.',
        caption:
          'Every field carries an info icon: what it is for, an example, and a button that inserts the example.',
      },
    ],
  },
  {
    id: 'graph',
    title: 'See the graph',
    press: 'Overview',
    body: 'The graph is derived, not stored. It is drawn from the references the artifacts already carry — an agent to its skills, a workflow to the gate that checks it — so it cannot disagree with the project. Filter it by kind to see one layer at a time, and click a node to open that artifact.',
    shots: [
      {
        src: overviewGraph,
        alt: 'The overview graph: a React Expert agent node with edges fanning out to tools, iron laws and references, above a row of filter chips for each artifact kind, and a "derived, not stored" badge.',
        caption: 'No layout is saved for this one. Move nothing, lose nothing.',
      },
    ],
  },
  {
    id: 'connect',
    title: 'Connect',
    press: 'a step, then Leads to',
    body: 'A workflow is a drawing, so it opens as one. Drag a shape in from the left to add a step, drag between two steps to connect them, and select a step to say what it runs, what it is given, what it must produce and what happens when it fails. Tidy lays the whole thing out again without moving anything twice.',
    shots: [
      {
        src: workflowEditor,
        alt: 'The workflow editor: a vertical chain of steps from Understand the request through Plan the change, Implement, Verify and Review the change, with the selected step open in a panel showing its type, agent, context, output, failure behaviour and what it leads to.',
        caption:
          'Every step type the compiler understands is in the palette on the left, including gates and human approval.',
      },
    ],
  },
  {
    id: 'improve',
    title: 'Improve',
    press: 'AI, or Ctrl+/',
    body: 'The assistant offers the operations that suit whatever is selected, and explains the ones that do not. It talks to whichever OpenAI-compatible endpoint you configure — hosted or a model on your own machine — and the key is yours: it is kept in this browser for the session unless you say otherwise, and never reaches a Blueprint file, an export or a log.',
    shots: [
      {
        src: assistant,
        alt: 'The assistant dialog, working on the build-component workflow, saying "No AI endpoint yet" with a Set one up button.',
        caption:
          'With no endpoint it says so and points at Settings. Nothing it produces is applied without your review.',
      },
    ],
  },
  {
    id: 'validate',
    title: 'Validate',
    press: 'a count in the health bar',
    body: 'The bar along the bottom is the project in five numbers: artifacts, errors, warnings, suggestions and a score. Every count opens the findings behind it, and every finding opens the artifact it is about — the step inside a workflow, when it names one. Nothing here is advice in general; each one points somewhere.',
    shots: [
      {
        src: healthFindings,
        alt: 'The health bar expanded to show one warning, BP-DESC-001, "Skill React testing has no description", with the same finding repeated in the inspector and a badge on the artifact in the tree.',
        caption:
          'A finding has a stable code, so it can be looked up in docs/05 and never means two different things.',
      },
      {
        src: evaluation,
        alt: 'The evaluation view: an overall score with a bar per dimension — skills, agents, workflows, iron laws, consistency, portability, coverage, verification, safety and complexity — each with its own findings.',
        caption:
          'The score is ten dimensions, each explaining itself. A model can be asked for a second opinion; it is badged, and it does not move the number.',
      },
    ],
  },
  {
    id: 'save',
    title: 'Save',
    press: 'Save, or Ctrl+S',
    body: 'The project is a directory of Markdown and YAML — one file per artifact and a small manifest — and that directory is the source of truth, not a database. The Markdown tab is that file, not a rendering of it: edit it there and the form follows. Saving twice writes identical bytes, which is what makes the whole thing diffable.',
    shots: [
      {
        src: sourceTab,
        alt: 'The Markdown tab of a skill, showing the real file with its YAML frontmatter and body in a code editor, and the path blueprint/skills/react-rendering/SKILL.md above it.',
        caption: 'The path above the tabs is where this artifact lives on disk.',
      },
    ],
  },
  {
    id: 'compile',
    title: 'Compile',
    press: 'Export',
    body: 'One Blueprint, five harnesses. The export view shows the files each target would get before anything is written — you can open any of them and read it — and it refuses to download while an error stands. What one harness cannot express is not silently dropped: it is reported, with where the intent was written instead.',
    shots: [
      {
        src: exportView,
        alt: 'The export view: a per-target list of generated files including CLAUDE.md and the .claude directory, with the contents of the selected file shown beside it.',
        caption: 'The compiled output is browsable before it exists.',
      },
      {
        src: compatibility,
        alt: 'The compatibility view: a row per harness — Claude Code, Codex, Copilot, OpenCode and Pi — each concept marked native, adapted, limited or unsupported, with an explanation.',
        caption: 'Portability is a claim the product lets you check rather than one it makes.',
      },
    ],
  },
  {
    id: 'push',
    title: 'Push',
    press: 'GitHub',
    body: 'A push says what it would do first: every path added, changed or removed, the compiler errors that block it, the files it does not own and will not overwrite unasked, and anything shaped like a credential — which stops the push until you accept it. Then it is one tree, one commit and one move of the branch, never forced.',
    shots: [
      {
        src: github,
        alt: 'The GitHub dialog asking for a personal access token, with a note that the token is checked against the API before it is stored and kept where the AI key is kept.',
        caption:
          'A token is proved against the API before it is stored, so a typo fails here rather than halfway through a push.',
      },
    ],
  },
  {
    id: 'use',
    title: 'Use it',
    press: 'your harness, in the repository',
    body: 'Clone the repository and start Claude Code, Codex, Copilot, OpenCode or Pi in it. The harness reads CLAUDE.md or AGENTS.md and the skills directory on its own — there is nothing to install and nothing of this app running. That is the point of compiling: the output is a repository your tools already understand.',
    shots: [],
  },
]

/** One kind of artifact, or one idea that cuts across them, explained on its own. */
interface Concept {
  id: string
  title: string
  /** What it is, in the words docs/00 fixes. */
  definition: string
  /** How one is added or reached, named exactly as the app names it. */
  press: string
  body: string[]
  /** The settings that matter and what each one decides. */
  fields: { name: string; text: string }[]
  /** The source file the project writes for one, or an excerpt of it. */
  example?: { path: string; code: string }
  /** What the compiler makes of it, per harness. */
  compiles?: { harness: string; output: string }[]
  shots: Shot[]
}

const CONCEPTS: Concept[] = [
  {
    id: 'files',
    title: 'The project on disk',
    definition:
      'A Blueprint is a directory: a small manifest and one Markdown or YAML file per artifact. The directory is the source of truth. The forms edit it, the graph is drawn from it, and the compiled output is derived from it.',
    press: 'Markdown, or YAML, above any form',
    body: [
      'Every id is a slug — lower-case words joined by hyphens, at most 64 characters — and it is the file name, the directory name of a skill, and the way one artifact refers to another. Renaming an id is a refactor the app performs: every reference follows, because a second relationship table would be a second thing to get wrong.',
      'Markdown files carry their fields in YAML frontmatter and the prose in the body; hooks, gates, tools and scenarios have no prose and are plain YAML. Writing is canonical — a fixed key order, sorted lists where order means nothing, LF line endings — so saving twice changes no bytes and a change to one skill is a one-file diff.',
      'The reader is tolerant: an unknown key is kept, a missing optional file is fine, and a file that does not parse becomes a finding with its path rather than a refusal to open the project. The writer is strict.',
    ],
    fields: [],
    example: {
      path: 'blueprint/',
      code: `blueprint.yaml                    name, id, version, settings, targets, the ids per kind
agents/<id>.md                    frontmatter: the fields · body: the persona
skills/<id>/SKILL.md              Agent Skills frontmatter · body: the instructions
skills/<id>/references/ scripts/ assets/
workflows/<id>.md                 description and triggers
workflows/<id>.workflow.json      steps, connections and their positions
laws/<id>.md · rules/<id>.md · references/<id>.md · memory/<id>.md
hooks/<id>.yaml · gates/<id>.yaml · tools/<id>.yaml · scenarios/<id>.yaml
requirements/<id>.md
build-manifest.json               every path the compiler wrote, with its hash`,
    },
    shots: [],
  },
  {
    id: 'agent',
    title: 'Agents',
    definition:
      'An agent is who performs a responsibility. It has a role, expertise and responsibilities, and it refers to the skills, workflows, laws, rules, tools, references and memory it uses. Its body is its persona — the system prompt, in Markdown.',
    press: 'Add agent, beside Agents in the tree',
    body: [
      'One agent is primary. Its persona becomes the root instruction file — CLAUDE.md for Claude Code, AGENTS.md for the rest — with the laws, the rules, the roster of other agents and the memory seed composed beneath it. Every other agent compiles to the harness’s subagent, where one exists. The first agent is primary unless the manifest’s settings name another; the inspector badges it and the graph outlines it.',
      'The lists on the form are references, not copies. Skills, Workflows, Iron Laws, Rules, Tools, References and Memory each pick from what the project already holds, and the order of the skills is their priority. The overview graph is drawn from exactly these lists.',
      'Can delegate to names the agents this one may hand work to and compiles to the harness’s subagent wiring. Model preference and the budget — how hard it may think, how many turns it may take — travel where the harness has a field for them and are reported where it does not. Permissions are the next section; they are what the agent may do, which is a different question from what it knows how to do.',
    ],
    fields: [
      {
        name: 'Role',
        text: 'worker, reviewer, researcher, investigator, architect, verifier or orchestrator. A skill can activate for a role, and the role shapes what the assistant proposes.',
      },
      {
        name: 'Responsibilities',
        text: 'What the agent is accountable for. Validation warns when it is empty, because an agent nobody can hold to anything is a persona, not an agent.',
      },
      {
        name: 'Output requirements',
        text: 'What a finished task must include — the tests run, the summary line quoted. Written beneath the persona as a section of its own.',
      },
      {
        name: 'Model preference',
        text: 'fast, balanced or strong, with an optional concrete model id. Lowered to the subagent’s model field where there is one.',
      },
      {
        name: 'Effort, Turn budget',
        text: 'How hard it may think and how long it may run. Claude Code gets both; Codex gets the reasoning effort and is told the turn limit.',
      },
      {
        name: 'Persona',
        text: 'The body: who the agent is and how it works. The one field the harness reads verbatim.',
      },
    ],
    example: {
      path: 'blueprint/agents/react-expert.md (shortened)',
      code: `---
name: React Expert
description: Senior React engineer focused on component design, accessibility and behaviour-level tests.
role: worker
responsibilities:
  - Build and change React components and hooks
  - Test component behaviour the way a user meets it
skillIds:
  - react-rendering
  - react-testing
workflowIds:
  - build-component
ironLawIds:
  - never-fake-verification
toolIds:
  - npm
permissions:
  operations:
    fs.write: allow
    shell.mutating: ask
    git.push: deny
model:
  preference: balanced
---

You are a senior React engineer.

You put state where it belongs, you delete effects that should not exist, and you
treat accessibility as part of the component rather than a later pass.`,
    },
    compiles: [
      {
        harness: 'Claude Code',
        output:
          'Primary: CLAUDE.md. Others: .claude/agents/<id>.md with description, tools, model, skills and memory.',
      },
      {
        harness: 'Codex',
        output:
          'Primary: AGENTS.md. Others: .codex/agents/<id>.toml, switched on in .codex/config.toml.',
      },
      {
        harness: 'Copilot',
        output:
          'Primary: AGENTS.md, pointed at from .github/copilot-instructions.md. Others: .github/agents/<id>.agent.md.',
      },
      {
        harness: 'OpenCode',
        output:
          'Primary: AGENTS.md. Others: .opencode/agents/<id>.md as a subagent with its own permissions.',
      },
      {
        harness: 'Pi',
        output:
          'Primary: AGENTS.md. Others: a persona template in .pi/prompts/<id>.md — there is no subagent, and the compatibility view says what that costs.',
      },
    ],
    shots: [
      {
        src: agentEditor,
        alt: 'The React Expert agent open in the editor: the path blueprint/agents/react-expert.md, and fields for name, id, description, tags, role, responsibilities and expertise, with the inspector on the right listing the fourteen artifacts it depends on.',
        caption:
          'The inspector’s Depends on list is the agent’s reference lists read back: the skills it uses, the workflows it runs, the laws it is bound by.',
      },
    ],
  },
  {
    id: 'permissions',
    title: 'Permissions',
    definition:
      'A permission is what an agent is allowed to do, as an abstract operation with a decision: allow, ask or deny. It is a field on the agent, not an artifact of its own, and it is separate from what the agent knows how to do.',
    press: 'Permissions, on the agent’s form',
    body: [
      'A tool says the agent can call the shell. A skill says it knows how to run the tests. A permission says whether it may. The three stay apart because the compiler needs all three: the compatibility view can only report that a harness cannot enforce a permission if the Blueprint said what it wanted enforced.',
      'There are twelve operations, and they are the whole vocabulary — reading, writing and deleting files, read-only and mutating shell commands, reading, committing, pushing and force-pushing with git, fetching documentation hosts and any host, and the MCP servers the agent’s tools declare. Leaving one unset means the harness applies its own default, and the grid shows that rather than hiding it. Validation flags an agent allowed to force-push without asking and one given the open network with no security law beside it.',
      'Exceptions are finer than operations and win over them: an operation, a pattern and a decision. git push * under the mutating shell, src/** under file writes, docs.example.com under the network. The pattern is written once, harness-agnostically, and each adapter writes it the way its harness reads it — Bash(git push *), Edit(src/**), WebFetch(domain:docs.example.com) for Claude Code.',
      'An ask on a whole operation is a prompt on every use of it. Claude Code offers no "don’t ask again" for a rule that says ask, and honours the rule even in a session that skips permissions. When one prompt per command is not what was meant, allow the operation and put the ask on an exception; packaged as a plugin, the export reports a whole-operation ask as limited so it is not a surprise in someone else’s project.',
    ],
    fields: [
      { name: 'allow', text: 'Runs without asking. The rule the harness adds to its allow list.' },
      {
        name: 'ask',
        text: 'Prompts every time. Right for a pattern — a push, a delete — and expensive on a whole operation.',
      },
      {
        name: 'deny',
        text: 'Refused, and the agent is told so. A denied shell in Pi closes both shells, because Pi has only one.',
      },
      {
        name: 'unset',
        text: 'The harness decides. Rarely what you want for anything that loses work or leaves the machine.',
      },
    ],
    example: {
      path: 'blueprint/agents/react-expert.md (the permissions block, with an exception added)',
      code: `permissions:
  operations:
    fs.read: allow
    fs.write: allow
    fs.delete: ask
    shell.readonly: allow
    shell.mutating: ask
    git.read: allow
    git.commit: ask
    git.push: deny
    git.force-push: deny
    net.docs: allow
    net.any: deny
  patterns:
    - operation: shell.mutating
      pattern: npm test *
      decision: allow`,
    },
    compiles: [
      {
        harness: 'Claude Code',
        output:
          'permissions.allow, ask and deny in .claude/settings.json — Read, Glob, Grep for reading; Edit, Write for writing; Bash(git push *) and the like for git; WebFetch(domain:…) per documentation tool; mcp__<server> for MCP. Native.',
      },
      {
        harness: 'Codex',
        output:
          'approval_policy and sandbox_mode in .codex/config.toml. Coarser than the operations, so per-pattern decisions become instructions. Limited.',
      },
      {
        harness: 'Copilot',
        output:
          'Whole tools on and off per agent; a decision on one command is reported, not enforced.',
      },
      {
        harness: 'OpenCode',
        output: 'The permission block of opencode.json, per agent where the agent has one.',
      },
      {
        harness: 'Pi',
        output:
          'defaultTools in .pi/settings.json. ask has no equivalent and is reported rather than approximated.',
      },
    ],
    shots: [
      {
        src: agentPermissions,
        alt: 'The permission grid on the React Expert agent: a row per operation — read files, write files, delete files, read-only shell, mutating shell, read git, commit, push, force-push, fetch documentation, any network — each with allow, ask and deny radio buttons, and a description under each operation.',
        caption:
          'The starter allows reading, writing and read-only commands, asks before deletes, mutating commands and commits, and denies pushing and the open network.',
      },
    ],
  },
  {
    id: 'skill',
    title: 'Skills',
    definition:
      'A skill is what an agent knows and how it performs one capability. It is concise, operational, and says when it applies. It compiles to a SKILL.md in the Agent Skills format that every harness reads.',
    press: 'Add skill, or New from template in the inspector',
    body: [
      'A skill is a directory: SKILL.md with its frontmatter and body, plus whatever ships beside it — references, scripts and assets under Resources. The body is what the agent reads once the skill is active: purpose, when to use, the steps, the constraints, examples, and how to verify. Keep it operational. Long-form knowledge belongs in a reference the skill points at, so the skill stays short enough to be loaded on every match.',
      'Activation says when it becomes active, and every list is ORed with the others: file patterns such as **/*.test.tsx, file types, directories, intents such as "write tests", agent roles, and the workflows in which it is active. When to use is the sentence a harness shows itself when deciding whether to load the skill, and the description has a ceiling of 1,024 characters because the Agent Skills specification has one.',
      'Every skill is also a slash command — /react-testing in Claude Code and Copilot, $react-testing in Codex — unless Offered as a command is switched off, which is the setting for background knowledge that is not actionable on its own. Argument hint says what to type after the command. The export’s README lists the commands each harness gets, with workflows and skills told apart.',
    ],
    fields: [
      {
        name: 'When to use',
        text: 'One sentence. The harness reads this to decide whether to load the skill; the body is read only after.',
      },
      {
        name: 'File patterns, Intents, File types',
        text: 'The activation lists. Any one match activates the skill.',
      },
      {
        name: 'Offered as a command',
        text: 'On by default. Off keeps a knowledge skill out of the / menu (Claude Code’s user-invocable: false).',
      },
      {
        name: 'Allowed tools',
        text: 'Tools the skill may use, from the project’s tools. Becomes allowed-tools in the frontmatter.',
      },
      {
        name: 'Resources',
        text: 'Files shipped next to SKILL.md. references/ for reading, scripts/ for running, assets/ for anything else; binary files travel as they are.',
      },
      {
        name: 'Instructions',
        text: 'The body. Numbered steps read better than prose here, and a verification section is what separates a procedure from a hope.',
      },
    ],
    example: {
      path: 'blueprint/skills/react-testing/SKILL.md (frontmatter and headings)',
      code: `---
name: React testing
description: "Testing components the way a user meets them: queries by role and label, user events, and no assertions on internals."
tags:
  - react
  - testing
whenToUse: When adding or changing a component test.
activation:
  filePatterns:
    - "**/*.test.tsx"
    - "**/*.spec.tsx"
  intents:
    - write tests
    - test this component
---

# React testing

## Purpose
## When to Use
## Instructions
## Constraints
## Verification`,
    },
    compiles: [
      {
        harness: 'Claude Code',
        output: '.claude/skills/<id>/SKILL.md with its resources; the command is /<id>. Native.',
      },
      {
        harness: 'Codex',
        output:
          '.agents/skills/<id>/SKILL.md plus agents/openai.yaml; the command is $<id>. Native.',
      },
      { harness: 'Copilot', output: '.github/skills/<id>/SKILL.md; the command is /<id>. Native.' },
      {
        harness: 'OpenCode, Pi',
        output:
          '.agents/skills/<id>/SKILL.md, the same directory Codex reads, written once. Native.',
      },
    ],
    shots: [],
  },
  {
    id: 'workflow',
    title: 'Workflows',
    definition:
      'A workflow is how work is orchestrated: a graph of typed steps and typed connections with real semantics — sequential, parallel, conditional, retry, delegation, review, aggregation. It is edited as the drawing it is.',
    press: 'Add workflow, then the Graph tab',
    body: [
      'There are sixteen step types: start, end, agent, skill, tool, condition, verification, review, gate, human approval, output, parallel, merge, retry, delegate and synthesis. A workflow has one start, which is its entry, and validation reports a step the start cannot reach, a step that leads nowhere, and a workflow with no verification, gate, review or human-approval step on the way to its end.',
      'What a step needs depends on its type, and Step settings asks for it: an agent or delegate step names its agent; a skill, tool or gate step names the one it runs; a condition carries a readable predicate; a verification step says how — a command, the tests, a review, or by hand — and which command; a retry step its attempts; a merge its strategy (all, any, first, synthesize); a human-approval step what to ask. Context and Output say what every step is given and what it must produce; On failure — stop, continue, fallback, retry — what happens when it does not. A step keeps its settings when its type changes; validation says what the new type is missing rather than the editor throwing anything away.',
      'A connection has a kind — sequential, parallel, conditional, fallback, retry, delegation, review or aggregation — and is required unless you say otherwise; a conditional one says when it is taken. Drag between two steps to draw one, or use Leads to on the selected step. Positions are part of the source, and Tidy rewrites them deterministically.',
      'No harness has a workflow primitive, so a workflow compiles to an orchestration skill: the steps in order, whom each is delegated to, the gates, the failure behaviour, the parallel groups. It is invoked as a slash command, and its description in the menu starts with "Workflow:" so it can be told from a skill. Trigger intents say when an agent should start it unasked; Argument hint what to type after the command.',
    ],
    fields: [
      {
        name: 'Step type',
        text: 'What the step is. The palette on the left holds every one; a template inserts a whole workflow at once.',
      },
      {
        name: 'Agent, Skill, Tool, Gate',
        text: 'Which artifact the step runs, by reference. Deleting that artifact shows this step in the impact.',
      },
      {
        name: 'Context, Output',
        text: 'What the step receives and what it must produce. The orchestration skill hands both to the agent.',
      },
      {
        name: 'On failure',
        text: 'stop, continue, fallback or retry. A fallback needs a fallback connection; a retry, an attempt count.',
      },
      {
        name: 'Connection kind',
        text: 'The semantics of an edge. A review edge sends work back; an aggregation edge joins parallel branches.',
      },
      {
        name: 'Trigger intents',
        text: 'Phrases that should start the workflow — "build a component", "add a screen".',
      },
    ],
    example: {
      path: 'blueprint/workflows/build-component.workflow.json (excerpt)',
      code: `{
  "entryNodeId": "start",
  "nodes": [
    {
      "id": "implement",
      "type": "agent",
      "label": "Implement",
      "description": "Work the plan. Keep each step small enough to verify.",
      "position": { "x": 0, "y": 480 },
      "config": { "agentId": "react-expert" }
    },
    {
      "id": "gate",
      "type": "gate",
      "label": "Ready to report",
      "position": { "x": 0, "y": 840 },
      "config": { "gateId": "tests-pass" }
    }
  ],
  "edges": [
    { "id": "implement-verify", "from": "implement", "to": "verify", "kind": "sequential" }
  ]
}`,
    },
    compiles: [
      {
        harness: 'Claude Code',
        output:
          '.claude/skills/<id>/SKILL.md, an orchestration skill that delegates with the Agent tool; the command is /<id>. Adapted.',
      },
      {
        harness: 'Codex',
        output: '.agents/skills/<id>/SKILL.md; the command is $<id>. Adapted.',
      },
      {
        harness: 'Copilot',
        output:
          '.github/skills/<id>/SKILL.md and a .github/prompts/<id>.prompt.md that points at it. Adapted.',
      },
      {
        harness: 'OpenCode',
        output: 'The shared skill and .opencode/commands/<id>.md. Adapted.',
      },
      { harness: 'Pi', output: 'The shared skill and .pi/prompts/<id>.md. Adapted.' },
    ],
    shots: [],
  },
  {
    id: 'laws',
    title: 'Iron Laws and Rules',
    definition:
      'An Iron Law is what must never be violated. A Rule is preferred behaviour that may be traded off. They are separate screens with different weight, and the compiler places laws above rules in every root instruction file.',
    press: 'Add iron law, or Add rule',
    body: [
      'A law is one or two imperative sentences, and what makes it a law rather than a rule is that it is defensible: a rationale, examples of compliance, counterexamples of violation, and what to do when it cannot be honoured. It has a severity — critical, high or medium — and a category, and it applies to every agent unless its scope names the agents and workflows it binds.',
      'Enforcement says how far the harness should go. Instruction is the persona, and every law gets that. Hook adds a check at the moment the agent wants to stop: on Claude Code and Codex it becomes a prompt hook in which a model reads the transcript against the laws marked for it and can send the agent back once with the reason; on Copilot it prints a reminder. Gate means a workflow gate refers to the law. Critical laws also go into Pi’s system prompt, the one place Pi lets a Blueprint speak first.',
      'A rule is guidance with a priority, and it can be scoped to paths. A rule with Applies to globs compiles to a path-scoped rule where the harness has one — .claude/rules/<id>.md with a paths list, a Copilot instructions file with applyTo — and, where it has none, to a nested AGENTS.md when the pattern is a plain directory, or inline with an "applies to" note when it is not.',
    ],
    fields: [
      {
        name: 'Rule',
        text: 'The law itself. Imperative, short, and checkable by reading a transcript.',
      },
      {
        name: 'Examples, Counterexamples',
        text: 'What compliance and violation look like. The judge in a hook reads these, so make them concrete.',
      },
      {
        name: 'If it cannot be honoured',
        text: 'The violation behaviour: say so, say why, say what would make it possible.',
      },
      {
        name: 'Severity',
        text: 'critical, high or medium. Critical is what the harness hears first; the evaluation weighs it most.',
      },
      {
        name: 'Enforcement',
        text: 'instruction, hook, gate — any combination. Each adapter uses what its harness supports and reports the rest.',
      },
      {
        name: 'Applies to',
        text: 'On a rule: the globs it is scoped to. Empty means everywhere.',
      },
    ],
    example: {
      path: 'blueprint/laws/never-fake-verification.md (shortened)',
      code: `---
name: Never Fake Verification
description: A claim that something builds, passes or works must come from an observed run.
rule: Never state that code compiles, tests pass, or a change works without having run the check and read its output in this session.
examples:
  - "Ran \`npm test\`: 128 passed, 0 failed."
  - I could not run the suite in this environment, so I have not verified the change.
counterexamples:
  - The tests should pass now.
violationBehavior: When verification cannot be performed, say so explicitly, say why, and say what would need to happen to verify it.
severity: critical
category: testing
enforcement:
  - instruction
  - hook
---`,
    },
    compiles: [
      {
        harness: 'Claude Code',
        output:
          'Laws and rules in CLAUDE.md; hook-enforced laws as a prompt hook on Stop in .claude/settings.json; path-scoped rules in .claude/rules/<id>.md. Native.',
      },
      {
        harness: 'Codex',
        output:
          'Laws and rules in AGENTS.md; hook-enforced laws in .codex/hooks.json; directory-scoped rules as a nested AGENTS.md.',
      },
      {
        harness: 'Copilot',
        output:
          'Laws and rules in AGENTS.md; hook-enforced laws as a reminder in .github/hooks/blueprint.json; path-scoped rules in .github/instructions/<id>.instructions.md.',
      },
      {
        harness: 'OpenCode, Pi',
        output:
          'Laws and rules in AGENTS.md, directory-scoped rules as a nested AGENTS.md; Pi puts critical laws in .pi/APPEND_SYSTEM.md. No hooks.',
      },
    ],
    shots: [
      {
        src: ironLawEditor,
        alt: 'The Never Fake Verification iron law open in the editor: the rule, its rationale, the field for what to do if it cannot be honoured, severity set to critical, category testing, and lists of examples and counterexamples.',
        caption:
          'The rationale and the counterexamples are what make it a law. Without them it is a rule with a stern voice.',
      },
    ],
  },
  {
    id: 'hook',
    title: 'Hooks',
    definition:
      'A hook is an automatic action bound to a harness lifecycle event: something that runs when a session starts, before or after a tool, after a file changes, or when the agent wants to stop. It is stored as YAML, because it has no prose.',
    press: 'Add hook',
    body: [
      'Trigger is the event. session-start, user-prompt, before-tool, after-tool, after-file-change, before-stop and subagent-stop are the ones on which a hook can refuse; after-tool-failure, subagent-start, before-compact and after-compact report something that already happened, so a hook on them can only observe. Only for files matching narrows a tool event to paths, natively where the harness can filter by path and by a note the command must honour where it cannot.',
      'Action is what runs. A command is one line; a script is a POSIX shell script for a check too long for one, shipped as a file beside the compiled hooks with a shebang added when the author left one out, and run in its place. run-tests, format, lint and secret-scan are commands with a meaning the evaluation can count; prompt-check and check-iron-laws are questions for a model rather than a shell. Run in background means nothing waits for it and it cannot block, whatever On failure says.',
      'On failure is what a failure means: block stops the action, warn lets it through with the output shown, return-to-agent hands the output back to fix. Claude Code and Codex read the verdict from the exit code, and only exit 2 refuses or reaches the model, while a command written for people exits 1 — so every command is wrapped: silent on success, the output on stderr with the code the outcome needs on failure. At the stop events the wrapper blocks once per turn; the second time the same check fails after the agent was sent back, it reports the failure instead, so a check the project cannot run does not stop every turn eight times over.',
      'A prompt hook — a prompt-check, or the laws marked for hook enforcement — is answered by a model that reads the hook’s input and replies ok or not, and its reason becomes the agent’s next instruction. The prompt is written for that judge, not for the agent: it says what counts as a violation and what does not, and it lets the agent go on the second time round.',
    ],
    fields: [
      {
        name: 'Trigger',
        text: 'The lifecycle event. after-file-change is the usual one for tests, formatting and linting.',
      },
      {
        name: 'Action',
        text: 'command, run-tests, format, lint, secret-scan, prompt-check or check-iron-laws. The first five need a command or a script.',
      },
      {
        name: 'Command, Script',
        text: 'One or the other, not both. A script becomes .claude/hooks/<id>.sh, .codex/hooks/<id>.sh or .github/hooks/scripts/<id>.sh.',
      },
      {
        name: 'Only for files matching',
        text: 'Globs. On before-tool and after-tool events the harness filters by them where it can.',
      },
      {
        name: 'On failure',
        text: 'block, warn or return-to-agent. Decides the exit code the wrapper uses and how the harness treats it.',
      },
      {
        name: 'Run in background',
        text: 'For logging and slow checks nobody needs the answer to. Reported where a harness has no background hooks.',
      },
    ],
    example: {
      path: 'blueprint/hooks/run-tests-after-change.yaml',
      code: `name: Run tests after change
description: Runs the test suite after every file change so a regression is caught in the same turn that caused it.
trigger: after-file-change
conditions:
  filePatterns:
    - "**/*"
action:
  type: run-tests
  command: npm test
  timeoutSec: 600
onFailure: return-to-agent`,
    },
    compiles: [
      {
        harness: 'Claude Code',
        output:
          'hooks in .claude/settings.json: session-start → SessionStart, user-prompt → UserPromptSubmit, before-tool → PreToolUse, after-tool → PostToolUse, after-file-change → PostToolUse on Edit|Write, before-stop → Stop, subagent-stop → SubagentStop. Prompt hooks are type: prompt. Native.',
      },
      {
        harness: 'Codex',
        output:
          '.codex/hooks.json with the same events, and hooks switched on in .codex/config.toml. Native.',
      },
      {
        harness: 'Copilot',
        output:
          '.github/hooks/blueprint.json. A prompt hook has no model to ask, so it prints its reminder instead.',
      },
      {
        harness: 'OpenCode, Pi',
        output:
          'Not emitted: each needs a TypeScript plugin or extension. The compatibility view says so, and the intent is written into the instructions.',
      },
    ],
    shots: [
      {
        src: hookEditor,
        alt: 'The Run tests after change hook open in the editor: Visual and YAML tabs, the path blueprint/hooks/run-tests-after-change.yaml, Trigger set to after-file-change with its explanation, Action set to run-tests, Command reading npm test, and an empty Script field.',
        caption:
          'Under each choice the form says what it means and what it costs — here, that run-tests counts as verification for the evaluation.',
      },
    ],
  },
  {
    id: 'gate',
    title: 'Gates',
    definition:
      'A gate is a checkpoint that decides whether a workflow may continue: allow, warn, block, or request human approval. It is defined once and referenced by the gate steps of any workflow.',
    press: 'Add gate, then a gate step in a workflow',
    body: [
      'A gate is a list of criteria, each with a kind — tests-pass, command, lint, security-scan, requirements-check, review, human-approval or custom — a description, and a command where one can be run. If it fails decides what a failed criterion does to the workflow.',
      'A gate with an executable criterion compiles to a Stop hook on Claude Code, Codex and Copilot: the agent may not finish while the command fails, with the same once-per-turn guard a hook gets. Everywhere, and for every criterion, the gate is written into the orchestration skill of each workflow that reaches it, so a review or an approval nobody can automate is still asked for at the right step. A gate no workflow refers to is an orphan, and the health bar says so.',
    ],
    fields: [
      {
        name: 'Criteria',
        text: 'What must hold. tests-pass and command are the ones the harness can run; review and human-approval are for people.',
      },
      {
        name: 'If it fails',
        text: 'allow, warn, block or request-approval. block is the default, because a gate that lets everything through is a comment.',
      },
    ],
    example: {
      path: 'blueprint/gates/tests-pass.yaml',
      code: `name: Tests must pass
description: The task is not complete until the suite runs green and the output has been read.
criteria:
  - kind: tests-pass
    description: Every test in the affected projects passes.
    command: npm test`,
    },
    compiles: [
      {
        harness: 'Claude Code, Codex, Copilot',
        output:
          'Executable criteria as a Stop hook; every criterion as instructions in the workflow skill. Native for what runs, adapted for the rest.',
      },
      {
        harness: 'OpenCode, Pi',
        output:
          'Instructions in the workflow skill only, and the compatibility view names the gate.',
      },
    ],
    shots: [
      {
        src: gateEditor,
        alt: 'The Tests must pass gate open in the editor: the path blueprint/gates/tests-pass.yaml, If it fails set to block, and one criterion of kind tests-pass with its description and the command npm test.',
        caption:
          'One criterion the harness can run. The workflow’s gate step refers to this by id, so one gate can guard several workflows.',
      },
    ],
  },
  {
    id: 'knowledge',
    title: 'Tools, References and Memory',
    definition:
      'A tool is a capability an agent can reach. A reference is deeper knowledge, kept apart from the concise skills. A memory definition is what an agent should keep across sessions, and at which scope.',
    press: 'Add tool, Add reference, or Add memory',
    body: [
      'A tool has a kind — filesystem, shell, git, browser, search, database, api, documentation, mcp or custom — and a free list of operations. The hosts a documentation tool declares are what net.docs allows. An MCP tool carries its server: the transport, the command or URL, and the names of the environment variables it needs — names only. A value never enters a Blueprint, so a token cannot reach an export, a push or a log by way of a tool.',
      'A reference is long-form: documentation, examples, domain knowledge, or a URL. A skill’s references ship inside the skill directory, where the harness loads them on demand; an agent’s references go in a references directory of their own and the root instruction file says where.',
      'A memory definition has a scope — stateless, session, project or persistent — the categories worth remembering, and a seed: the knowledge the agent starts with. Claude Code and Codex have memory, and the definition switches it on and seeds it; Copilot, OpenCode and Pi do not, and there the definition becomes an instruction to keep notes in the repository.',
    ],
    fields: [
      {
        name: 'Kind',
        text: 'On a tool: what it is. Decides which permissions apply to it and how it is configured.',
      },
      {
        name: 'Operations',
        text: 'What the tool is used for, in the agent’s words: build, test, format.',
      },
      {
        name: 'Scope',
        text: 'On a memory: how long it lives. project is the usual choice — what this codebase does its own way.',
      },
      {
        name: 'Seed',
        text: 'The memory’s body: what is known before the first session.',
      },
    ],
    example: {
      path: 'blueprint/tools/docs-server.yaml (an MCP tool; no starter ships one, so this is an example)',
      code: `name: Docs server
description: The team's documentation, over MCP.
kind: mcp
operations:
  - search
  - read
mcp:
  transport: stdio
  command: npx
  args:
    - -y
    - "@team/docs-mcp"
  envVars:
    - DOCS_TOKEN`,
    },
    compiles: [
      {
        harness: 'Claude Code',
        output:
          'MCP servers in .mcp.json; agent references in .claude/references/<id>.md, imported with @; the memory seed in CLAUDE.md, auto-memory on, and memory: project on subagents.',
      },
      {
        harness: 'Codex',
        output:
          'MCP servers and the memories feature in .codex/config.toml; references in .agents/references/; the seed in AGENTS.md.',
      },
      {
        harness: 'Copilot',
        output:
          '.vscode/mcp.json, which configures the editor only; references in .github/references/; no memory, so an instruction to keep notes.',
      },
      {
        harness: 'OpenCode',
        output:
          'mcp in opencode.json; references in .agents/references/, named in its instructions list so they always load; no memory, so an instruction to keep notes.',
      },
      {
        harness: 'Pi',
        output: 'References in .agents/references/; no memory, so an instruction to keep notes.',
      },
    ],
    shots: [],
  },
  {
    id: 'quality',
    title: 'Requirements and Scenarios',
    definition:
      'A requirement is a claim the Blueprint must satisfy, with declarative checks the validator runs. A scenario is a behavioural test case: an input and the behaviours expected of an agent. Neither is a runtime — the app never executes an agent.',
    press: 'Add requirement, or Add scenario',
    body: [
      'A requirement has a statement, a level — must or should — and checks. Seven kinds of check exist: a workflow has a step of a type, an iron law matches a pattern, a hook with a trigger or action exists, a gate with a criterion kind exists, an agent has a skill carrying a tag, some artifact mentions a pattern, and ai-judged, which is delegated to the evaluation’s second opinion and skipped without one. The evaluation reports each requirement satisfied, partial or not satisfied, and the Coverage dimension counts them.',
      'A scenario names the agent under test, the input, and the expected behaviours, each of which may carry a check of the same kinds. Its mode is manual or ai-judge; runtime is reserved for a simulation that would run through the harness, and the app does not pretend to it.',
    ],
    fields: [
      { name: 'Statement', text: 'The claim, in prose. The checks are how it is tested.' },
      {
        name: 'Level',
        text: 'must or should. A must that is not satisfied is an error in the evaluation; a should, a warning.',
      },
      {
        name: 'Expected behaviours',
        text: 'On a scenario: what the agent should do with the input, one line each, with a check where one can be written.',
      },
    ],
    example: {
      path: 'blueprint/requirements/verify-before-done.md',
      code: `---
name: Verify before reporting done
statement: The agent must run the tests and read the output before reporting a change as complete.
checks:
  - type: workflow-has-node-type
    nodeType: verification
  - type: gate-exists
    criterionKind: tests-pass
---`,
    },
    shots: [],
  },
  {
    id: 'ai',
    title: 'The assistant',
    definition:
      'The assistant is the AI in the app, and it proposes rather than edits. Every operation it offers returns a ChangeSet — the creates, updates and deletes it would make — shown field by field before anything is applied. Nothing a model writes reaches the Blueprint without your review, and nothing here is compiled: what the harness gets is the Blueprint.',
    press: 'AI, or Ctrl+/ — and Settings, to set the endpoint up',
    body: [
      'It talks to any endpoint that speaks the OpenAI chat protocol. Settings has a Provider list — OpenAI, the Anthropic compatibility endpoint, OpenRouter, Ollama, LM Studio, vLLM, Azure OpenAI, or a custom URL — then Base URL, Model and API key, and Save and test asks the endpoint two things: whether it answers, and whether it honours a JSON schema, which decides how structured output is requested from it. A model on your own machine works the same way; where the browser cannot reach it directly, the deployment’s proxy relays to allow-listed hosts only and logs nothing.',
      'Keep the key says where the key lives: until this tab closes, or in this browser after a warning that anyone with the profile can read it. It is read by one module, is never written into a Blueprint, an export, a push or a log, and Forget credentials clears it. Nothing else this app stores about a project knows the key exists.',
      'The panel offers what suits the selection and explains the rest. This artifact: the eight quick actions — improve, rewrite, more specific, add examples, add edge cases, add verification, simplify, make portable — Iron Laws for it, and a workflow for an agent. The Blueprint: Add a capability, which writes an agent with its skills, laws and workflow wired to what is already there; Draft the whole Blueprint; one new artifact; and Compound, which turns pasted notes, a transcript or a diff into skills, laws and references. Review: contradictions, what is missing, and quality, whose findings are badged AI beside the validator’s own. Fix with AI sits on any finding.',
      'Every proposal goes through one review. First the summary, then what the operation could not honour — an artifact that would not parse, a reference to nothing, a duplicate law — because a review you believe covered everything must have. Then one row per change, marked + ~ −, showing only the fields whose value differs, word by word for short prose. Accept all, reject all, accept one, edit the proposal as the file it would become, regenerate, or apply exactly what you accepted with Ctrl+Enter. Output that looks like a secret is refused before it can enter a change.',
    ],
    fields: [
      {
        name: 'Provider',
        text: 'Eight presets and custom. Each knows its base URL, its auth header and whether JSON schema works there.',
      },
      {
        name: 'Save and test',
        text: 'Stores the settings and probes the endpoint. The result says what the model supports and how long it took.',
      },
      {
        name: 'Keep the key',
        text: 'Until this tab closes, or in this browser. The second comes with a warning, and the choice is per key.',
      },
      {
        name: 'Quick actions',
        text: 'One-click improvements to the selected artifact. Each is a versioned prompt that carries the concept glossary, so a skill stays a skill.',
      },
      {
        name: 'Apply',
        text: 'Applies the accepted rows and no others. Rejected rows are listed afterwards with the reason.',
      },
    ],
    shots: [
      {
        src: settingsAi,
        alt: 'The AI endpoint card in Settings: Provider set to OpenAI, Base URL https://api.openai.com/v1, Model gpt-5-mini, a Stream the answer checkbox, a silence timeout in seconds, an empty API key field, Keep the key set to "Until this tab closes", and a Save and test button.',
        caption:
          'The endpoint is any URL that speaks the protocol. The key field is empty here, and it stays out of every file this app writes.',
      },
    ],
  },
  {
    id: 'targets',
    title: 'Targets, and where everything lands',
    definition:
      'A compile target is one harness, switched on or off, with its options. Each adapter maps every concept its harness can express and reports the rest as a compatibility issue naming what was lost and where the intent was written instead.',
    press: 'Compatibility, then a harness under Compile targets',
    body: [
      'By default a target compiles into the root of the repository — CLAUDE.md and .claude/ for Claude Code, AGENTS.md and .agents/ for the rest — so the repository is directly usable and can be an existing codebase. Claude Code, Codex and Copilot can instead be packaged as a plugin: a plugins/<harness>/ directory with a manifest and a marketplace file, installed into any project rather than living in one. Package for … as a plugin is the switch, under Packaging, and the push dialog says how to install what it pushed.',
      'The compiler owns what it writes. blueprint/build-manifest.json lists every path it generated with its hash, so a re-export removes what it no longer produces and never touches a file it did not create. Same input, identical bytes: no timestamps, no random ids, and a stable order everywhere.',
      'The compatibility view is the contract. Native means the harness has the concept; adapted, that it was expressed another way — a workflow as a skill; limited, that part of it was lost and reported; unsupported, that the intent was written into the instructions and nothing enforces it.',
    ],
    fields: [],
    compiles: [
      {
        harness: 'Claude Code',
        output:
          'CLAUDE.md · .claude/rules/ · .claude/skills/ · .claude/agents/ · .claude/settings.json (hooks, permissions) · .claude/hooks/ · .mcp.json',
      },
      {
        harness: 'Codex',
        output:
          'AGENTS.md · .agents/skills/ · .codex/agents/ · .codex/config.toml · .codex/hooks.json · .codex/hooks/',
      },
      {
        harness: 'Copilot',
        output:
          'AGENTS.md · .github/copilot-instructions.md · .github/skills/ · .github/agents/ · .github/prompts/ · .github/instructions/ · .github/hooks/ · .vscode/mcp.json',
      },
      {
        harness: 'OpenCode',
        output:
          'AGENTS.md · .agents/skills/ · .opencode/agents/ · .opencode/commands/ · opencode.json',
      },
      {
        harness: 'Pi',
        output:
          'AGENTS.md · .agents/skills/ · .pi/prompts/ · .pi/settings.json · .pi/APPEND_SYSTEM.md',
      },
    ],
    shots: [],
  },
  {
    id: 'github',
    title: 'GitHub',
    definition:
      'GitHub is where a Blueprint goes to be used. A push writes the source directory and the compiled output to a branch in one commit, after showing what it would do; a repository’s blueprint/ opens back as a project. Both need a token, and the token is kept where the AI key is.',
    press: 'GitHub in the top bar, or Open from GitHub on the dashboard',
    body: [
      'A personal access token pasted into Settings is checked with Save and check: the app asks GitHub who the token is before storing anything, and shows the account and what kind of token it is. Sign in with GitHub appears when the deployment registered an OAuth app; the token still ends up in the browser and nowhere else — never in a cookie, never in a URL, never on the server after the request. It lives beside the AI key, for this tab or for this browser after the warning, and Forget credentials clears both.',
      'Push to GitHub is two steps, and the second is a preview. Choose a repository — one the token can reach, a URL, or a name that does not exist yet, which is created empty and private so the Blueprint is its first commit — and a branch, which the push creates when it is missing. Preview the changes then shows the plan before anything else can be pressed: every path that would be added, changed or removed, tagged in the colours a diff reads by; the compiler errors that block, because files compiled from a Blueprint the validator rejects would misrepresent it; the files on the branch this app did not write, skipped unless each is ticked; and anything shaped like a credential, which blocks until each is accepted.',
      'The push is one tree, one commit and one move of the branch, never forced: a branch that moved while the preview was open is a conversation, not a race to win. A second push of an unchanged project says there is nothing to do. When a target was packaged as a plugin, the panel afterwards shows the install commands with the repository filled in, and the README that went up carries the same.',
      'Open from GitHub reads a repository’s blueprint/ directory and hands it to the import preview a ZIP goes through: the same reader, the same diagnostics, and nothing stored until Open is pressed. Only the source is read — everything at the root is compiler output and is rebuilt the moment the project opens.',
    ],
    fields: [
      {
        name: 'Save and check',
        text: 'Proves the token against the API before it is stored, so a typo fails here rather than mid-push.',
      },
      {
        name: 'Repository, Branch',
        text: 'Where the commit goes. Both can be new; a new repository is private by default.',
      },
      {
        name: 'Preview the changes',
        text: 'The plan: new, changed and removed paths, the blocking errors, the files not owned, and anything credential-shaped.',
      },
      {
        name: 'Files this app did not write',
        text: 'Left alone unless ticked. A README the branch had before the first push is one of them.',
      },
    ],
    example: {
      path: 'README.md of the pushed repository, when Claude Code was packaged as a plugin',
      code: `## Installing

**Claude Code:**

\`\`\`
/plugin marketplace add <owner>/<repo>
/plugin install dotnet-testing-expert@dotnet-testing-expert
\`\`\``,
    },
    shots: [
      {
        src: settingsGithub,
        alt: 'The GitHub card in Settings: a Personal access token field with a note on which scopes a fine-grained and a classic token need, a Save and check button, and beneath it a Forget credentials button.',
        caption:
          'A pushed repository fills the placeholders in: the README and the success panel both name the real owner and repository.',
      },
    ],
  },
]

export function Tutorial() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-10 px-6 py-10">
      <PageHeader
        title="How it works"
        description="From an empty browser to a repository your harness can read — and what each part of it is."
      />

      {/* The contents stay beside the text on a wide screen and at its top on a narrow one;
          both mark the section the reader is in. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <TutorialNav
          groups={[
            { id: 'loop', title: 'The loop', items: STEPS },
            { id: 'parts', title: 'The parts', items: CONCEPTS },
          ]}
        />

        {/* A landmark of its own: this route is one long read, and a screen reader should be
            able to skip the header and get to it. */}
        <main className="flex min-w-0 flex-1 flex-col gap-12">
          <section className="flex max-w-2xl flex-col gap-4">
            <p className="text-sm leading-relaxed">
              A <strong>Blueprint</strong> is the design of an agent system — its agents, the skills
              they can reach, the workflows they follow, and the laws they may not break — kept in
              one place and compiled into whatever each harness wants to read. The first half of
              this page walks the whole of it once. The second takes the parts one at a time — every
              kind of artifact, then the assistant and GitHub: what each one is, which settings
              matter, how to add one, and what the compiler makes of it. Every picture is of the
              real app, taken by a script, so none of them can be out of date.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="accent" asChild>
                <Link href="/new">Create a Blueprint</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">Open a starter instead</Link>
              </Button>
            </div>
          </section>

          <section aria-labelledby="loop" className="flex flex-col gap-8">
            <div className="flex max-w-2xl flex-col gap-2">
              <h2
                id="loop"
                className="scroll-mt-16 text-xl font-semibold tracking-tight lg:scroll-mt-6"
              >
                The loop
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Eleven steps from nothing to a repository. Each one names the control to press
                before it says what happens.
              </p>
            </div>

            <ol className="flex flex-col gap-12">
              {STEPS.map((step, index) => (
                <li
                  key={step.id}
                  id={step.id}
                  className="flex scroll-mt-16 flex-col gap-4 lg:scroll-mt-6"
                >
                  <div className="flex max-w-2xl flex-col gap-2">
                    <h3 className="flex items-baseline gap-2.5 text-lg font-semibold tracking-tight">
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {index + 1}
                      </span>
                      {step.title}
                    </h3>
                    <Press>{step.press}</Press>
                    <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
                  </div>

                  {step.shots.map((shot) => (
                    <Figure key={shot.alt} shot={shot} />
                  ))}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="parts" className="flex flex-col gap-8 border-t pt-10">
            <div className="flex max-w-2xl flex-col gap-2">
              <h2
                id="parts"
                className="scroll-mt-16 text-xl font-semibold tracking-tight lg:scroll-mt-6"
              >
                The parts
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                The loop uses every kind of artifact once and says nothing about what is inside one.
                This is the inside: the definition each kind answers to, the settings on its form
                and what they decide, the file the project writes for it, and what each harness
                gets. The vocabulary is the one the product fixes; a skill is never a rule and a
                permission is never a tool.
              </p>
            </div>

            <ol className="flex flex-col gap-14">
              {CONCEPTS.map((concept) => (
                <li
                  key={concept.id}
                  id={concept.id}
                  className="flex scroll-mt-16 flex-col gap-4 lg:scroll-mt-6"
                >
                  <div className="flex max-w-2xl flex-col gap-2">
                    <h3 className="text-lg font-semibold tracking-tight">{concept.title}</h3>
                    <p className="text-sm leading-relaxed">{concept.definition}</p>
                    <Press>{concept.press}</Press>
                    {concept.body.map((paragraph) => (
                      <p key={paragraph} className="text-muted-foreground text-sm leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  {concept.fields.length > 0 ? (
                    <dl className="grid max-w-2xl gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                      {concept.fields.map((field) => (
                        <div key={field.name} className="contents">
                          <dt className="font-medium">{field.name}</dt>
                          <dd className="text-muted-foreground leading-relaxed">{field.text}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {concept.shots.map((shot) => (
                    <Figure key={shot.alt} shot={shot} />
                  ))}

                  {concept.example ? (
                    <figure className="flex max-w-2xl flex-col gap-2">
                      <figcaption className="text-muted-foreground font-mono text-xs">
                        {concept.example.path}
                      </figcaption>
                      {/* Scrollable, so it must take focus for a keyboard to scroll it; the path is its name. */}
                      <pre
                        tabIndex={0}
                        aria-label={concept.example.path}
                        className="bg-muted overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed"
                      >
                        <code>{concept.example.code}</code>
                      </pre>
                    </figure>
                  ) : null}

                  {concept.compiles ? (
                    <div className="max-w-2xl overflow-x-auto">
                      <table className="w-full text-sm">
                        <caption className="text-muted-foreground pb-2 text-left text-xs">
                          What it compiles to
                        </caption>
                        <thead>
                          <tr className="text-muted-foreground border-b text-left text-xs">
                            <th scope="col" className="py-1 pr-4 font-medium">
                              Harness
                            </th>
                            <th scope="col" className="py-1 font-medium">
                              Output
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {concept.compiles.map((row) => (
                            <tr key={row.harness} className="border-b align-top last:border-0">
                              <th
                                scope="row"
                                className="py-1.5 pr-4 text-left font-medium whitespace-nowrap"
                              >
                                {row.harness}
                              </th>
                              <td className="text-muted-foreground py-1.5 leading-relaxed">
                                {row.output}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <footer className="flex flex-col gap-3 border-t pt-6">
            <p className="text-muted-foreground max-w-2xl text-sm">
              That is the whole loop, and every part of it. Everything else in the product is a
              shorter way to do one of these: the command palette (Ctrl+K) reaches every action by
              name, and each artifact is addressable, so a link to one opens on it. The full field
              tables, the diagnostic codes and each harness&apos;s file conventions are in the docs
              directory of the repository.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="accent" asChild>
                <Link href="/new">Create a Blueprint</Link>
              </Button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

/** The control to use, set off from the prose so it can be found by scanning. */
function Press({ children }: { children: string }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">Press </span>
      <span className="bg-muted rounded px-1.5 py-0.5 font-medium">{children}</span>
    </p>
  )
}

function Figure({ shot }: { shot: Shot }) {
  return (
    <figure className="flex flex-col gap-2">
      <Image
        src={shot.src}
        alt={shot.alt}
        sizes="(max-width: 1152px) 100vw, 1152px"
        className="rounded-lg border"
      />
      <figcaption className="text-muted-foreground max-w-2xl text-xs">{shot.caption}</figcaption>
    </figure>
  )
}
