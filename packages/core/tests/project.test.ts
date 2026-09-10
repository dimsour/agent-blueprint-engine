import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { describe, expect, it } from 'vitest'

import {
  canonicalJson,
  fromBase64,
  countEntities,
  decodeFrontmatter,
  encodeFrontmatter,
  MemoryFs,
  normalizeBlueprint,
  PROJECT_DIAGNOSTICS,
  ProjectReadError,
  readProject,
  renderProjectFiles,
  writeProject,
} from '../src/index'
import { fixtureFs, loadFixture } from './helpers'

describe('frontmatter', () => {
  it('round-trips data and body', () => {
    const encoded = encodeFrontmatter({ name: 'X', tags: ['a'] }, '# Title\n\nBody')
    expect(encoded).toBe('---\nname: X\ntags:\n  - a\n---\n\n# Title\n\nBody\n')
    expect(decodeFrontmatter(encoded)).toEqual({
      data: { name: 'X', tags: ['a'] },
      body: '# Title\n\nBody',
    })
  })

  it('handles an empty body and CRLF input', () => {
    expect(encodeFrontmatter({ name: 'X' }, '')).toBe('---\nname: X\n---\n')
    expect(decodeFrontmatter('---\r\nname: X\r\n---\r\n\r\nBody\r\n')).toEqual({
      data: { name: 'X' },
      body: 'Body',
    })
  })
})

describe('canonicalJson', () => {
  it('sorts keys deeply and ends with a newline', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } })).toBe(
      '{\n  "a": {\n    "c": 2,\n    "d": [\n      3,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n',
    )
  })
})

