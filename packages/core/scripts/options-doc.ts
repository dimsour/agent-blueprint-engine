/**
 * Rewrites the options reference in docs/02-domain-model.md from the option tables.
 *
 * `pnpm --filter @agent-blueprint/core options:doc`. The test in `tests/options.test.ts`
 * fails when the document no longer matches, which is how a new option is made to show up
 * here rather than being forgotten.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { withOptionsDoc } from '../src/model/options-doc'

const path = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/02-domain-model.md')
const before = readFileSync(path, 'utf8')
const after = withOptionsDoc(before)
if (after !== before) {
  writeFileSync(path, after)
  console.log('docs/02-domain-model.md: options reference rewritten')
} else {
  console.log('docs/02-domain-model.md: options reference already current')
}
