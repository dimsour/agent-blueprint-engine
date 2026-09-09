import { diffBlueprints, renderProjectFiles } from '@agent-blueprint/core'
import { readStarterFiles, starterIds } from '@agent-blueprint/templates'
import { beforeEach, describe, expect, it } from 'vitest'

import { fileSystemStore } from './file-system'
import { IndexedDbStore, resetDbForTests } from './indexeddb'
import { importProject, openProject, parseProject, saveProject, summaryOf } from './project'
import { StorageError } from './types'
import { previewImport, readUpload } from './import'
import { filesToZip, zipToFiles } from './zip'

const files = () => readStarterFiles('react-expert')

describe('parseProject', () => {
  it('loads a starter and reports no problems', async () => {
    const { blueprint, diagnostics } = await parseProject(files())
    expect(diagnostics).toEqual([])
    expect(blueprint.id).toBe('react-expert')
    expect(summaryOf(blueprint)).toMatchObject({
      blueprintId: 'react-expert',
      name: 'React Expert',
    })
  })

  it('explains what is wrong when the files are not a project', async () => {
    await expect(parseProject({ 'readme.md': '# not a blueprint' })).rejects.toThrow(StorageError)
    await expect(parseProject({})).rejects.toThrow(/blueprint\.yaml/)
  })
})

describe('ZIP round trip', () => {
  it('returns exactly the files it was given', async () => {
    const original = files()
    const restored = await zipToFiles(await filesToZip(original))
    expect(Object.keys(restored).sort()).toEqual(Object.keys(original).sort())
    for (const [path, content] of Object.entries(original)) expect(restored[path]).toBe(content)
  })

  it('survives a trip through the Blueprint model unchanged', async () => {
    const restored = await zipToFiles(await filesToZip(files()))
    const { blueprint } = await parseProject(restored)
    expect(renderProjectFiles(blueprint)).toEqual(files())
  })

  it('unwraps the single top-level folder that zipping a directory produces', async () => {
    const wrapped = Object.fromEntries(
      Object.entries(files()).map(([path, content]) => [`my-agent/${path}`, content]),
    )
    const restored = await zipToFiles(await filesToZip(wrapped))
    expect(Object.keys(restored)).toContain('blueprint/blueprint.yaml')
  })

  it('rejects something that is not an archive', async () => {
    await expect(zipToFiles(new TextEncoder().encode('not a zip'))).rejects.toThrow(StorageError)
  })

  it('produces the same bytes for the same input, whenever it runs', async () => {
    const files = readStarterFiles('react-expert')
    const first = new Uint8Array(await (await filesToZip(files)).arrayBuffer())
    // Long enough that a wall-clock stamp would land in a different DOS timestamp second.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const second = new Uint8Array(await (await filesToZip(files)).arrayBuffer())

    expect(Array.from(second)).toEqual(Array.from(first))
  })

  it('ignores the files an archiver adds around a project', async () => {
    const wrapped: Record<string, string> = {
      '__MACOSX/._blueprint': 'resource fork',
      'my-agent/.DS_Store': 'finder junk',
    }
    for (const [path, content] of Object.entries(files())) wrapped[`my-agent/${path}`] = content

    const restored = await zipToFiles(await filesToZip(wrapped))
    expect(Object.keys(restored)).toContain('blueprint/blueprint.yaml')
  })

  it('does not unwrap a project whose own folder is called blueprint', async () => {
    const wrapped = Object.fromEntries(
      Object.entries(files()).map(([path, content]) => [`blueprint/${path}`, content]),
    )
    const restored = await zipToFiles(await filesToZip(wrapped))
    expect(Object.keys(restored)).toContain('blueprint/blueprint.yaml')
  })

  it('drops path segments that would escape the project', async () => {
    const restored = await zipToFiles(await filesToZip({ '../../etc/passwd': 'no', ...files() }))
    expect(Object.keys(restored).some((path) => path.includes('..'))).toBe(false)
  })

  // The acceptance criterion for the export and import pair: nothing is lost either way.
  it('changes nothing about any starter, measured as a change-set', async () => {
    for (const id of starterIds) {
      const original = (await parseProject(readStarterFiles(id))).blueprint
      const restored = (
        await parseProject(await zipToFiles(await filesToZip(readStarterFiles(id))))
      ).blueprint

      expect(diffBlueprints(original, restored).ops).toEqual([])
    }
  })
})

