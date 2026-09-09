/**
 * @agent-blueprint/exporters — compiles a Blueprint into the files each AI coding harness
 * reads. Depends on @agent-blueprint/core only: no UI, no network, no clock.
 */
export * from './types'
export * from './registry'
export * from './pipeline'
export * from './portability'

export { claudeCodeAdapter } from './claude-code/index'
export type { ClaudeCodeOptions } from './claude-code/index'
export { codexAdapter } from './codex/index'
export type { CodexOptions } from './codex/index'
export { copilotAdapter, openCodeAdapter, piAdapter } from './portable-adapters'
export type { PortableAdapterOptions } from './portable-adapters'

export * from './shared/index'
export * from './shared/portable'
