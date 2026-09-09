/**
 * How a generated instruction refers to harness primitives.
 *
 * Files under `.agents/skills/` are read by Codex, OpenCode and Pi at the same path, so
 * their text must be identical: those three share `SHARED_PHRASING`, which names the
 * primitive without naming the harness. Claude Code reads its own `.claude/` tree and can
 * therefore use Claude-specific wording.
 */
export interface Phrasing {
  readonly id: string
  /** Whether the harness can run another agent as a subagent. */
  readonly supportsDelegation: boolean
  delegate(agentId: string): string
  invokeSkill(skillId: string): string
  /** How a user starts a workflow, for the instruction file's workflow index. */
  workflowInvocation(workflowId: string): string
}

export const CLAUDE_PHRASING: Phrasing = {
  id: 'claude-code',
  supportsDelegation: true,
  delegate: (agentId) => `Use the Agent tool to run the \`${agentId}\` subagent`,
  invokeSkill: (skillId) => `Apply the \`${skillId}\` skill`,
  workflowInvocation: (workflowId) => `/${workflowId}`,
}

/** Neutral wording for the shared `.agents/skills` tree and the shared `AGENTS.md`. */
export const SHARED_PHRASING: Phrasing = {
  id: 'shared',
  supportsDelegation: true,
  delegate: (agentId) => `Delegate to the \`${agentId}\` agent`,
  invokeSkill: (skillId) => `Apply the \`${skillId}\` skill`,
  workflowInvocation: (workflowId) => `the \`${workflowId}\` skill`,
}

/** For harnesses without subagents: the same session adopts the other agent's persona. */
export const SINGLE_AGENT_PHRASING: Phrasing = {
  ...SHARED_PHRASING,
  id: 'single-agent',
  supportsDelegation: false,
  delegate: (agentId) => `Adopt the \`${agentId}\` persona for this step`,
}
