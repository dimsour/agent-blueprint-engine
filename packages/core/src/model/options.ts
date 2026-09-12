/**
 * What every fixed option means (P9-21).
 *
 * The schemas name the choices — `worker`, `before-stop`, `secret-scan`, `synthesize` — and
 * nothing told the person choosing what they meant. Reported from use: the Role select on an
 * agent offers seven words and no help. A word in a dropdown is a decision the user is being
 * asked to make, and the meaning belongs beside the word, not in a document they have to know
 * exists.
 *
 * One entry per value of every enum a form offers, in the words the compiler and the validator
 * actually act on. `tests/options.test.ts` fails if an enum value has no entry, and
 * `tests/docs.test.ts` fails if a value is missing from docs/02, so the three cannot drift.
 * The app reads these for the select controls (docs/07); docs/02 lists them in full.
 */
import {
  AGENT_ROLES,
  EFFORT_LEVELS,
  ENFORCEMENT_MECHANISMS,
  GATE_CRITERION_KINDS,
  GATE_FAILURE_BEHAVIORS,
  GOVERNANCE_CATEGORIES,
  HOOK_ACTION_TYPES,
  HOOK_FAILURE_BEHAVIORS,
  HOOK_TRIGGERS,
  IRON_LAW_SEVERITIES,
  MCP_TRANSPORTS,
  MEMORY_SCOPES,
  MERGE_STRATEGIES,
  MODEL_PREFERENCES,
  NODE_FAILURE_BEHAVIORS,
  PERMISSION_DECISIONS,
  PERMISSION_OPERATIONS,
  REFERENCE_KINDS,
  REQUIREMENT_CHECK_TYPES,
  REQUIREMENT_LEVELS,
  RULE_PRIORITIES,
  SCENARIO_MODES,
  SEVERITIES,
  SKILL_RESOURCE_ENCODINGS,
  SKILL_RESOURCE_KINDS,
  TOOL_KINDS,
  VERIFICATION_METHODS,
  WORKFLOW_EDGE_KINDS,
  WORKFLOW_NODE_TYPES,
} from '../schema/index'
import { HARNESS_IDS } from './kinds'

export interface OptionInfo {
  /** The word as a person reads it. */
  label: string
  /** What choosing it does, in one or two sentences, in terms of what the product then does. */
  description: string
}

type InfoOf<T extends readonly string[]> = Readonly<Record<T[number], OptionInfo>>

export const AGENT_ROLE_INFO: InfoOf<typeof AGENT_ROLES> = {
  worker: {
    label: 'Worker',
    description:
      'Does the work: writes the code, the tests, the document. The default for an agent that produces something.',
  },
  reviewer: {
    label: 'Reviewer',
    description:
      'Reads what another agent produced and reports what is wrong with it. Never the same agent that wrote it.',
  },
  researcher: {
    label: 'Researcher',
    description:
      'Gathers what is needed before work starts — reads the codebase, the docs, the prior art — and reports findings rather than changes.',
  },
  investigator: {
    label: 'Investigator',
    description:
      'Finds the cause of a specific failure: a bug, a flaky test, a regression. Ends with a diagnosis, not a fix.',
  },
  architect: {
    label: 'Architect',
    description:
      'Decides structure — boundaries, interfaces, what goes where — and writes it down for workers to follow.',
  },
  verifier: {
    label: 'Verifier',
    description:
      'Runs things and reports what happened: builds, tests, checks. Reports observed output, never expected output.',
  },
  orchestrator: {
    label: 'Orchestrator',
    description:
      'Runs the workflow: decides which agent does what, in what order, and when it is done. Usually the primary agent.',
  },
}

export const SEVERITY_INFO: InfoOf<typeof SEVERITIES> = {
  critical: {
    label: 'Critical',
    description:
      'Breaking it is never acceptable; the compiled instructions say so in those terms.',
  },
  high: {
    label: 'High',
    description: 'Breaking it needs a stated reason and a person aware of it.',
  },
  medium: { label: 'Medium', description: 'Worth flagging; the agent may proceed if it says why.' },
  low: { label: 'Low', description: 'Advisory. Mentioned, not enforced.' },
}

