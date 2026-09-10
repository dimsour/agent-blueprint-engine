/**
 * Every diagnostic code the core emits, in one place.
 *
 * A code is a promise: it always means the same thing, so a user can silence one, search for
 * one, or link to one. This catalogue is the source of that promise. `tests/docs.test.ts`
 * fails if a code here is missing from docs/05-validation-evaluation.md, and rules are only
 * allowed to emit codes listed here.
 *
 * Each entry carries two sentences of prose as well, and they do different jobs. `summary`
 * says what the code means in general — the message on a finding says what it means *here*,
 * naming the artifact. `remedy` says what to do about it, which is the half a message can
 * never carry: a finding has to stay one line, and "how do I fix this" is a paragraph.
 * Both are shown by the app (docs/07), which is why they are written for a reader rather
 * than for a maintainer.
 */
import type { DiagnosticSeverity } from './types'

export interface DiagnosticCode {
  code: string
  /** Severity the code is normally emitted with; a few vary with context. */
  severity: DiagnosticSeverity | 'varies'
  /** What it means, in one line. Shown in the UI next to the finding. */
  summary: string
  /**
   * What to do about it. Written as instructions to the person reading the finding, naming
   * the control that does the work where there is one, and saying why it matters where the
   * cost of ignoring it is not obvious.
   */
  remedy: string
  /** Where it comes from: validation runs on every edit, evaluation only when scoring. */
  source: 'project' | 'validation' | 'evaluation'
}