describe('readProject', () => {
  it('loads the fixture without diagnostics', async () => {
    const result = await readProject(fixtureFs())
    expect(result.diagnostics).toEqual([])
    expect(result.sourceSchemaVersion).toBe('1.0')
    expect(result.blueprint.id).toBe('dotnet-testing-expert')
    expect(result.blueprint.agents).toHaveLength(1)
    expect(result.blueprint.skills.map((s) => s.id)).toEqual([
      'xunit',
      'test-design',
      'fluent-assertions',
    ])
    expect(result.blueprint.skills[0]?.resources).toEqual([
      expect.objectContaining({ path: 'references/xunit-patterns.md', kind: 'reference' }),
    ])
    expect(result.blueprint.workflows[0]?.nodes.length).toBe(7)
    expect(countEntities(result.blueprint)).toBe(19)
  })

  it('fails loudly without a manifest', async () => {
    await expect(readProject(new MemoryFs({}))).rejects.toBeInstanceOf(ProjectReadError)
  })

  it('reports a listed-but-missing artifact and an unlisted one', async () => {
    const files = readFixtureFiles('dotnet-testing-expert')
    delete files['blueprint/tools/filesystem.yaml']
    files['blueprint/rules/extra-rule.md'] = '---\nname: Extra\nguidance: Be nice.\n---\n'
    const result = await readProject(new MemoryFs(files))
    expect(result.diagnostics.map((d) => d.code).sort()).toEqual([
      PROJECT_DIAGNOSTICS.ARTIFACT_MISSING,
      PROJECT_DIAGNOSTICS.ARTIFACT_UNLISTED,
    ])
    expect(result.blueprint.tools.map((t) => t.id)).toEqual(['dotnet-cli'])
    expect(result.blueprint.rules.map((r) => r.id)).toEqual([
      'prefer-existing-framework',
      'extra-rule',
    ])
  })

  it('skips an invalid artifact with an error diagnostic', async () => {
    const files = readFixtureFiles('dotnet-testing-expert')
    files['blueprint/gates/tests-pass.yaml'] = 'name: Broken\nonFail: explode\n'
    const result = await readProject(new MemoryFs(files))
    const errors = result.diagnostics.filter((d) => d.severity === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe(PROJECT_DIAGNOSTICS.ARTIFACT_INVALID)
    expect(errors[0]?.ref).toEqual({ kind: 'gate', id: 'tests-pass' })
    expect(result.blueprint.gates).toEqual([])
  })

  it('keeps unknown frontmatter keys under metadata', async () => {
    const files = readFixtureFiles('dotnet-testing-expert')
    files['blueprint/rules/prefer-existing-framework.md'] = files[
      'blueprint/rules/prefer-existing-framework.md'
    ]!.replace('---\nname:', '---\nowner: platform-team\nname:')
    const result = await readProject(new MemoryFs(files))
    expect(result.diagnostics.map((d) => d.code)).toEqual([PROJECT_DIAGNOSTICS.UNKNOWN_KEYS_KEPT])
    expect(result.blueprint.rules[0]?.metadata).toEqual({ owner: 'platform-team' })
  })
})

describe('writeProject', () => {
  it('reproduces the fixture byte for byte (fixture is canonical)', async () => {
    const bp = await loadFixture()
    const rendered = renderProjectFiles(bp)
    const expected = readFixtureFiles('dotnet-testing-expert')
    expect(Object.keys(rendered)).toEqual(Object.keys(expected))
    for (const path of Object.keys(expected)) expect(rendered[path], path).toBe(expected[path])
  })

  it('is deterministic and idempotent', async () => {
    const bp = await loadFixture()
    const first = renderProjectFiles(bp)
    const second = renderProjectFiles(structuredClone(bp))
    expect(second).toEqual(first)

    const reread = await readProject(new MemoryFs(first))
    expect(reread.diagnostics).toEqual([])
    expect(renderProjectFiles(reread.blueprint)).toEqual(first)
    expect(normalizeBlueprint(reread.blueprint)).toEqual(bp)
  })

  it('ignores cosmetic differences in the source', async () => {
    const bp = await loadFixture()
    const shuffled = structuredClone(bp)
    // Reorder keys, add trailing whitespace, CRLF and duplicate ids: none of it should show.
    const agent = shuffled.agents[0]!
    shuffled.agents[0] = {
      ...agent,
      body: `${agent.body.replace(/\n/g, '\r\n')}   \n\n`,
      skillIds: [...agent.skillIds, 'xunit'],
    }
    const wf = shuffled.workflows[0]!
    wf.nodes = [...wf.nodes].reverse()
    expect(renderProjectFiles(shuffled)).toEqual(renderProjectFiles(bp))
  })

  it('writes only changed files and prunes stale artifacts', async () => {
    const bp = await loadFixture()
    const fs = fixtureFs()
    await fs.write('blueprint/skills/obsolete/SKILL.md', '---\nname: Obsolete\n---\n')
    await fs.write('blueprint/notes.md', 'user notes, not an artifact')

    const result = await writeProject(bp, fs)
    expect(result.written).toEqual([])
    expect(result.deleted).toEqual(['blueprint/skills/obsolete/SKILL.md'])
    expect(await fs.exists('blueprint/notes.md')).toBe(true)

    const edited = structuredClone(bp)
    edited.skills[0]!.description = 'Changed.'
    const second = await writeProject(edited, fs)
    expect(second.written).toEqual(['blueprint/skills/xunit/SKILL.md'])
    expect(second.deleted).toEqual([])
  })
})

/**
 * A skill's `assets/` may hold a diagram or a font. Nothing in the model is bytes — it has to
 * survive a ChangeSet, undo history and IndexedDB — so a binary resource carries base64 and an
 * `encoding` field, and the bytes on disk stay the bytes. These tests are about the seam
 * between those two facts, which is the only place the file can be lost.
 */
describe('binary skill resources', () => {
  /** A one-pixel PNG: a real header, a NUL byte, and not valid UTF-8. */
  const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0xff, 0xfe, 0x00, 0x01,
  ])

  async function projectWithAsset(): Promise<MemoryFs> {
    const fs = fixtureFs()
    await fs.writeBinary('blueprint/skills/xunit/assets/diagram.png', PNG)
    return fs
  }

  it('reads bytes as base64 and text as itself', async () => {
    const { blueprint } = await readProject(await projectWithAsset())
    const skill = blueprint.skills.find((candidate) => candidate.id === 'xunit')!

    const asset = skill.resources.find((r) => r.path === 'assets/diagram.png')!
    expect(asset.encoding).toBe('base64')
    expect(asset.kind).toBe('asset')
    expect(fromBase64(asset.content)).toEqual(PNG)

    // The reference beside it is text and stays text: the decision is per file, not per skill.
    const reference = skill.resources.find((r) => r.path.endsWith('.md'))!
    expect(reference.encoding).toBe('utf8')
    expect(reference.content).toContain('#')
  })

  it('writes back the bytes it read, with nothing appended', async () => {
    const source = await projectWithAsset()
    const { blueprint } = await readProject(source)

    const target = new MemoryFs()
    await writeProject(blueprint, target)

    // A trailing newline is added to text resources and would corrupt this one.
    expect(await target.readBinary('blueprint/skills/xunit/assets/diagram.png')).toEqual(PNG)
  })

  it('round-trips byte for byte, twice', async () => {
    const source = await projectWithAsset()
    const first = await readProject(source)
    const target = new MemoryFs()
    await writeProject(first.blueprint, target)
    const second = await readProject(target)

    expect(second.blueprint).toEqual(first.blueprint)
    expect(second.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('does not rewrite an asset that has not changed', async () => {
    const fs = await projectWithAsset()
    const { blueprint } = await readProject(fs)

    const result = await writeProject(blueprint, fs)
    expect(result.written).toEqual([])
  })

  it('reads a text file with an unfamiliar extension as text', async () => {
    const fs = fixtureFs()
    await fs.write('blueprint/skills/xunit/assets/notes.dat', 'plain text\n')
    const { blueprint } = await readProject(fs)
    const asset = blueprint.skills
      .find((candidate) => candidate.id === 'xunit')!
      .resources.find((r) => r.path === 'assets/notes.dat')!

    // The content decides, not the extension: an extension list gets this exact case wrong.
    expect(asset.encoding).toBe('utf8')
    expect(asset.content).toBe('plain text')
  })
})
