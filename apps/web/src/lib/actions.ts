'use client'

/**
 * Workspace actions that more than one surface triggers.
 *
 * Validate is offered by the top bar, the command palette and a keyboard shortcut. Writing
 * it three times is how three of them end up reporting slightly different things.
 */
import { summarizeDiagnostics } from '@agent-blueprint/core'
import { toast } from 'sonner'

import { useWorkspace } from '@/lib/state/workspace-store'

/** Runs the pending validation immediately and reports what it found. */
export async function validateNow(): Promise<void> {
  await useWorkspace.getState().flushPending()
  const counts = summarizeDiagnostics(useWorkspace.getState().diagnostics)
  const total = counts.errors + counts.warnings + counts.infos

  toast.success(total === 0 ? 'No findings' : `${total} findings`, {
    description:
      total === 0
        ? 'This Blueprint is clean.'
        : `${counts.errors} errors, ${counts.warnings} warnings, ${counts.infos} suggestions.`,
  })
}