export const IRON_LAW_SEVERITY_INFO: InfoOf<typeof IRON_LAW_SEVERITIES> = {
  critical: SEVERITY_INFO.critical,
  high: SEVERITY_INFO.high,
  medium: SEVERITY_INFO.medium,
}

export const GOVERNANCE_CATEGORY_INFO: InfoOf<typeof GOVERNANCE_CATEGORIES> = {
  security: {
    label: 'Security',
    description:
      'Credentials, secrets, data exposure, injection. The category `BP-SAFETY-003` looks for when it asks whether any law covers security.',
  },
  testing: {
    label: 'Testing',
    description: 'What must be tested, how, and what counts as a passing run.',
  },
  architecture: {
    label: 'Architecture',
    description: 'Boundaries, layering, dependencies between parts, where things go.',
  },
  reliability: {
    label: 'Reliability',
    description: 'Failure handling, retries, idempotency, what happens when something is down.',
  },
  data: {
    label: 'Data',
    description: 'Migrations, schemas, backups, anything that could lose or corrupt records.',
  },
  'code-quality': {
    label: 'Code quality',
    description:
      'Naming, structure, duplication, readability — the things review comments are made of.',
  },
  communication: {
    label: 'Communication',
    description:
      'How the agent reports, asks, and hands over: commit messages, summaries, questions.',
  },
  process: {
    label: 'Process',
    description: 'When and how work is done: branches, reviews, deploy windows, sign-offs.',
  },
  general: { label: 'General', description: 'Fits no other category. Prefer a specific one.' },
}

export const TOOL_KIND_INFO: InfoOf<typeof TOOL_KINDS> = {
  filesystem: {
    label: 'Filesystem',
    description: 'Reading, writing and deleting files in the workspace.',
  },
  shell: {
    label: 'Shell',
    description: 'Running commands. Whether it may change anything is a permission.',
  },
  git: { label: 'Git', description: 'Version control: reading history, committing, pushing.' },
  browser: {
    label: 'Browser',
    description: 'Opening pages and driving a browser, for testing or research.',
  },
  search: { label: 'Search', description: 'Searching the web or a codebase index.' },
  database: {
    label: 'Database',
    description: 'Querying or changing a database. Pair with data laws.',
  },
  api: { label: 'API', description: 'Calling an HTTP API the agent needs, named by the tool.' },
  documentation: {
    label: 'Documentation',
    description: 'Fetching reference documentation. Covered by the `net.docs` permission.',
  },
  mcp: {
    label: 'MCP server',
    description:
      'A Model Context Protocol server, given by transport and command or URL. Its environment variable names are recorded; their values never are.',
  },
  custom: {
    label: 'Custom',
    description: 'Anything else. Say what it is in the description, because no harness will know.',
  },
}

export const PERMISSION_OPERATION_INFO: InfoOf<typeof PERMISSION_OPERATIONS> = {
  'fs.read': { label: 'Read files', description: 'Open and read files in the workspace.' },
  'fs.write': { label: 'Write files', description: 'Create and edit files.' },
  'fs.delete': {
    label: 'Delete files',
    description: 'Remove files. Separate from write because it is the one that loses work.',
  },
  'shell.readonly': {
    label: 'Read-only shell',
    description: 'Commands that inspect and do not change: `ls`, `cat`, `git status`, a test run.',
  },
  'shell.mutating': {
    label: 'Mutating shell',
    description:
      'Commands that change the machine or the repository: installs, builds that write, anything with side effects.',
  },
  'git.read': {
    label: 'Read git',
    description: 'History, diffs, branches — nothing that moves a ref.',
  },
  'git.commit': { label: 'Commit', description: 'Make commits on the current branch.' },
  'git.push': { label: 'Push', description: 'Push to a remote. Usually `ask`.' },
  'git.force-push': {
    label: 'Force-push',
    description:
      'Rewrite shared history. `BP-SAFETY-001` flags an agent allowed to do this without asking.',
  },
  'net.docs': { label: 'Fetch documentation', description: 'Reach documentation hosts only.' },
  'net.any': {
    label: 'Any network',
    description: 'Reach any host. `BP-SAFETY-002` flags this without a security law beside it.',
  },
  mcp: { label: 'MCP servers', description: 'Use the MCP servers the agent’s tools declare.' },
}

