/**
 * The tutorial (P9-06).
 *
 * The product explains itself to someone who already knows what a Blueprint is. This walks
 * the story in docs/00 for someone who does not: what to press, what happens, and a picture
 * of it having happened.
 *
 * Every picture comes from `pnpm --filter web screenshots`, which drives the real app. That
 * is the whole point of generating them: a page that has changed cannot leave a picture of
 * the old one behind here. A shot this page needs and the script does not take is added to
 * the script — never captured by hand.
 *
 * It is a server component, and reads nothing: someone who has never created a project is
 * exactly who it is for, so it must not depend on there being one.
 */
import type { StaticImageData } from 'next/image'
import Image from 'next/image'
import Link from 'next/link'

import assistant from '@/assets/screenshots/assistant.png'
import artifactEditor from '@/assets/screenshots/artifact-editor.png'
import compatibility from '@/assets/screenshots/compatibility.png'
import dashboard from '@/assets/screenshots/dashboard.png'
import evaluation from '@/assets/screenshots/evaluation.png'
import exportView from '@/assets/screenshots/export-view.png'
import github from '@/assets/screenshots/github.png'
import healthFindings from '@/assets/screenshots/health-findings.png'
import newProject from '@/assets/screenshots/new-project.png'
import overviewGraph from '@/assets/screenshots/overview-graph.png'
import sourceTab from '@/assets/screenshots/source-tab.png'
import templateReview from '@/assets/screenshots/template-review.png'
import workflowEditor from '@/assets/screenshots/workflow-editor.png'
import workspace from '@/assets/screenshots/workspace.png'

import { PageHeader } from '@/components/layout/page-header'
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

export function Tutorial() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-10 px-6 py-10">
      <PageHeader
        title="How it works"
        description="From an empty browser to a repository your harness can read."
      />

      {/* A landmark of its own: this route is one long read, and a screen reader should be
          able to skip the header and get to it. */}
      <main className="flex flex-col gap-10">
        <section className="flex max-w-2xl flex-col gap-4">
          <p className="text-sm leading-relaxed">
            A <strong>Blueprint</strong> is the design of an agent system — its agents, the skills
            they can reach, the workflows they follow, and the laws they may not break — kept in one
            place and compiled into whatever each harness wants to read. This page walks the whole
            of it once. Every picture is of the real app, taken by a script, so none of them can be
            out of date.
          </p>
          <nav aria-label="Steps" className="flex flex-wrap gap-1.5">
            {STEPS.map((step, index) => (
              <a
                key={step.id}
                href={`#${step.id}`}
                className="hover:border-accent hover:text-accent rounded-md border px-2 py-1 text-xs transition-colors"
              >
                <span className="text-muted-foreground mr-1.5 tabular-nums">{index + 1}</span>
                {step.title}
              </a>
            ))}
          </nav>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" asChild>
              <Link href="/new">Create a Blueprint</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Open a starter instead</Link>
            </Button>
          </div>
        </section>

        <ol className="flex flex-col gap-12">
          {STEPS.map((step, index) => (
            <li key={step.id} id={step.id} className="flex scroll-mt-6 flex-col gap-4">
              <div className="flex max-w-2xl flex-col gap-2">
                <h2 className="flex items-baseline gap-2.5 text-lg font-semibold tracking-tight">
                  <span className="text-muted-foreground text-sm tabular-nums">{index + 1}</span>
                  {step.title}
                </h2>
                <p className="text-sm">
                  <span className="text-muted-foreground">Press </span>
                  <span className="bg-muted rounded px-1.5 py-0.5 font-medium">{step.press}</span>
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
              </div>

              {step.shots.map((shot) => (
                <figure key={shot.alt} className="flex flex-col gap-2">
                  <Image
                    src={shot.src}
                    alt={shot.alt}
                    sizes="(max-width: 1152px) 100vw, 1152px"
                    className="rounded-lg border"
                  />
                  <figcaption className="text-muted-foreground max-w-2xl text-xs">
                    {shot.caption}
                  </figcaption>
                </figure>
              ))}
            </li>
          ))}
        </ol>

        <footer className="flex flex-col gap-3 border-t pt-6">
          <p className="text-muted-foreground max-w-2xl text-sm">
            That is the whole loop. Everything else in the product is a shorter way to do one of
            these: the command palette (Ctrl+K) reaches every action by name, and each artifact is
            addressable, so a link to one opens on it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" asChild>
              <Link href="/new">Create a Blueprint</Link>
            </Button>
          </div>
        </footer>
      </main>
    </div>
  )
}
