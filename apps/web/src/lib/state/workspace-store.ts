/**
 * The workspace store: one Blueprint, what is selected, and what is wrong with it.
 *
 * Two rules keep this honest. Every mutation goes through a core function
 * (`upsertEntity`, `renameEntity`, `deleteEntity`, `applyChangeSet`), so the app can never
 * produce a Blueprint the domain would reject. And only the Blueprint is tracked for
 * undo: selecting a different artifact is not something a user expects ⌘Z to reverse.
 *
 * Validation and autosave are debounced because both run on every keystroke in the Markdown
 * editor. Tests call `flushPending` instead of waiting.
 *
 * The store is a module singleton that outlives client-side navigation, so switching
 * projects has to be explicit about three things: the pending autosave belongs to the
 * project being left and is written before the switch, the undo history belongs to that
 * project and is discarded with it, and a save already in flight must not report its result
 * into whatever is loaded by the time it lands.
 */
import {
  type Blueprint,
  type ChangeSet,
  deleteEntity as coreDeleteEntity,
  renameEntity as coreRenameEntity,
  upsertEntity as coreUpsertEntity,
  applyChangeSet,
  createEntity,
  type Diagnostic,
  type EntityInputTypeMap,
  type EntityKind,
  type EntityRef,
  type ImpactReport,
  buildDependencyGraph,
  hasEntity,
  impactOf,
  validateBlueprint,
} from '@agent-blueprint/core'
import { create } from 'zustand'
import { temporal } from 'zundo'

import { saveProject } from '@/lib/storage'
import type { ProjectStore } from '@/lib/storage'

/** Sections of the workspace, used by the route's `?view=` parameter. */
export const WORKSPACE_VIEWS = [
  'overview',
  'agents',
  'skills',
  'workflows',
  'laws',
  'rules',
  'hooks',
  'gates',
  'tools',
  'references',
  'memory',
  'requirements',
  'scenarios',
  'compatibility',
  'evaluation',
  'export',
] as const

export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number]

export function isWorkspaceView(value: string | null | undefined): value is WorkspaceView {
  return typeof value === 'string' && (WORKSPACE_VIEWS as readonly string[]).includes(value)
}

/** The canvas tab for the selected artifact. Store state so a shortcut can reach it. */
export type ArtifactTab = 'visual' | 'source' | 'preview'

export const VALIDATION_DEBOUNCE_MS = 250
export const AUTOSAVE_DEBOUNCE_MS = 1200

export interface WorkspaceState {
  projectId?: string | undefined
  blueprint?: Blueprint | undefined
  selection?: EntityRef | undefined
  view: WorkspaceView
  artifactTab: ArtifactTab
  /**
   * Set while the artifact's project file does not parse. It lives here rather than in the
   * editor because the palette and the shortcuts can change the tab too, and all of them
   * have to refuse to walk away from an edit that was never applied.
   */
  sourceError?: string | undefined
  diagnostics: Diagnostic[]
  /** True while diagnostics are older than the Blueprint. */
  validating: boolean
  dirty: boolean
  saving: boolean
  lastSavedAt?: number | undefined
  /** Set when the last save failed; cleared by the next successful save. */
  saveError?: string | undefined

  load(projectId: string, blueprint: Blueprint, diagnostics?: Diagnostic[]): void
  close(): void

  upsert<K extends EntityKind>(kind: K, input: EntityInputTypeMap[K]): void
  /** Adds a new artifact of `kind`, selects it, and returns where it went. */
  create(kind: EntityKind, name: string): EntityRef | undefined
  rename(kind: EntityKind, oldId: string, newId: string): void
  remove(ref: EntityRef): void
  /** Applies a change-set and hands back the ops the domain refused, for the caller to report. */
  apply(changeSet: ChangeSet, accept?: string[]): { rejected: { opId: string; reason: string }[] }
  updateBlueprint(
    patch: Partial<Pick<Blueprint, 'name' | 'description' | 'version' | 'settings' | 'targets'>>,
  ): void

  select(ref?: EntityRef): void
  setView(view: WorkspaceView): void
  setArtifactTab(tab: ArtifactTab): void
  setSourceError(message: string | undefined): void
  /** Brings derived state back in line after undo or redo replaced the Blueprint. */
  afterHistory(): void

  /** What would be affected by deleting this artifact; shown before a delete is confirmed. */
  impact(ref: EntityRef): ImpactReport | undefined

  save(store?: ProjectStore): Promise<void>
  /** Runs any pending validation and autosave immediately, and awaits a save in flight. */
  flushPending(store?: ProjectStore): Promise<void>
  clearSaveError(): void
}