export const PERMISSION_DECISION_INFO: InfoOf<typeof PERMISSION_DECISIONS> = {
  allow: { label: 'Allow', description: 'Without asking. Compiles to the harness’s allow list.' },
  ask: {
    label: 'Ask',
    description:
      'Stop and ask the user each time. Harnesses without an approval prompt lower this to allow and say so in the compatibility view.',
  },
  deny: {
    label: 'Deny',
    description:
      'Never. Compiles to the harness’s deny list where it has one, and to an instruction where it does not.',
  },
}

export const MODEL_PREFERENCE_INFO: InfoOf<typeof MODEL_PREFERENCES> = {
  fast: {
    label: 'Fast',
    description: 'A small, quick model. For routine work where latency matters more than depth.',
  },
  balanced: { label: 'Balanced', description: 'The harness default. Most agents.' },
  strong: {
    label: 'Strong',
    description:
      'The most capable model available. For review, architecture, and anything that is hard to undo.',
  },
}

export const EFFORT_LEVEL_INFO: InfoOf<typeof EFFORT_LEVELS> = {
  low: {
    label: 'Low',
    description: 'Little deliberation. For lookups, formatting, and work with one obvious answer.',
  },
  medium: {
    label: 'Medium',
    description: 'The harness default. Most workers and reviewers.',
  },
  high: {
    label: 'High',
    description:
      'As much thinking as the model will do. For planning, architecture, and anything hard to undo. Slower and dearer.',
  },
}

export const ENFORCEMENT_MECHANISM_INFO: InfoOf<typeof ENFORCEMENT_MECHANISMS> = {
  instruction: {
    label: 'Instruction',
    description: 'Written into the instruction file. The agent is told; nothing checks.',
  },
  hook: {
    label: 'Hook',
    description:
      'Every adapter generates a check that runs before the agent stops. Nothing else to write.',
  },
  gate: {
    label: 'Gate',
    description:
      'A gate you write must name this law in its own name, description or a criterion — `BP-LAW-011` fires until one does.',
  },
}

export const RULE_PRIORITY_INFO: InfoOf<typeof RULE_PRIORITIES> = {
  high: { label: 'High', description: 'Follow unless there is a stated reason not to.' },
  normal: {
    label: 'Normal',
    description: 'Follow by default; may be traded off against other rules.',
  },
  low: { label: 'Low', description: 'A preference. Mentioned once, not repeated.' },
}

export const HOOK_TRIGGER_INFO: InfoOf<typeof HOOK_TRIGGERS> = {
  'session-start': {
    label: 'Session start',
    description: 'Once, when the agent starts. For setup and context loading.',
  },
  'user-prompt': {
    label: 'User prompt',
    description: 'Each time the user sends a message, before the agent acts on it.',
  },
  'before-tool': {
    label: 'Before a tool',
    description: 'Before any tool runs. Narrow it with the conditions.',
  },
  'after-tool': { label: 'After a tool', description: 'After any tool has run.' },
  'after-file-change': {
    label: 'After a file change',
    description:
      'After the agent edits or writes a file. The usual trigger for tests, formatting and linting.',
  },
  'before-stop': {
    label: 'Before stop',
    description:
      'When the agent is about to report it has finished. The last chance to block: gates and secret scans live here.',
  },
  'subagent-stop': {
    label: 'Subagent stop',
    description: 'When a delegated agent finishes and returns.',
  },
  'after-tool-failure': {
    label: 'After a tool fails',
    description:
      'After a tool call errors out. For hints about what went wrong; nothing can be refused, the failure already happened.',
  },
  'subagent-start': {
    label: 'Subagent start',
    description:
      'When a delegated agent is spawned, before it acts. For context the subagent must have — the Iron Laws, the conventions — since it does not see the conversation.',
  },
  'before-compact': {
    label: 'Before compaction',
    description:
      'Before the conversation is summarised to make room. The last moment to save state the summary might lose.',
  },
  'after-compact': {
    label: 'After compaction',
    description:
      'After the conversation was summarised. For restating what must survive a summary: the rules, the current task.',
  },
}

