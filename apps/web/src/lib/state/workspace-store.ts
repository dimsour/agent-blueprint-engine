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
 */
import {
  type Blueprint,
  type ChangeSet,
  deleteEntity as coreDeleteEntity,
  renameEntity as coreRenameEntity,
  upsertEntity as coreUpsertEntity,
  applyChangeSet,
  type Diagnostic,
  type EntityInputTypeMap,
  type EntityKind,
  type EntityRef,
  type ImpactReport,
  buildDependencyGraph,
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

export const VALIDATION_DEBOUNCE_MS = 250
export const AUTOSAVE_DEBOUNCE_MS = 1200

export interface WorkspaceState {
  projectId?: string | undefined
  blueprint?: Blueprint | undefined
  selection?: EntityRef | undefined
  view: WorkspaceView
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
  rename(kind: EntityKind, oldId: string, newId: string): void
  remove(ref: EntityRef): void
  apply(changeSet: ChangeSet, accept?: string[]): void
  updateBlueprint(
    patch: Partial<Pick<Blueprint, 'name' | 'description' | 'version' | 'settings' | 'targets'>>,
  ): void

  select(ref?: EntityRef): void
  setView(view: WorkspaceView): void

  /** What would be affected by deleting this artifact; shown before a delete is confirmed. */
  impact(ref: EntityRef): ImpactReport | undefined

  save(store?: ProjectStore): Promise<void>
  /** Runs any pending validation and autosave immediately. */
  flushPending(store?: ProjectStore): Promise<void>
}

let validationTimer: ReturnType<typeof setTimeout> | undefined
let autosaveTimer: ReturnType<typeof setTimeout> | undefined

function clearTimers(): void {
  if (validationTimer) clearTimeout(validationTimer)
  if (autosaveTimer) clearTimeout(autosaveTimer)
  validationTimer = undefined
  autosaveTimer = undefined
}

export const useWorkspace = create<WorkspaceState>()(
  temporal(
    (set, get) => {
      /** Applies a new Blueprint and schedules validation and autosave. */
      const commit = (blueprint: Blueprint): void => {
        set({ blueprint, dirty: true, validating: true })

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

      return {
        view: 'overview',
        diagnostics: [],
        validating: false,
        dirty: false,
        saving: false,

        load(projectId, blueprint, diagnostics) {
          clearTimers()
          set({
            projectId,
            blueprint,
            diagnostics: diagnostics ?? validateBlueprint(blueprint),
            selection: undefined,
            view: 'overview',
            validating: false,
            dirty: false,
            saving: false,
            saveError: undefined,
          })
        },

        close() {
          clearTimers()
          set({
            projectId: undefined,
            blueprint: undefined,
            selection: undefined,
            diagnostics: [],
            dirty: false,
            validating: false,
            saveError: undefined,
          })
        },

        upsert(kind, input) {
          const blueprint = get().blueprint
          if (!blueprint) return
          commit(coreUpsertEntity(blueprint, kind, input))
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
          if (selection?.kind === ref.kind && selection.id === ref.id) set({ selection: undefined })
        },

        apply(changeSet, accept) {
          const blueprint = get().blueprint
          if (!blueprint) return
          const result = applyChangeSet(blueprint, changeSet, accept ? { accept } : {})
          commit(result.blueprint)
        },

        updateBlueprint(patch) {
          const blueprint = get().blueprint
          if (!blueprint) return
          commit({ ...blueprint, ...patch })
        },

        select(ref) {
          set({ selection: ref })
        },

        setView(view) {
          set({ view })
        },

        impact(ref) {
          const blueprint = get().blueprint
          if (!blueprint) return undefined
          return impactOf(buildDependencyGraph(blueprint), ref)
        },

        async save(store) {
          const { projectId, blueprint } = get()
          if (!projectId || !blueprint) return
          set({ saving: true })
          try {
            await saveProject(projectId, blueprint, store)
            set({ saving: false, dirty: false, lastSavedAt: Date.now(), saveError: undefined })
          } catch (error) {
            set({
              saving: false,
              saveError: error instanceof Error ? error.message : String(error),
            })
          }
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

/** Undo and redo, for the palette and the keyboard shortcuts. */
export const workspaceHistory = {
  undo: () => useWorkspace.temporal.getState().undo(),
  redo: () => useWorkspace.temporal.getState().redo(),
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
