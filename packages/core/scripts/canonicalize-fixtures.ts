/**
 * Rewrite every fixture project in canonical form (read → normalize → write). Run after
 * editing a fixture by hand so the byte-identity test in core stays green:
 *
 *   pnpm --filter @agent-blueprint/core fixtures:canonicalize
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { FIXTURE_NAMES, fixtureRoot, readFixtureFiles } from '@agent-blueprint/fixtures'

import { MemoryFs, parseEntityPath, readProject, renderProjectFiles } from '../src/index'

for (const name of FIXTURE_NAMES) {
  const before = readFixtureFiles(name)
  const { blueprint, diagnostics } = await readProject(new MemoryFs(before))
  for (const d of diagnostics) console.log(`  ${d.severity.toUpperCase()} ${d.code} ${d.message}`)
  if (diagnostics.some((d) => d.severity === 'error')) {
    console.error(`Fixture "${name}" has errors; fix them before canonicalizing.`)
    process.exitCode = 1
    continue
  }

  const after = renderProjectFiles(blueprint)
  const root = fixtureRoot(name)
  let changed = 0
  for (const [path, content] of Object.entries(after)) {
    if (before[path] === content) continue
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, 'utf8')
    console.log(`  ${path in before ? 'rewrote' : 'created'} ${path}`)
    changed += 1
  }
  for (const path of Object.keys(before)) {
    if (path in after || !parseEntityPath(blueprint.settings.sourceDir, path)) continue
    rmSync(join(root, path))
    console.log(`  deleted ${path}`)
    changed += 1
  }
  console.log(`${name}: ${changed} file(s) changed`)
}
