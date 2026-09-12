/** Target options of the Copilot adapter, shared by both layouts (P9-36). */
import { z } from 'zod'

export const optionsSchema = z
  .object({
    /** Set false when the repository already has hand-written `.github/hooks/`. */
    emitHooks: z.boolean().default(true),
    /** `plugin` compiles an installable plugin and a marketplace instead of project files (P9-36). */
    layout: z.enum(['project', 'plugin']).default('project'),
  })
  .prefault({})

export type CopilotOptions = z.output<typeof optionsSchema>