describe('reading an uploaded file', () => {
  const upload = (name: string, content: BlobPart) =>
    new File([content], name, { type: 'application/octet-stream' })

  it('reads a ZIP archive', async () => {
    const zip = await filesToZip(files())
    const read = await readUpload(upload('project.zip', zip))
    expect(read['blueprint/blueprint.yaml']).toBe(files()['blueprint/blueprint.yaml'])
  })

  it('treats a lone YAML file as the manifest', async () => {
    const manifest = files()['blueprint/blueprint.yaml'] ?? ''
    const read = await readUpload(upload('blueprint.yaml', manifest))
    expect(Object.keys(read)).toEqual(['blueprint/blueprint.yaml'])
  })

  it('goes by the bytes, not the file name', async () => {
    // An archive that lost its extension, and a manifest that was handed a wrong one.
    const zip = await filesToZip(files())
    expect(Object.keys(await readUpload(upload('download', zip)))).toContain(
      'blueprint/blueprint.yaml',
    )

    const manifest = files()['blueprint/blueprint.yaml'] ?? ''
    expect(Object.keys(await readUpload(upload('project.zip', manifest)))).toEqual([
      'blueprint/blueprint.yaml',
    ])
  })

  it('refuses binary that is neither an archive nor text', async () => {
    const binary = new Uint8Array([1, 2, 0, 3, 4])
    await expect(readUpload(upload('mystery.bin', binary))).rejects.toThrow(StorageError)
  })

  it('refuses an empty manifest rather than reporting it as a broken project', async () => {
    await expect(readUpload(upload('blueprint.yaml', '   '))).rejects.toThrow(StorageError)
  })
})

describe('previewImport', () => {
  it('reports what it found without storing anything', async () => {
    const preview = await previewImport(files(), 'react-expert.zip')

    expect(preview.label).toBe('react-expert.zip')
    expect(preview.blueprint.skills.length).toBeGreaterThan(0)
    expect(preview.errors).toEqual([])
    expect(await new IndexedDbStore().list()).toEqual([])
  })

  it('separates errors from warnings so the dialog can weigh them', async () => {
    // A manifest that names artifacts whose files are missing: the common broken import.
    const manifest = files()['blueprint/blueprint.yaml'] ?? ''
    const preview = await previewImport({ 'blueprint/blueprint.yaml': manifest }, 'blueprint.yaml')

    expect(preview.diagnostics.length).toBeGreaterThan(0)
    expect(preview.errors.length + preview.warnings.length).toBeLessThanOrEqual(
      preview.diagnostics.length,
    )
  })

  it('refuses files that are not a project at all', async () => {
    await expect(previewImport({ 'readme.md': '# hello' }, 'folder')).rejects.toThrow(StorageError)
  })
})

describe('IndexedDbStore', () => {
  let store: IndexedDbStore

  beforeEach(async () => {
    // Each test starts from an empty database, not from what the previous one left behind.
    await resetDbForTests()
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('agent-blueprint')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
    store = new IndexedDbStore()
  })

  it('is available in this environment', () => {
    expect(store.available).toBe(true)
  })

  it('saves, lists, opens and deletes a project', async () => {
    const { blueprint } = await parseProject(files())
    const summary = await store.importFiles(renderProjectFiles(blueprint), summaryOf(blueprint))

    expect(summary.id).toMatch(/^react-expert-/)
    expect(summary.artifacts).toBeGreaterThan(10)

    const listed = await store.list()
    expect(listed.map((entry) => entry.id)).toContain(summary.id)

    const reopened = await openProject(summary.id, store)
    expect(reopened.blueprint.id).toBe('react-expert')
    expect(reopened.diagnostics).toEqual([])

    await store.delete(summary.id)
    expect(await store.open(summary.id)).toBeUndefined()
    await expect(openProject(summary.id, store)).rejects.toThrow(StorageError)
  })

  it('lists the most recently saved project first', async () => {
    const { blueprint } = await parseProject(files())
    const first = await store.save('one', renderProjectFiles(blueprint), summaryOf(blueprint))
    const second = await store.save('two', renderProjectFiles(blueprint), {
      ...summaryOf(blueprint),
      name: 'Second',
    })
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt)
    expect((await store.list())[0]?.id).toBe('two')
  })

  it('round-trips an edited blueprint byte for byte', async () => {
    const { blueprint } = await parseProject(files())
    const edited = { ...blueprint, description: 'Now with a different description' }
    await saveProject('edited', edited, store)

    const reopened = await openProject('edited', store)
    expect(reopened.blueprint.description).toBe('Now with a different description')
    expect(renderProjectFiles(reopened.blueprint)).toEqual(renderProjectFiles(edited))
  })

  it('imports every starter blueprint', async () => {
    for (const id of starterIds) {
      const { summary, loaded } = await importProject(readStarterFiles(id), store)
      expect(loaded.diagnostics, id).toEqual([])
      expect(summary.blueprintId, id).toBe(id)
    }
    expect(await store.list()).toHaveLength(starterIds.length)
  })
})

describe('FileSystemAccessStore', () => {
  it('reports itself unavailable when the browser has no directory picker', async () => {
    expect(fileSystemStore.available).toBe(false)
    expect(await fileSystemStore.list()).toEqual([])
    await expect(fileSystemStore.pickDirectory()).rejects.toThrow(StorageError)
  })
})