let validationTimer: ReturnType<typeof setTimeout> | undefined
let autosaveTimer: ReturnType<typeof setTimeout> | undefined
/** The save currently talking to storage, so `flushPending` can wait for it. */
let pendingSave: Promise<void> | undefined

function clearTimers(): void {
  if (validationTimer) clearTimeout(validationTimer)
  if (autosaveTimer) clearTimeout(autosaveTimer)
  validationTimer = undefined
  autosaveTimer = undefined
}

/**
 * Undo history belongs to one project. This is a function rather than a direct call so the
 * store's own actions can reach the temporal store, which only exists once the store does.
 */
function resetHistory(): void {
  useWorkspace.temporal.getState().clear()
}

export const useWorkspace = create<WorkspaceState>()(
  temporal(
    (set, get) => {
      /** Recomputes diagnostics and writes the project, both debounced. */
      const scheduleWork = (): void => {
        if (validationTimer) clearTimeout(validationTimer)
        validationTimer = setTimeout(() => {
          validationTimer = undefined
          const current = get().blueprint
          if (current) set({ diagnostics: validateBlueprint(current), validating: false })
        }, VALIDATION_DEBOUNCE_MS)

        if (autosaveTimer) clearTimeout(autosaveTimer)
        autosaveTimer = setTimeout(() => {
          autosaveTimer = undefined
          void get().save()
        }, AUTOSAVE_DEBOUNCE_MS)
      }

      /** Applies a new Blueprint and schedules validation and autosave. */
      const commit = (blueprint: Blueprint): void => {
        set({ blueprint, dirty: true, validating: true })
        scheduleWork()
      }

      /** Writes a debounced edit now, so leaving a project cannot drop it. */
      const flushAutosave = (): void => {
        if (!autosaveTimer) return
        clearTimeout(autosaveTimer)
        autosaveTimer = undefined
        void get().save()
      }

      return {
        view: 'overview',
        artifactTab: 'visual',
        diagnostics: [],
        validating: false,
        dirty: false,
        saving: false,

        load(projectId, blueprint, diagnostics) {
          // The debounced edit belongs to the project being left, not to this one.
          flushAutosave()
          clearTimers()
          set({
            projectId,
            blueprint,
            diagnostics: diagnostics ?? validateBlueprint(blueprint),
            selection: undefined,
            view: 'overview',
            artifactTab: 'visual',
            sourceError: undefined,
            validating: false,
            dirty: false,
            saving: false,
            lastSavedAt: undefined,
            saveError: undefined,
          })
          // Undo must not reach across projects, nor back past the load itself.
          resetHistory()
        },

        close() {
          flushAutosave()
          clearTimers()
          set({
            projectId: undefined,
            blueprint: undefined,
            selection: undefined,
            diagnostics: [],
            view: 'overview',
            artifactTab: 'visual',
            sourceError: undefined,
            dirty: false,
            validating: false,
            saving: false,
            lastSavedAt: undefined,
            saveError: undefined,
          })
          resetHistory()
        },

        upsert(kind, input) {
          const blueprint = get().blueprint
          if (!blueprint) return
          commit(coreUpsertEntity(blueprint, kind, input))
        },

        create(kind, name) {
          const blueprint = get().blueprint
          if (!blueprint) return undefined
          // `createEntity` owns what a minimum valid artifact of each kind is; the store
          // only decides that a new one becomes the selection.
          const entity = createEntity(blueprint, kind, { name })
          commit(coreUpsertEntity(blueprint, kind, entity as never))
          const ref = { kind, id: entity.id }
          set({ selection: ref, artifactTab: 'visual', sourceError: undefined })
          return ref
        },

        rename(kind, oldId, newId) {
          const blueprint = get().blueprint
          if (!blueprint) return
          // Throws RenameError for an invalid or taken id; the caller shows the message.
          const { blueprint: next } = coreRenameEntity(blueprint, kind, oldId, newId)
          commit(next)
          const selection = get().selection
          if (selection?.kind === kind && selection.id === oldId) {
            set({ selection: { kind, id: newId } })
          }
        },

        remove(ref) {
          const blueprint = get().blueprint
          if (!blueprint) return
          commit(coreDeleteEntity(blueprint, ref).blueprint)
          const selection = get().selection
          if (selection?.kind === ref.kind && selection.id === ref.id) {
            set({ selection: undefined, sourceError: undefined })
          }
        },

        apply(changeSet, accept) {
          const blueprint = get().blueprint
          if (!blueprint) return { rejected: [] }
          const result = applyChangeSet(blueprint, changeSet, accept ? { accept } : {})
          // Applying nothing changed nothing: committing would mark the project dirty and
          // record an undo step for a no-op.
          if (result.applied.length > 0) {
            commit(result.blueprint)
            const selection = get().selection
            if (selection && !hasEntity(result.blueprint, selection)) {
              set({ selection: undefined, sourceError: undefined })
            }
          }
          return { rejected: result.rejected.map((op) => ({ opId: op.opId, reason: op.reason })) }
        },

        updateBlueprint(patch) {
          const blueprint = get().blueprint
          if (!blueprint) return
          commit({ ...blueprint, ...patch })
        },

        select(ref) {
          // A different artifact opens on its form, never on the tab the last one was on.
          set({ selection: ref, artifactTab: 'visual', sourceError: undefined })
        },

        setView(view) {
          set({ view })
        },

        setArtifactTab(tab) {
          // An unparseable file cannot be shown as a form, so leaving is refused until it
          // parses. The guard lives here because the palette and the shortcuts set the tab
          // too, and every one of them has to respect it.
          if (get().sourceError !== undefined && tab !== 'source') return
          set({ artifactTab: tab })
        },

        setSourceError(message) {
          set({ sourceError: message })
        },

        afterHistory() {
          const blueprint = get().blueprint
          if (!blueprint) return
          // Undo replaced the Blueprint behind the store's back: everything derived from it
          // is stale, and the restored version is not what is on disk.
          set({ dirty: true, validating: true, sourceError: undefined })
          const selection = get().selection
          if (selection && !hasEntity(blueprint, selection)) set({ selection: undefined })
          scheduleWork()
        },

        impact(ref) {
          const blueprint = get().blueprint
          if (!blueprint) return undefined
          return impactOf(buildDependencyGraph(blueprint), ref)
        },

        async save(store) {
          const { projectId, blueprint } = get()
          if (!projectId || !blueprint) return

          const write = (async () => {
            set({ saving: true })
            try {
              await saveProject(projectId, blueprint, store)
              const current = get()
              // A save reports only on the project it wrote, and clears `dirty` only when
              // nothing was edited while it was in flight.
              if (current.projectId !== projectId) return
              set({
                saving: false,
                dirty: current.blueprint !== blueprint,
                lastSavedAt: Date.now(),
                saveError: undefined,
              })
            } catch (error) {
              if (get().projectId !== projectId) return
              set({
                saving: false,
                saveError: error instanceof Error ? error.message : String(error),
              })
            }
          })()

          pendingSave = write
          await write
          if (pendingSave === write) pendingSave = undefined
        },

        async flushPending(store) {
          if (validationTimer) {
            clearTimeout(validationTimer)
            validationTimer = undefined
            const blueprint = get().blueprint
            if (blueprint) set({ diagnostics: validateBlueprint(blueprint), validating: false })
          }
          if (autosaveTimer) {
            clearTimeout(autosaveTimer)
            autosaveTimer = undefined
            await get().save(store)
          }
          // A save may already have been in flight when this was called.
          await pendingSave
        },

        clearSaveError() {
          set({ saveError: undefined })
        },
      }
    },
    {
      // Undo restores the Blueprint, not the user's place in the app.
      partialize: (state) => ({ blueprint: state.blueprint }),
      limit: 100,
      equality: (a, b) => a.blueprint === b.blueprint,
    },
  ),
)

/**
 * Undo and redo, for the palette and the keyboard shortcuts.
 *
 * zundo writes the Blueprint straight into the store, bypassing every action, so each of
 * these has to put the derived state back in order afterwards.
 */
export const workspaceHistory = {
  undo: () => {
    useWorkspace.temporal.getState().undo()
    useWorkspace.getState().afterHistory()
  },
  redo: () => {
    useWorkspace.temporal.getState().redo()
    useWorkspace.getState().afterHistory()
  },
  clear: () => useWorkspace.temporal.getState().clear(),
  get canUndo() {
    return useWorkspace.temporal.getState().pastStates.length > 0
  },
  get canRedo() {
    return useWorkspace.temporal.getState().futureStates.length > 0
  },
}

/** Diagnostics for one artifact, for the tree badges and the inspector. */
export function diagnosticsFor(diagnostics: readonly Diagnostic[], ref: EntityRef): Diagnostic[] {
  return diagnostics.filter(
    (diagnostic) =>
      (diagnostic.ref?.kind === ref.kind && diagnostic.ref.id === ref.id) ||
      diagnostic.related?.some((related) => related.kind === ref.kind && related.id === ref.id),
  )
}
