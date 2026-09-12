/** The `agents/openai.yaml` sidecar Codex reads beside a skill. */
import { toYaml } from '@agent-blueprint/core'

import { firstSentence } from '../shared/markdown'
import { PORTABLE_SKILLS_DIR } from '../shared/portable'
import { generatedFile, type GeneratedFile } from '../types'

export function openAiSidecar(
  id: string,
  displayName: string,
  description: string | undefined,
  owner: 'codex',
  root: string = PORTABLE_SKILLS_DIR,
): GeneratedFile {
  const sidecar = {
    interface: {
      display_name: displayName,
      short_description: firstSentence(description) || displayName,
    },
    policy: { allow_implicit_invocation: true },
  }
  return generatedFile(`${root}/${id}/agents/openai.yaml`, toYaml(sidecar), 'yaml', owner, [])
}
