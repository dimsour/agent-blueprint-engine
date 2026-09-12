/** Target options for the Claude Code adapter; the layout decides where files go (P9-27). */
import { z } from 'zod'

export const optionsSchema = z
  .object({
    /** Overrides the permission mode derived from each agent's permissions. */
    permissionMode: z
      .enum(['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan', 'manual'])
      .optional(),
    /** Set false when the team manages `.claude/settings.json` by hand. */
    emitSettings: z.boolean().default(true),
    /**
     * `project`: files under `.claude/` and a `CLAUDE.md`, picked up by opening the repository.
     * `plugin`: a plugin under `plugins/claude-code/` and a marketplace listing it, installed
     * with `/plugin marketplace add` (P9-27).
     */
    layout: z.enum(['project', 'plugin']).default('project'),
  })
  .prefault({})

export type ClaudeCodeOptions = z.output<typeof optionsSchema>