export const HOOK_ACTION_TYPE_INFO: InfoOf<typeof HOOK_ACTION_TYPES> = {
  command: { label: 'Command', description: 'Run the command as given. Needs a command.' },
  'prompt-check': {
    label: 'Prompt check',
    description: 'Ask the model a question about what it just did, from the prompt. No command.',
  },
  'run-tests': {
    label: 'Run tests',
    description:
      'Run the test command. Needs a command; counts as verification for `BP-EVAL-VERIFY-003`.',
  },
  format: { label: 'Format', description: 'Run the formatter. Needs a command.' },
  lint: { label: 'Lint', description: 'Run the linter. Needs a command; counts as verification.' },
  'secret-scan': {
    label: 'Secret scan',
    description:
      'Scan for credentials. Needs a command. This type, not a command that happens to scan, is what `BP-SAFETY-004` and a `hook-exists` check look for.',
  },
  'check-iron-laws': {
    label: 'Check Iron Laws',
    description:
      'Ask the model whether the work violates any Iron Law in force. No command; every adapter generates it for laws with hook enforcement.',
  },
}

export const HOOK_FAILURE_BEHAVIOR_INFO: InfoOf<typeof HOOK_FAILURE_BEHAVIORS> = {
  block: { label: 'Block', description: 'The agent may not continue or stop until it passes.' },
  warn: { label: 'Warn', description: 'Tell the agent and let it continue.' },
  'return-to-agent': {
    label: 'Return to agent',
    description: 'Hand the output back to the agent as its next input, so it fixes what failed.',
  },
}

export const GATE_CRITERION_KIND_INFO: InfoOf<typeof GATE_CRITERION_KINDS> = {
  'tests-pass': {
    label: 'Tests pass',
    description:
      'The test command exits zero. Compiles to a before-stop hook where the harness has one.',
  },
  command: { label: 'Command', description: 'The given command exits zero.' },
  lint: { label: 'Lint', description: 'The linter reports nothing.' },
  'security-scan': { label: 'Security scan', description: 'The security scanner reports nothing.' },
  'requirements-check': {
    label: 'Requirements check',
    description: 'Every requirement in the Blueprint is satisfied, as the validator computes it.',
  },
  review: {
    label: 'Review',
    description: 'A reviewer agent has passed the work. Compiles to instructions.',
  },
  'human-approval': {
    label: 'Human approval',
    description: 'A person has said yes. The agent stops and asks.',
  },
  custom: {
    label: 'Custom',
    description: 'Described in words. Compiles to instructions, never to a check.',
  },
}

export const GATE_FAILURE_BEHAVIOR_INFO: InfoOf<typeof GATE_FAILURE_BEHAVIORS> = {
  allow: {
    label: 'Allow',
    description: 'Note the failure and continue. A gate that cannot stop anything.',
  },
  warn: { label: 'Warn', description: 'Tell the agent and continue.' },
  block: {
    label: 'Block',
    description: 'Do not continue until it passes. The default, and what a gate is for.',
  },
  'request-approval': {
    label: 'Request approval',
    description: 'Stop and ask the user whether to continue anyway.',
  },
}

export const MCP_TRANSPORT_INFO: InfoOf<typeof MCP_TRANSPORTS> = {
  stdio: {
    label: 'stdio',
    description:
      'A local process the harness starts, talking over its standard streams. Needs a command.',
  },
  http: { label: 'HTTP', description: 'A server reached by URL over plain HTTP requests.' },
  sse: {
    label: 'SSE',
    description: 'A server reached by URL that streams over server-sent events.',
  },
}

export const REFERENCE_KIND_INFO: InfoOf<typeof REFERENCE_KINDS> = {
  markdown: { label: 'Markdown', description: 'A document, copied beside the skills that use it.' },
  text: { label: 'Text', description: 'Plain text, copied as it is.' },
  example: {
    label: 'Example',
    description: 'A worked example of the right thing, for a skill or law to point at.',
  },
  documentation: {
    label: 'Documentation',
    description: 'Reference material for a library, API or tool.',
  },
  'domain-knowledge': {
    label: 'Domain knowledge',
    description: 'What the agent needs to know about the business or the field, not the code.',
  },
  url: {
    label: 'URL',
    description:
      'A link. The content is fetched at use, not stored; needs the `net.docs` permission.',
  },
}