export const DIAGNOSTIC_CODES: readonly DiagnosticCode[] = [
  // Reading a project from disk
  {
    code: 'BP-PROJECT-002',
    severity: 'error',
    summary: 'An artifact listed in the manifest has no file.',
    remedy:
      'Restore the missing file, or remove the id from the manifest’s artifact list. The artifact was skipped, so anything that refers to it will also report a broken reference until one of the two is done.',
    source: 'project',
  },
  {
    code: 'BP-PROJECT-003',
    severity: 'error',
    summary: 'An artifact file could not be parsed or is invalid.',
    remedy:
      'The message lists the fields that failed. Open the artifact’s Source tab and fix them there: it shows the project file itself, which is what failed to parse.',
    source: 'project',
  },
  {
    code: 'BP-PROJECT-004',
    severity: 'warning',
    summary: 'An artifact file exists but is not listed in the manifest.',
    remedy:
      'Save the project. The writer lists every artifact it holds, so one save adopts the stray file. Delete the file instead if it was not meant to be there.',
    source: 'project',
  },
  {
    code: 'BP-PROJECT-005',
    severity: 'info',
    summary: 'Unknown keys in an artifact file were preserved under metadata.',
    remedy:
      'Nothing was lost — the keys were kept under `metadata` and will be written back. Remove them from the Source tab if they were a typo, or leave them if they are yours.',
    source: 'project',
  },
  {
    code: 'BP-PROJECT-006',
    severity: 'info',
    summary: 'The manifest names a different source directory than the one read.',
    remedy: 'Save the project. The manifest is rewritten with the directory it was read from.',
    source: 'project',
  },

  // Structure
  {
    code: 'BP-ID-001',
    severity: 'error',
    summary: 'Two entities of the same kind share an id.',
    remedy:
      'Rename one of them with Rename in the inspector, which updates every reference at the same time. Changing the id by hand leaves the references pointing at the old one.',
    source: 'validation',
  },
  {
    code: 'BP-ID-002',
    severity: 'error',
    summary: 'An entity id is not a valid slug.',
    remedy:
      'Rename it to lower-case words joined by single hyphens, at most 64 characters — `react-testing`, not `React Testing`. The limit is the Agent Skills spec’s, and the id is also the filename.',
    source: 'validation',
  },
  {
    code: 'BP-REF-001',
    severity: 'error',
    summary: 'A reference points at an entity that does not exist.',
    remedy:
      'Either create the artifact being referred to or remove the reference; the inspector offers both from the finding. This usually follows an id edited by hand — use Rename, which carries the references with it.',
    source: 'validation',
  },
  {
    code: 'BP-DESC-001',
    severity: 'warning',
    summary: 'An agent, skill, workflow, law, gate or hook has no description.',
    remedy:
      'Write one sentence in the Description field. It is not decoration: every harness chooses which skill to activate and which subagent to call by reading descriptions, so an artifact without one is never chosen.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-001',
    severity: 'warning',
    summary: 'An agent states no responsibilities.',
    remedy:
      'List what the agent is answerable for, one line each. They also feed the coverage check, so an agent with none can never be reported as missing a skill it needs.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-002',
    severity: 'warning',
    summary: 'Several agents and no primary agent chosen.',
    remedy:
      'Choose the primary agent in the Blueprint’s settings. Its persona becomes the root instruction file — CLAUDE.md, AGENTS.md — and the others compile to subagents. Left unset, the first agent is used, which may not be the one you meant.',
    source: 'validation',
  },
  {
    code: 'BP-WF-001',
    severity: 'error',
    summary: 'A workflow has no usable entry node.',
    remedy:
      'Add a Start step if there is none, then select it and press “Set as entry”. The message names a start step already in the graph when there is one to point at.',
    source: 'validation',
  },
  {
    code: 'BP-WF-002',
    severity: 'warning',
    summary: 'A workflow has no end node.',
    remedy:
      'Add an End step and connect the last step to it. Without one, nothing says where the workflow finishes and the compiled instructions run on past it.',
    source: 'validation',
  },
  {
    code: 'BP-WF-003',
    severity: 'error',
    summary: 'An edge points at a node that does not exist.',
    remedy:
      'Select the connection and delete it, or redraw it to a step that exists. It usually appears after a step was removed in the Source tab rather than on the canvas.',
    source: 'validation',
  },
  {
    code: 'BP-WF-004',
    severity: 'error',
    summary: 'Two nodes in one workflow share an id.',
    remedy:
      'Rename one of the two steps. While both exist, every connection between them is ambiguous and the compiled order is undefined.',
    source: 'validation',
  },
  {
    code: 'BP-WF-005',
    severity: 'warning',
    summary: 'A node has no agent, skill, gate or tool assigned.',
    remedy:
      'Select the step and choose what it runs in the step panel. A step with nothing assigned compiles to an instruction with no subject.',
    source: 'validation',
  },
  {
    code: 'BP-SKILL-001',
    severity: 'warning',
    summary: 'A skill description exceeds the Agent Skills limit of 1024 characters.',
    remedy:
      'Shorten the description and move the detail into the body. The limit is the Agent Skills spec’s, so it is the harness that will reject this, not the app.',
    source: 'validation',
  },
  {
    code: 'BP-TARGET-001',
    severity: 'info',
    summary: 'No export target is enabled.',
    remedy:
      'Enable at least one harness in the Compatibility view. Until then there is nothing to compile, and the Export view has nothing to show.',
    source: 'validation',
  },
  {
    code: 'BP-TARGET-002',
    severity: 'error',
    summary: 'The same harness is configured twice.',
    remedy:
      'Remove the duplicate in the Compatibility view. Two entries for one harness would compile the same paths twice, with the second silently winning.',
    source: 'validation',
  },
  {
    code: 'BP-LAW-001',
    severity: 'warning',
    summary: 'A scoped law or rule lists no agents or workflows, so it applies to nothing.',
    remedy:
      'Either name the agents and workflows it governs, or set it to apply to everything. As it stands it is scoped to nothing and reaches no compiled file.',
    source: 'validation',
  },

  // Semantics
  {
    code: 'BP-WF-010',
    severity: 'warning',
    summary: 'A workflow node cannot be reached from the entry node.',
    remedy:
      'Connect it to something that leads back to the entry step, or delete it. A step nothing reaches is still written into the compiled instructions, where it reads as work that should happen and never does.',
    source: 'validation',
  },
  {
    code: 'BP-WF-011',
    severity: 'warning',
    summary: 'A workflow reaches its end without verifying anything.',
    remedy:
      'Add a Verification, Gate, Review or Human approval step before the end. Without one, the only evidence the work was done is the agent saying so.',
    source: 'validation',
  },
  {
    code: 'BP-WF-012',
    severity: 'warning',
    summary: 'A parallel node has one branch, or a merge node has one input.',
    remedy:
      'A Parallel step needs at least two outgoing connections and a Merge at least two incoming, or it is an ordinary step wearing the wrong label. Add the missing branch, or change the step type.',
    source: 'validation',
  },
  {
    code: 'BP-WF-013',
    severity: 'warning',
    summary: 'A non-end node has no outgoing edge, so the workflow stops there.',
    remedy:
      'Connect the step to whatever comes next, or make it an End step. As drawn, the workflow halts here without ever saying it finished.',
    source: 'validation',
  },
  {
    code: 'BP-WF-014',
    severity: 'info',
    summary: 'A loop has no retry edge or attempt limit.',
    remedy:
      'Give the loop a way out: mark the connection that closes it as a retry, or set an attempt limit on a Retry step. Otherwise the compiled instructions describe a loop with no end condition.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-010',
    severity: 'warning',
    summary: 'Nothing can invoke this agent.',
    remedy:
      'No workflow step runs it, it is not the primary agent, and no other agent may delegate to it. Use it in a workflow, name it as a delegation target, or delete it.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-011',
    severity: 'warning',
    summary: 'A responsibility is not covered by any of the agent’s skills.',
    remedy:
      'The agent claims this responsibility and none of its skills mention it. Either give it a skill that covers the work, or reword the responsibility to match a skill it already has.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-012',
    severity: 'info',
    summary: 'An agent has tools but no permissions, so harness defaults apply.',
    remedy:
      'The agent has tools but decides nothing about what it may do with them, so each harness applies its own defaults — and they differ. Set the permissions to make the answer the same everywhere.',
    source: 'validation',
  },
  {
    code: 'BP-SKILL-010',
    severity: 'warning',
    summary: 'A skill has no activation conditions and no owner.',
    remedy:
      'Nothing can bring this skill in. Give it activation conditions — file patterns, intents, agent roles — or attach it to an agent or a workflow step.',
    source: 'validation',
  },
  {
    code: 'BP-SKILL-011',
    severity: 'info',
    summary: 'A skill has no Verification section.',
    remedy:
      'Add a `## Verification` section saying how the agent knows the skill worked. It is what separates a skill that claims success from one that can show it.',
    source: 'validation',
  },
  {
    code: 'BP-HOOK-010',
    severity: 'info',
    summary: 'A hook runs a command action but has no command.',
    remedy:
      'Fill in the command the hook should run, or change its action to one that does not need a command. As it stands the hook compiles to nothing.',
    source: 'validation',
  },
  {
    code: 'BP-GATE-010',
    severity: 'warning',
    summary: 'A gate used by a workflow has no criteria.',
    remedy:
      'A workflow stops at this gate and the gate checks nothing, so it always passes. Add at least one criterion — tests, a command, a review, an approval.',
    source: 'validation',
  },
  {
    code: 'BP-LAW-010',
    severity: 'warning',
    summary: 'Two Iron Laws oblige opposite things about the same subject.',
    remedy:
      'Whichever the agent reads last will win, which is not a decision anyone made. Reword one of them, narrow their scopes so they never both apply, or delete the one you no longer mean.',
    source: 'validation',
  },
  {
    code: 'BP-LAW-011',
    severity: 'info',
    summary: 'A law marked for gate enforcement has no gate that checks it.',
    remedy:
      'The law says it should be enforced at a gate, and no gate mentions it. Add a criterion to the gate that should check it, or drop `gate` from the law’s enforcement so the Blueprint stops claiming a check it does not have.',
    source: 'validation',
  },
  {
    code: 'BP-CONTRA-001',
    severity: 'warning',
    summary: 'Two artifacts tell the agent opposite things about the same subject.',
    remedy:
      'Read both — the finding names them — then change one, or scope them so they never apply at the same time. This is a heuristic over the wording: if they do not really conflict, rephrasing either sentence clears it.',
    source: 'validation',
  },

  // Orphans, one code per kind
  {
    code: 'BP-ORPHAN-001',
    severity: 'warning',
    summary: 'Nothing uses this skill.',
    remedy:
      'Attach it to an agent or a workflow step, or give it activation conditions so a harness can find it on its own. If it is genuinely unused, delete it: it still compiles into the harness files, where it is context the agent reads and never needs.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-002',
    severity: 'warning',
    summary: 'Nothing uses this workflow.',
    remedy:
      'Give the workflow to an agent, trigger it from another workflow, or delete it. It compiles to an orchestration skill either way, so an unused one is instructions nobody follows.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-003',
    severity: 'warning',
    summary: 'Nothing uses this Iron Law.',
    remedy:
      'Scope the law to the agents or workflows it should govern, or set it to apply to everything. A law nobody is subject to changes no behaviour.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-004',
    severity: 'warning',
    summary: 'Nothing uses this rule.',
    remedy:
      'Scope the rule to the agents or workflows it should guide, set it to apply to everything, or give it path patterns so it applies to the files it is about.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-005',
    severity: 'warning',
    summary: 'Nothing uses this gate.',
    remedy:
      'Use the gate from a workflow step, or delete it. A gate no workflow stops at never runs.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-006',
    severity: 'warning',
    summary: 'Nothing uses this tool.',
    remedy:
      'Give the tool to the agents that need it or to a workflow step, or delete it. An unused tool still appears in the compiled permissions, which widens what the agent may do for no reason.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-007',
    severity: 'warning',
    summary: 'Nothing uses this reference.',
    remedy:
      'Attach the reference to the agent or skill that should read it, or delete it. References are copied into the compiled output, so an unused one is bytes the agent pays for.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-008',
    severity: 'warning',
    summary: 'Nothing uses this memory definition.',
    remedy:
      'Attach it to the agent whose knowledge it is, or delete it. Memory seeds only reach a harness through the agent that holds them.',
    source: 'validation',
  },

  // Requirements
  {
    code: 'BP-REQ-001',
    severity: 'varies',
    summary: 'A requirement is not satisfied: error for must, warning for should.',
    remedy:
      'Open the requirement to see its checks. Each one looks for something specific — an artifact of a kind, a tag, a phrase in a body — and none of them found it. Either build what the requirement asks for, or, if the Blueprint already does this another way, change the check to look for what is actually there. A check that can never pass is worse than no check, because it reports a gap that does not exist.',
    source: 'validation',
  },
  {
    code: 'BP-REQ-002',
    severity: 'warning',
    summary: 'A requirement is only partly satisfied.',
    remedy:
      'Some checks passed and some did not; the evaluation view lists which. Take the failed ones one at a time — either add what the check looks for, or correct a check that is looking for the wrong thing.',
    source: 'validation',
  },
  {
    code: 'BP-REQ-003',
    severity: 'info',
    summary: 'A requirement has no checks, so it cannot be verified automatically.',
    remedy:
      'The requirement is prose, so nothing can confirm it. Add a check in the requirement editor — the kinds available are listed there — or accept that this one is verified by reading.',
    source: 'validation',
  },
  {
    code: 'BP-REQ-004',
    severity: 'info',
    summary: 'A requirement can only be judged by a model, and no AI is configured.',
    remedy:
      'Set up an endpoint in Settings, then press “Run AI analysis” in the evaluation view. Until then the check is skipped rather than failed, so the score does not hold it against you.',
    source: 'validation',
  },
  {
    code: 'BP-REQ-005',
    severity: 'warning',
    summary: 'A requirement check could not run, for example an invalid regular expression.',
    remedy:
      'The check itself is broken, not the Blueprint. The message says which check and why; open the requirement and fix it there.',
    source: 'validation',
  },

  // Compilation, emitted by @agent-blueprint/exporters
  {
    code: 'BP-TARGET-003',
    severity: 'error',
    summary: 'Target options are invalid; the target was skipped.',
    remedy:
      'The options failed the adapter’s own schema, so nothing was compiled for this harness. The message lists the fields; correct them in the Compatibility view.',
    source: 'validation',
  },
  {
    code: 'BP-COMPILE-001',
    severity: 'error',
    summary: 'Two adapters produce different content for the same path.',
    remedy:
      'Two harnesses want to write different things to one file. Rename one of the artifacts behind it, or turn one of the two targets off.',
    source: 'validation',
  },
  {
    code: 'BP-PORT-001',
    severity: 'warning',
    summary: 'A feature the Blueprint uses is unsupported on an enabled target.',
    remedy:
      'This harness cannot express the feature at all, so it will be missing from that target’s output. Stop relying on it, accept the loss knowingly, or turn the target off. The Compatibility view shows what every harness can and cannot do.',
    source: 'validation',
  },
  {
    code: 'BP-PORT-002',
    severity: 'info',
    summary: 'A feature is adapted or limited on an enabled target.',
    remedy:
      'The feature survives, but not natively — usually as instructions rather than as something the harness enforces. The message carries the adapter’s own explanation; read it before assuming the compiled output behaves identically.',
    source: 'validation',
  },
  {
    code: 'BP-CLAUDE-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    remedy:
      'Both compile to a skill directory of the same name, so one would overwrite the other. Rename either of them from the inspector.',
    source: 'validation',
  },
  {
    code: 'BP-CODEX-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    remedy:
      'Both compile to a skill directory of the same name, so one would overwrite the other. Rename either of them from the inspector.',
    source: 'validation',
  },
  {
    code: 'BP-CODEX-002',
    severity: 'warning',
    summary: 'AGENTS.md exceeds the Codex instruction budget.',
    remedy:
      'Codex reads only the first 32 KiB by default, so the end of the file is silently ignored. Move detail out of personas and laws into skills, which are loaded on demand rather than always.',
    source: 'validation',
  },
  {
    code: 'BP-COPILOT-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    remedy:
      'Both compile to a skill directory of the same name, so one would overwrite the other. Rename either of them from the inspector.',
    source: 'validation',
  },
  {
    code: 'BP-OPENCODE-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    remedy:
      'Both compile to a skill directory of the same name, so one would overwrite the other. Rename either of them from the inspector.',
    source: 'validation',
  },
  {
    code: 'BP-PI-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    remedy:
      'Both compile to a skill directory of the same name, so one would overwrite the other. Rename either of them from the inspector.',
    source: 'validation',
  },

  // Evaluation-only quality findings; never returned by validateBlueprint
  {
    code: 'BP-EVAL-SKILL-001',
    severity: 'info',
    summary: 'A skill body is too short to change behaviour.',
    remedy:
      'Under a couple of hundred characters a skill is a title with nothing behind it. Say what to do, in what order, and how to tell it worked.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-SKILL-002',
    severity: 'info',
    summary: 'A skill has no Instructions section.',
    remedy:
      'Add an `## Instructions` section. The description says when the skill applies; the instructions are what the agent actually follows once it does.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-AGENT-001',
    severity: 'info',
    summary: 'An agent states no output requirements.',
    remedy:
      'Say what the agent owes when it finishes — the shape of the answer, the files it leaves behind, the evidence it must show. Without them, “done” is whatever the model decides it is.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-WF-001',
    severity: 'info',
    summary: 'A workflow has no triggers.',
    remedy:
      'Give it the intents or agents that should start it. Without triggers the workflow can only run when it is named explicitly.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-LAW-001',
    severity: 'info',
    summary: 'An Iron Law gives no rationale.',
    remedy:
      'Add the reason. A law with one survives an agent that thinks it knows better; a law without one reads as arbitrary and gets routed around.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-LAW-002',
    severity: 'info',
    summary: 'An Iron Law has no examples.',
    remedy:
      'Add an example and a counterexample. A law stated only in the abstract is applied inconsistently; one with a case on each side is not.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-LAW-003',
    severity: 'info',
    summary: 'The Blueprint has no Iron Laws at all.',
    remedy:
      'Iron Laws are the things that must always hold — the ones worth stopping a change for. Add the two or three you would never accept a pull request without.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-PORT-001',
    severity: 'info',
    summary: 'Portability was not assessed: no harness capability data was provided.',
    remedy:
      'Enable a target in the Compatibility view. Portability is scored from what the enabled harnesses can express, so with none enabled there is nothing to score.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-VERIFY-001',
    severity: 'info',
    summary: 'No workflow has a verification step.',
    remedy:
      'Add a verification step to at least the workflow that produces changes. Nothing else distinguishes finished work from work that says it is finished.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-VERIFY-002',
    severity: 'info',
    summary: 'There are no gates.',
    remedy:
      'A gate is a checkpoint a workflow cannot pass without meeting its criteria. Add one wherever “do not go on unless” is what you actually mean.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-VERIFY-003',
    severity: 'info',
    summary: 'No hook runs tests, a linter or a secret scan.',
    remedy:
      'Hooks are the checks that run whether or not the agent remembers them. Add one on after-file-change or before-stop.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-COMPLEX-001',
    severity: 'info',
    summary: 'A workflow has more than 25 steps.',
    remedy:
      'At this length a workflow is hard to follow and harder to compile into instructions an agent keeps to. Extract a stretch of it into its own workflow and delegate.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-COMPLEX-002',
    severity: 'info',
    summary: 'Two skills describe nearly the same thing.',
    remedy:
      'The harness picks skills by description, so two that read alike make it guess. Merge them, or sharpen both until they select for different situations.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-COMPLEX-003',
    severity: 'info',
    summary: 'An agent has more than 12 skills.',
    remedy:
      'A dozen skills on one agent dilutes every one of them. Split the agent, or move the specialist skills onto an agent it can delegate to.',
    source: 'evaluation',
  },
  {
    code: 'BP-SAFETY-001',
    severity: 'info',
    summary: 'An agent may force-push without asking.',
    remedy:
      'Set `git.forcePush` to ask or deny, unless rewriting shared history unattended is genuinely what you want from this agent.',
    source: 'evaluation',
  },
  {
    code: 'BP-SAFETY-002',
    severity: 'info',
    summary: 'An agent may make arbitrary network requests with no security law.',
    remedy:
      'Narrow the permission to the hosts it actually needs, or add an Iron Law saying what it may send where. Either closes the gap; the pairing is what the check looks for.',
    source: 'evaluation',
  },
  {
    code: 'BP-SAFETY-003',
    severity: 'info',
    summary: 'No Iron Law covers security.',
    remedy:
      'Add at least one law in the security category. “Never commit a credential” is the usual first, and it is the one that pays for itself.',
    source: 'evaluation',
  },
  {
    code: 'BP-SAFETY-004',
    severity: 'info',
    summary: 'No hook scans for secrets.',
    remedy:
      'Add a secret-scan hook on after-file-change or before-stop. It catches the mistake nobody makes deliberately, which is why an instruction alone does not cover it.',
    source: 'evaluation',
  },
]

const BY_CODE = new Map(DIAGNOSTIC_CODES.map((entry) => [entry.code, entry]))

export function diagnosticCode(code: string): DiagnosticCode | undefined {
  return BY_CODE.get(code)
}

export function isKnownDiagnosticCode(code: string): boolean {
  return BY_CODE.has(code)
}
