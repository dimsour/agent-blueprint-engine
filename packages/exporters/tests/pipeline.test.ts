import { HARNESS_IDS, MemoryFs } from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import {
  buildManifestFor,
  compileBlueprint,
  compileProject,
  mergeFileSets,
  readBuildManifest,
  writeCompiled,
} from '../src/index'
import { fixtureFs, loadFixture } from './helpers'

describe('compileBlueprint', () => {
  it('compiles the targets the Blueprint enables', async () => {
    const blueprint = await loadFixture()
    const result = compileBlueprint(blueprint)
    expect(result.targets).toEqual(['claude-code', 'codex'])
    expect(result.ok).toBe(true)
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(result.files.map((file) => file.path)).toContain('README.md')
  })

  it('is deterministic', async () => {
    const blueprint = await loadFixture()
    const first = compileBlueprint(blueprint)
    const second = compileBlueprint(structuredClone(blueprint))
    expect(second.files).toEqual(first.files)
    expect(second.issues).toEqual(first.issues)
  })

  it('does not depend on the order of nodes and edges inside a workflow', async () => {
    const blueprint = await loadFixture()
    const shuffled = structuredClone(blueprint)
    for (const workflow of shuffled.workflows) {
      workflow.nodes = [...workflow.nodes].reverse()
      workflow.edges = [...workflow.edges].reverse()
    }
    expect(compileBlueprint(shuffled).files).toEqual(compileBlueprint(blueprint).files)
  })

  it('marks files several harnesses read as shared', async () => {
    const blueprint = await loadFixture()
    const result = compileBlueprint(blueprint, { targets: [...HARNESS_IDS] })
    const agentsMd = result.files.find((file) => file.path === 'AGENTS.md')
    expect(agentsMd?.owner).toBe('shared')
    // One entry only: the four harnesses that read it produced identical bytes.
    expect(result.files.filter((file) => file.path === 'AGENTS.md')).toHaveLength(1)
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'BP-COMPILE-001')).toEqual(
      [],
    )
  })

  it('reports invalid target options and skips the target', async () => {
    const blueprint = structuredClone(await loadFixture())
    blueprint.targets = [
      { harnessId: 'claude-code', enabled: true, options: { emitSettings: 'no' } },
    ]
    const result = compileBlueprint(blueprint)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('BP-TARGET-003')
    expect(result.files).toEqual([])
  })
})

describe('mergeFileSets', () => {
  it('keeps one copy of identical files and unions their sources', () => {
    const { files, diagnostics } = mergeFileSets([
      {
        path: 'AGENTS.md',
        content: 'x\n',
        format: 'markdown',
        owner: 'codex',
        sourceRefs: [{ kind: 'agent', id: 'a' }],
      },
      {
        path: 'AGENTS.md',
        content: 'x\n',
        format: 'markdown',
        owner: 'pi',
        sourceRefs: [
          { kind: 'agent', id: 'a' },
          { kind: 'skill', id: 's' },
        ],
      },
    ])
    expect(diagnostics).toEqual([])
    expect(files).toHaveLength(1)
    expect(files[0]?.owner).toBe('shared')
    expect(files[0]?.sourceRefs).toEqual([
      { kind: 'agent', id: 'a' },
      { kind: 'skill', id: 's' },
    ])
  })

  it('refuses to write a path two adapters disagree about', () => {
    const { files, diagnostics } = mergeFileSets([
      { path: 'AGENTS.md', content: 'one\n', format: 'markdown', owner: 'codex', sourceRefs: [] },
      { path: 'AGENTS.md', content: 'two\n', format: 'markdown', owner: 'pi', sourceRefs: [] },
    ])
    expect(files).toEqual([])
    expect(diagnostics[0]?.code).toBe('BP-COMPILE-001')
    expect(diagnostics[0]?.severity).toBe('error')
    expect(diagnostics[0]?.message).toContain('codex and pi')
  })
})

describe('buildManifestFor', () => {
  it('records every generated file under its owner with a content hash', async () => {
    const blueprint = await loadFixture()
    const output = compileBlueprint(blueprint)
    const manifest = await buildManifestFor(output)

    expect(manifest.schemaVersion).toBe(1)
    expect(Object.keys(manifest.shared?.files ?? {})).toContain('AGENTS.md')
    expect(Object.keys(manifest.targets['claude-code']?.files ?? {})).toContain('CLAUDE.md')
    expect(manifest.targets.codex?.adapterVersion).toBe('1.0.0')
    for (const hash of Object.values(manifest.targets['claude-code']?.files ?? {})) {
      expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })
})

describe('writeCompiled', () => {
  it('writes once, then reports everything unchanged', async () => {
    const fs = fixtureFs()
    const first = await writeCompiled(await compileProject(fs), fs)
    expect(first.written.length).toBeGreaterThan(10)
    expect(first.skipped).toEqual([])

    const manifest = await readBuildManifest(fs)
    const second = await writeCompiled(await compileProject(fs), fs, manifest)
    expect(second.written).toEqual([])
    expect(second.deleted).toEqual([])
    expect(second.unchanged.length).toBe(first.written.length)
  })

  it('deletes the files of a removed skill on the next build', async () => {
    const fs = fixtureFs()
    await writeCompiled(await compileProject(fs), fs)
    const manifest = await readBuildManifest(fs)

    await fs.delete('blueprint/skills/fluent-assertions/SKILL.md')
    const source = await fs.read('blueprint/blueprint.yaml')
    await fs.write('blueprint/blueprint.yaml', source!.replace('    - fluent-assertions\n', ''))

    const result = await writeCompiled(await compileProject(fs), fs, manifest)
    expect(result.deleted).toContain('.claude/skills/fluent-assertions/SKILL.md')
    expect(result.deleted).toContain('.agents/skills/fluent-assertions/SKILL.md')
    expect(await fs.exists('.claude/skills/fluent-assertions/SKILL.md')).toBe(false)
    expect(await fs.exists('.claude/skills/xunit/SKILL.md')).toBe(true)
  })

  it('never overwrites a file it does not own', async () => {
    const fs = fixtureFs()
    await fs.write('README.md', '# Hand written\n')
    const result = await writeCompiled(await compileProject(fs), fs)
    expect(result.skipped).toEqual(['README.md'])
    expect(await fs.read('README.md')).toBe('# Hand written\n')
  })

  it('overwrites an owned file edited by hand and says so', async () => {
    const fs = fixtureFs()
    await writeCompiled(await compileProject(fs), fs)
    const manifest = await readBuildManifest(fs)
    await fs.write('CLAUDE.md', '# edited by a human\n')

    const result = await writeCompiled(await compileProject(fs), fs, manifest)
    expect(result.modifiedSinceBuild).toEqual(['CLAUDE.md'])
    expect(await fs.read('CLAUDE.md')).toContain('Generated by Agent Blueprint')
  })

  it('writes the build manifest into the source directory', async () => {
    const fs = fixtureFs()
    await writeCompiled(await compileProject(fs), fs)
    const text = await fs.read('blueprint/build-manifest.json')
    expect(text).toBeDefined()
    expect(JSON.parse(text!)).toMatchObject({ schemaVersion: 1 })
  })
})

describe('compileProject', () => {
  it('carries read diagnostics through', async () => {
    const fs = new MemoryFs({})
    await expect(compileProject(fs)).rejects.toThrow()
  })
})