export const MEMORY_SCOPE_INFO: InfoOf<typeof MEMORY_SCOPES> = {
  stateless: {
    label: 'Stateless',
    description: 'Nothing is remembered between turns. The seed is all it ever knows.',
  },
  session: { label: 'Session', description: 'Remembered until the session ends.' },
  project: {
    label: 'Project',
    description:
      'Remembered for this project, across sessions. Compiles to the harness’s project memory where it has one.',
  },
  persistent: {
    label: 'Persistent',
    description:
      'Remembered across projects. Few harnesses support this; the compatibility view says which.',
  },
}

export const REQUIREMENT_CHECK_TYPE_INFO: InfoOf<typeof REQUIREMENT_CHECK_TYPES> = {
  'workflow-has-node-type': {
    label: 'Workflow has a step of a type',
    description: 'Passes when a workflow — one named, or any — has a step of the given type.',
  },
  'iron-law-matches': {
    label: 'An Iron Law matches',
    description:
      'A case-insensitive regular expression matches the name, rule or body of at least one law.',
  },
  'hook-exists': {
    label: 'A hook exists',
    description:
      'A hook has exactly the given trigger and exactly the given action type. Either may be left as any.',
  },
  'gate-exists': {
    label: 'A gate exists',
    description: 'A gate exists, and carries a criterion of the given kind when one is given.',
  },
  'agent-has-skill-tag': {
    label: 'An agent holds a tagged skill',
    description: 'An agent — one named, or any — holds a skill carrying the given tag.',
  },
  'text-mentions': {
    label: 'Text mentions',
    description:
      'A case-insensitive regular expression matches the prose of some artifact of the given kinds: name, description, body, rule, guidance, when-to-use, statement. Never ids or tags.',
  },
  'ai-judged': {
    label: 'Judged by a model',
    description:
      'A model answers the prompt yes or no. Skipped until an endpoint is configured; run from the evaluation view.',
  },
}

export const REQUIREMENT_LEVEL_INFO: InfoOf<typeof REQUIREMENT_LEVELS> = {
  must: { label: 'Must', description: 'Unmet is an error, which blocks export and push.' },
  should: { label: 'Should', description: 'Unmet is a warning, counted in health.' },
}

export const SCENARIO_MODE_INFO: InfoOf<typeof SCENARIO_MODES> = {
  manual: { label: 'Manual', description: 'A person runs it and judges the result.' },
  'ai-judge': {
    label: 'AI judge',
    description: 'A model judges the result against the expected behaviours.',
  },
  runtime: {
    label: 'Runtime',
    description:
      'Run by a harness and checked automatically. Recorded, not built: no harness runs these yet.',
  },
}

export const SKILL_RESOURCE_KIND_INFO: InfoOf<typeof SKILL_RESOURCE_KINDS> = {
  reference: {
    label: 'Reference',
    description: 'A document the skill reads, under `references/` beside it.',
  },
  script: { label: 'Script', description: 'Something the skill runs, under `scripts/`.' },
  asset: {
    label: 'Asset',
    description: 'A file the skill uses — a template, an image, data — under `assets/`.',
  },
}

export const SKILL_RESOURCE_ENCODING_INFO: InfoOf<typeof SKILL_RESOURCE_ENCODINGS> = {
  utf8: { label: 'Text', description: 'Stored as text, readable in the project files.' },
  base64: { label: 'Binary', description: 'Stored base64-encoded, for anything that is not text.' },
}

