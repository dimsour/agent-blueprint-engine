/**
 * Every diagnostic code the core emits, in one place.
 *
 * A code is a promise: it always means the same thing, so a user can silence one, search for
 * one, or link to one. This catalogue is the source of that promise. `tests/docs.test.ts`
 * fails if a code here is missing from docs/05-validation-evaluation.md, and rules are only
 * allowed to emit codes listed here.
 */
import type { DiagnosticSeverity } from './types'

export interface DiagnosticCode {
  code: string
  /** Severity the code is normally emitted with; a few vary with context. */
  severity: DiagnosticSeverity | 'varies'
  /** What it means, in one line. Shown in the UI next to the finding. */
  summary: string
  /** Where it comes from: validation runs on every edit, evaluation only when scoring. */
  source: 'project' | 'validation' | 'evaluation'
}

export const DIAGNOSTIC_CODES: readonly DiagnosticCode[] = [
  // Reading a project from disk
  {
    code: 'BP-PROJECT-002',
    severity: 'error',
    summary: 'An artifact listed in the manifest has no file.',
    source: 'project',
  },
  {
    code: 'BP-PROJECT-003',
    severity: 'error',
    summary: 'An artifact file could not be parsed or is invalid.',
    source: 'project',
  },
  {
    code: 'BP-PROJECT-004',
    severity: 'warning',
    summary: 'An artifact file exists but is not listed in the manifest.',
    source: 'project',
  },
  {
    code: 'BP-PROJECT-005',
    severity: 'info',
    summary: 'Unknown keys in an artifact file were preserved under metadata.',
    source: 'project',
  },
  {
    code: 'BP-PROJECT-006',
    severity: 'info',
    summary: 'The manifest names a different source directory than the one read.',
    source: 'project',
  },

  // Structure
  {
    code: 'BP-ID-001',
    severity: 'error',
    summary: 'Two entities of the same kind share an id.',
    source: 'validation',
  },
  {
    code: 'BP-ID-002',
    severity: 'error',
    summary: 'An entity id is not a valid slug.',
    source: 'validation',
  },
  {
    code: 'BP-REF-001',
    severity: 'error',
    summary: 'A reference points at an entity that does not exist.',
    source: 'validation',
  },
  {
    code: 'BP-DESC-001',
    severity: 'warning',
    summary: 'An agent, skill, workflow, law, gate or hook has no description.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-001',
    severity: 'warning',
    summary: 'An agent states no responsibilities.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-002',
    severity: 'warning',
    summary: 'Several agents and no primary agent chosen.',
    source: 'validation',
  },
  {
    code: 'BP-WF-001',
    severity: 'error',
    summary: 'A workflow has no usable entry node.',
    source: 'validation',
  },
  {
    code: 'BP-WF-002',
    severity: 'warning',
    summary: 'A workflow has no end node.',
    source: 'validation',
  },
  {
    code: 'BP-WF-003',
    severity: 'error',
    summary: 'An edge points at a node that does not exist.',
    source: 'validation',
  },
  {
    code: 'BP-WF-004',
    severity: 'error',
    summary: 'Two nodes in one workflow share an id.',
    source: 'validation',
  },
  {
    code: 'BP-WF-005',
    severity: 'warning',
    summary: 'A node has no agent, skill, gate or tool assigned.',
    source: 'validation',
  },
  {
    code: 'BP-SKILL-001',
    severity: 'warning',
    summary: 'A skill description exceeds the Agent Skills limit of 1024 characters.',
    source: 'validation',
  },
  {
    code: 'BP-TARGET-001',
    severity: 'info',
    summary: 'No export target is enabled.',
    source: 'validation',
  },
  {
    code: 'BP-TARGET-002',
    severity: 'error',
    summary: 'The same harness is configured twice.',
    source: 'validation',
  },
  {
    code: 'BP-LAW-001',
    severity: 'warning',
    summary: 'A scoped law or rule lists no agents or workflows, so it applies to nothing.',
    source: 'validation',
  },

  // Semantics
  {
    code: 'BP-WF-010',
    severity: 'warning',
    summary: 'A workflow node cannot be reached from the entry node.',
    source: 'validation',
  },
  {
    code: 'BP-WF-011',
    severity: 'warning',
    summary: 'A workflow reaches its end without verifying anything.',
    source: 'validation',
  },
  {
    code: 'BP-WF-012',
    severity: 'warning',
    summary: 'A parallel node has one branch, or a merge node has one input.',
    source: 'validation',
  },
  {
    code: 'BP-WF-013',
    severity: 'warning',
    summary: 'A non-end node has no outgoing edge, so the workflow stops there.',
    source: 'validation',
  },
  {
    code: 'BP-WF-014',
    severity: 'info',
    summary: 'A loop has no retry edge or attempt limit.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-010',
    severity: 'warning',
    summary: 'Nothing can invoke this agent.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-011',
    severity: 'warning',
    summary: 'A responsibility is not covered by any of the agent’s skills.',
    source: 'validation',
  },
  {
    code: 'BP-AGENT-012',
    severity: 'info',
    summary: 'An agent has tools but no permissions, so harness defaults apply.',
    source: 'validation',
  },
  {
    code: 'BP-SKILL-010',
    severity: 'warning',
    summary: 'A skill has no activation conditions and no owner.',
    source: 'validation',
  },
  {
    code: 'BP-SKILL-011',
    severity: 'info',
    summary: 'A skill has no Verification section.',
    source: 'validation',
  },
  {
    code: 'BP-HOOK-010',
    severity: 'info',
    summary: 'A hook runs a command action but has no command.',
    source: 'validation',
  },
  {
    code: 'BP-GATE-010',
    severity: 'warning',
    summary: 'A gate used by a workflow has no criteria.',
    source: 'validation',
  },
  {
    code: 'BP-LAW-010',
    severity: 'warning',
    summary: 'Two Iron Laws oblige opposite things about the same subject.',
    source: 'validation',
  },
  {
    code: 'BP-LAW-011',
    severity: 'info',
    summary: 'A law marked for gate enforcement has no gate that checks it.',
    source: 'validation',
  },
  {
    code: 'BP-CONTRA-001',
    severity: 'warning',
    summary: 'Two artifacts tell the agent opposite things about the same subject.',
    source: 'validation',
  },

  // Orphans, one code per kind
  {
    code: 'BP-ORPHAN-001',
    severity: 'warning',
    summary: 'Nothing uses this skill.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-002',
    severity: 'warning',
    summary: 'Nothing uses this workflow.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-003',
    severity: 'warning',
    summary: 'Nothing uses this Iron Law.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-004',
    severity: 'warning',
    summary: 'Nothing uses this rule.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-005',
    severity: 'warning',
    summary: 'Nothing uses this gate.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-006',
    severity: 'warning',
    summary: 'Nothing uses this tool.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-007',
    severity: 'warning',
    summary: 'Nothing uses this reference.',
    source: 'validation',
  },
  {
    code: 'BP-ORPHAN-008',
    severity: 'warning',
    summary: 'Nothing uses this memory definition.',
    source: 'validation',
  },

  // Requirements
  {
    code: 'BP-REQ-001',
    severity: 'varies',
    summary: 'A requirement is not satisfied: error for must, warning for should.',
    source: 'validation',
  },
  {
    code: 'BP-REQ-002',
    severity: 'warning',
    summary: 'A requirement is only partly satisfied.',
    source: 'validation',
  },
  {
    code: 'BP-REQ-003',
    severity: 'info',
    summary: 'A requirement has no checks, so it cannot be verified automatically.',
    source: 'validation',
  },
  {
    code: 'BP-REQ-004',
    severity: 'info',
    summary: 'A requirement can only be judged by a model, and no AI is configured.',
    source: 'validation',
  },
  {
    code: 'BP-REQ-005',
    severity: 'warning',
    summary: 'A requirement check could not run, for example an invalid regular expression.',
    source: 'validation',
  },

  // Compilation, emitted by @agent-blueprint/exporters
  {
    code: 'BP-TARGET-003',
    severity: 'error',
    summary: 'Target options are invalid; the target was skipped.',
    source: 'validation',
  },
  {
    code: 'BP-COMPILE-001',
    severity: 'error',
    summary: 'Two adapters produce different content for the same path.',
    source: 'validation',
  },
  {
    code: 'BP-PORT-001',
    severity: 'warning',
    summary: 'A feature the Blueprint uses is unsupported on an enabled target.',
    source: 'validation',
  },
  {
    code: 'BP-PORT-002',
    severity: 'info',
    summary: 'A feature is adapted or limited on an enabled target.',
    source: 'validation',
  },
  {
    code: 'BP-CLAUDE-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    source: 'validation',
  },
  {
    code: 'BP-CODEX-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    source: 'validation',
  },
  {
    code: 'BP-CODEX-002',
    severity: 'warning',
    summary: 'AGENTS.md exceeds the Codex instruction budget.',
    source: 'validation',
  },
  {
    code: 'BP-COPILOT-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    source: 'validation',
  },
  {
    code: 'BP-OPENCODE-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    source: 'validation',
  },
  {
    code: 'BP-PI-001',
    severity: 'error',
    summary: 'A workflow and a skill share an id and would overwrite each other.',
    source: 'validation',
  },

  // Evaluation-only quality findings; never returned by validateBlueprint
  {
    code: 'BP-EVAL-SKILL-001',
    severity: 'info',
    summary: 'A skill body is too short to change behaviour.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-SKILL-002',
    severity: 'info',
    summary: 'A skill has no Instructions section.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-AGENT-001',
    severity: 'info',
    summary: 'An agent states no output requirements.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-WF-001',
    severity: 'info',
    summary: 'A workflow has no triggers.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-LAW-001',
    severity: 'info',
    summary: 'An Iron Law gives no rationale.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-LAW-002',
    severity: 'info',
    summary: 'An Iron Law has no examples.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-LAW-003',
    severity: 'info',
    summary: 'The Blueprint has no Iron Laws at all.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-PORT-001',
    severity: 'info',
    summary: 'Portability was not assessed: no harness capability data was provided.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-VERIFY-001',
    severity: 'info',
    summary: 'No workflow has a verification step.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-VERIFY-002',
    severity: 'info',
    summary: 'There are no gates.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-VERIFY-003',
    severity: 'info',
    summary: 'No hook runs tests, a linter or a secret scan.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-COMPLEX-001',
    severity: 'info',
    summary: 'A workflow has more than 25 steps.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-COMPLEX-002',
    severity: 'info',
    summary: 'Two skills describe nearly the same thing.',
    source: 'evaluation',
  },
  {
    code: 'BP-EVAL-COMPLEX-003',
    severity: 'info',
    summary: 'An agent has more than 12 skills.',
    source: 'evaluation',
  },
  {
    code: 'BP-SAFETY-001',
    severity: 'info',
    summary: 'An agent may force-push without asking.',
    source: 'evaluation',
  },
  {
    code: 'BP-SAFETY-002',
    severity: 'info',
    summary: 'An agent may make arbitrary network requests with no security law.',
    source: 'evaluation',
  },
  {
    code: 'BP-SAFETY-003',
    severity: 'info',
    summary: 'No Iron Law covers security.',
    source: 'evaluation',
  },
  {
    code: 'BP-SAFETY-004',
    severity: 'info',
    summary: 'No hook scans for secrets.',
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
