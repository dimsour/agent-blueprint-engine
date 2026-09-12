import { HARNESS_IDS, type HarnessId } from '@agent-blueprint/core'

import { claudeCodeAdapter } from './claude-code/index'
import { codexAdapter } from './codex/index'
import { copilotAdapter } from './copilot/index'
import { openCodeAdapter } from './opencode/index'
import { piAdapter } from './pi/index'
import type { AnyHarnessAdapter } from './types'

/** Every harness the compiler can target. Keys match `HARNESS_IDS` in core. */
export const ADAPTERS: Record<HarnessId, AnyHarnessAdapter> = {
  'claude-code': claudeCodeAdapter,
  codex: codexAdapter,
  copilot: copilotAdapter,
  opencode: openCodeAdapter,
  pi: piAdapter,
}

/** Targets whose adapter has a `layout: 'plugin'` option (P9-27, P9-28, P9-36). */
export const PLUGIN_LAYOUT_TARGETS: readonly HarnessId[] = ['claude-code', 'codex', 'copilot']

export function adapterFor(id: HarnessId): AnyHarnessAdapter {
  return ADAPTERS[id]
}

export function listAdapters(): AnyHarnessAdapter[] {
  return HARNESS_IDS.map((id) => ADAPTERS[id])
}