export const WORKFLOW_NODE_TYPE_INFO: InfoOf<typeof WORKFLOW_NODE_TYPES> = {
  start: {
    label: 'Start',
    description: 'Where the workflow begins. Exactly one, named as the entry.',
  },
  end: {
    label: 'End',
    description: 'Where it finishes and reports the outcome. Every path should reach one.',
  },
  agent: { label: 'Agent', description: 'The named agent does this step.' },
  skill: { label: 'Skill', description: 'Apply the named skill.' },
  tool: { label: 'Tool', description: 'Use the named tool.' },
  condition: {
    label: 'Condition',
    description: 'Branch on a question; the outgoing connections carry the answers.',
  },
  verification: {
    label: 'Verification',
    description:
      'Prove the work is right — by command, tests, review or by hand. What `BP-WF-011` looks for before the end.',
  },
  review: {
    label: 'Review',
    description: 'Another agent reads the result. Also counts as verification.',
  },
  gate: {
    label: 'Gate',
    description: 'The named gate decides whether to continue. Also counts as verification.',
  },
  'human-approval': {
    label: 'Human approval',
    description: 'Stop and ask a person. Also counts as verification.',
  },
  output: { label: 'Output', description: 'Produce the result the step names.' },
  parallel: {
    label: 'Parallel',
    description: 'Split into branches; needs at least two outgoing connections.',
  },
  merge: {
    label: 'Merge',
    description: 'Bring branches back together by the merge strategy; needs at least two incoming.',
  },
  retry: {
    label: 'Retry',
    description: 'Try the preceding work again, up to the attempt limit. Bounds a loop.',
  },
  delegate: {
    label: 'Delegate',
    description: 'Hand off to the named agent and wait for it to return.',
  },
  synthesis: {
    label: 'Synthesis',
    description: 'Combine several branch results into one, in prose.',
  },
}

export const WORKFLOW_EDGE_KIND_INFO: InfoOf<typeof WORKFLOW_EDGE_KINDS> = {
  sequential: { label: 'Sequential', description: 'Then. The ordinary next step.' },
  parallel: {
    label: 'Parallel',
    description: 'At the same time as the other parallel connections from this step.',
  },
  conditional: { label: 'Conditional', description: 'Only when the condition on it holds.' },
  fallback: { label: 'Fallback', description: 'Only when the step failed.' },
  retry: {
    label: 'Retry',
    description: 'Go back and try again. Marks a loop as bounded for `BP-WF-014`.',
  },
  delegation: { label: 'Delegation', description: 'Hand off to the agent at the other end.' },
  review: { label: 'Review', description: 'Send the result to be reviewed.' },
  aggregation: {
    label: 'Aggregation',
    description: 'Collect results into the merge or synthesis at the other end.',
  },
}

export const MERGE_STRATEGY_INFO: InfoOf<typeof MERGE_STRATEGIES> = {
  all: { label: 'All', description: 'Wait for every branch.' },
  any: { label: 'Any', description: 'Continue when any branch finishes.' },
  first: { label: 'First', description: 'Take the first result and cancel the rest.' },
  synthesize: { label: 'Synthesize', description: 'Wait for all, then combine them in prose.' },
}

export const VERIFICATION_METHOD_INFO: InfoOf<typeof VERIFICATION_METHODS> = {
  command: { label: 'Command', description: 'Run the given command; zero exit is success.' },
  tests: { label: 'Tests', description: 'Run the test suite.' },
  review: { label: 'Review', description: 'Another agent reads it.' },
  manual: { label: 'Manual', description: 'A person checks. The agent stops and asks.' },
}

export const NODE_FAILURE_BEHAVIOR_INFO: InfoOf<typeof NODE_FAILURE_BEHAVIORS> = {
  stop: { label: 'Stop', description: 'End the workflow and report the failure.' },
  continue: { label: 'Continue', description: 'Note it and take the next step anyway.' },
  fallback: { label: 'Fallback', description: 'Follow the fallback connection from this step.' },
  retry: { label: 'Retry', description: 'Follow the retry connection, up to the attempt limit.' },
}

export const HARNESS_INFO: InfoOf<typeof HARNESS_IDS> = {
  'claude-code': {
    label: 'Claude Code',
    description:
      'Anthropic’s CLI. Native skills, subagents, hooks, permissions and path-scoped rules.',
  },
  codex: {
    label: 'OpenAI Codex',
    description:
      'AGENTS.md and skills; one approval policy per session, so per-command permissions become instructions.',
  },
  copilot: {
    label: 'GitHub Copilot',
    description: 'Custom agents, instructions and hooks under .github/.',
  },
  opencode: {
    label: 'OpenCode',
    description: 'opencode.json for agents and permissions; skills shared with Codex.',
  },
  pi: {
    label: 'Pi',
    description: 'Prompts and extensions under .pi/; no approval prompt, so ask lowers to enabled.',
  },
}

/**
 * Every option table, keyed by the enum it describes, for the test that keeps them complete
 * and the docs generator that lists them.
 */
export const OPTION_TABLES = {
  AGENT_ROLES: [AGENT_ROLES, AGENT_ROLE_INFO],
  SEVERITIES: [SEVERITIES, SEVERITY_INFO],
  IRON_LAW_SEVERITIES: [IRON_LAW_SEVERITIES, IRON_LAW_SEVERITY_INFO],
  GOVERNANCE_CATEGORIES: [GOVERNANCE_CATEGORIES, GOVERNANCE_CATEGORY_INFO],
  TOOL_KINDS: [TOOL_KINDS, TOOL_KIND_INFO],
  PERMISSION_OPERATIONS: [PERMISSION_OPERATIONS, PERMISSION_OPERATION_INFO],
  PERMISSION_DECISIONS: [PERMISSION_DECISIONS, PERMISSION_DECISION_INFO],
  MODEL_PREFERENCES: [MODEL_PREFERENCES, MODEL_PREFERENCE_INFO],
  EFFORT_LEVELS: [EFFORT_LEVELS, EFFORT_LEVEL_INFO],
  ENFORCEMENT_MECHANISMS: [ENFORCEMENT_MECHANISMS, ENFORCEMENT_MECHANISM_INFO],
  RULE_PRIORITIES: [RULE_PRIORITIES, RULE_PRIORITY_INFO],
  HOOK_TRIGGERS: [HOOK_TRIGGERS, HOOK_TRIGGER_INFO],
  HOOK_ACTION_TYPES: [HOOK_ACTION_TYPES, HOOK_ACTION_TYPE_INFO],
  HOOK_FAILURE_BEHAVIORS: [HOOK_FAILURE_BEHAVIORS, HOOK_FAILURE_BEHAVIOR_INFO],
  GATE_CRITERION_KINDS: [GATE_CRITERION_KINDS, GATE_CRITERION_KIND_INFO],
  GATE_FAILURE_BEHAVIORS: [GATE_FAILURE_BEHAVIORS, GATE_FAILURE_BEHAVIOR_INFO],
  MCP_TRANSPORTS: [MCP_TRANSPORTS, MCP_TRANSPORT_INFO],
  REFERENCE_KINDS: [REFERENCE_KINDS, REFERENCE_KIND_INFO],
  MEMORY_SCOPES: [MEMORY_SCOPES, MEMORY_SCOPE_INFO],
  REQUIREMENT_CHECK_TYPES: [REQUIREMENT_CHECK_TYPES, REQUIREMENT_CHECK_TYPE_INFO],
  REQUIREMENT_LEVELS: [REQUIREMENT_LEVELS, REQUIREMENT_LEVEL_INFO],
  SCENARIO_MODES: [SCENARIO_MODES, SCENARIO_MODE_INFO],
  SKILL_RESOURCE_KINDS: [SKILL_RESOURCE_KINDS, SKILL_RESOURCE_KIND_INFO],
  SKILL_RESOURCE_ENCODINGS: [SKILL_RESOURCE_ENCODINGS, SKILL_RESOURCE_ENCODING_INFO],
  WORKFLOW_NODE_TYPES: [WORKFLOW_NODE_TYPES, WORKFLOW_NODE_TYPE_INFO],
  WORKFLOW_EDGE_KINDS: [WORKFLOW_EDGE_KINDS, WORKFLOW_EDGE_KIND_INFO],
  MERGE_STRATEGIES: [MERGE_STRATEGIES, MERGE_STRATEGY_INFO],
  VERIFICATION_METHODS: [VERIFICATION_METHODS, VERIFICATION_METHOD_INFO],
  NODE_FAILURE_BEHAVIORS: [NODE_FAILURE_BEHAVIORS, NODE_FAILURE_BEHAVIOR_INFO],
  HARNESS_IDS: [HARNESS_IDS, HARNESS_INFO],
} as const satisfies Record<
  string,
  readonly [readonly string[], Readonly<Record<string, OptionInfo>>]
>

/** The description of one value of one enum, or nothing for a value the table does not know. */
export function describeOption(
  table: Readonly<Record<string, OptionInfo>>,
  value: string,
): OptionInfo | undefined {
  return Object.prototype.hasOwnProperty.call(table, value) ? table[value] : undefined
}
