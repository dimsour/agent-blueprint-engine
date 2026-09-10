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
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityInputTypeMap,
  type EntityKind,
  type EntityRef,
  type ImpactReport,
  buildDependencyGraph,
  hasEntity,
  impactOf,
  sortDiagnostics,
  validateBlueprint,
} from '@agent-blueprint/core'
import { create, useStore } from 'zustand'
import { temporal, type TemporalState as ZundoTemporalState } from 'zundo'

import { saveProject } from '@/lib/storage'
import type { ProjectStore } from '@/lib/storage'

/** The sections that are not one entity kind. */
export const REPORT_VIEWS = ['overview', 'evaluation', 'compatibility', 'export'] as const

export type ReportView = (typeof REPORT_VIEWS)[number]

/**
 * Which section of the workspace the canvas is showing: a report about the whole Blueprint,
 * or one kind of artifact.
 *
 * A kind is stored rather than its URL spelling, so there is no second list of section names
 * to keep in step with the model.
 */
export type WorkspaceView = ReportView | EntityKind

export function isReportView(view: WorkspaceView): view is ReportView {
  return (REPORT_VIEWS as readonly string[]).includes(view)
}

/** How a view is written in `?view=`; for a kind, the directory it occupies. */
export function viewParam(view: WorkspaceView): string {
  return isReportView(view) ? view : ENTITY_KIND_INFO[view].dir
}

export function viewFromParam(value: string | null | undefined): WorkspaceView | undefined {
  if (typeof value !== 'string') return undefined
  if ((REPORT_VIEWS as readonly string[]).includes(value)) return value as ReportView
  return ENTITY_KINDS.find((kind) => ENTITY_KIND_INFO[kind].dir === value)
}

/** The canvas tab for the selected artifact. Store state so a shortcut can reach it. */
export type ArtifactTab = 'visual' | 'graph' | 'source' | 'preview'

/** A workflow opens on its graph: it is a drawing, and the form is the second-best view. */
export function defaultTabFor(ref: EntityRef | undefined): ArtifactTab {
  return ref?.kind === 'workflow' ? 'graph' : 'visual'
}

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
  /**
   * A step inside the selected workflow to open on. Set when a finding names one, so that
   * clicking a workflow diagnostic lands on the step it is about rather than the graph.
   */
  focusNodeId?: string | undefined
  diagnostics: Diagnostic[]
  /**
   * What the reader said about the files, kept apart from what the validator says about the
   * Blueprint. `validateBlueprint` cannot recompute these — they are about bytes on disk, not
   * about the model — so they would be lost the first time anything is revalidated. They stop
   * being true when the project is written, and the save clears them.
   */
  projectDiagnostics: Diagnostic[]
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
  /** Adds a new artifact of `kind` and returns where it went, leaving the selection alone. */
  add(kind: EntityKind, name: string): EntityRef | undefined
  /** Adds a new artifact and opens it. */
  create(kind: EntityKind, name: string): EntityRef | undefined
  /** Renames and returns how many references were rewritten, for the caller to report. */
  rename(kind: EntityKind, oldId: string, newId: string): number
  remove(ref: EntityRef): void
  /** Applies a change-set and hands back the ops the domain refused, for the caller to report. */
  apply(changeSet: ChangeSet, accept?: string[]): { rejected: { opId: string; reason: string }[] }
  updateBlueprint(
    patch: Partial<Pick<Blueprint, 'name' | 'description' | 'version' | 'settings' | 'targets'>>,
  ): void

  select(ref?: EntityRef, options?: { nodeId?: string }): void
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

type TemporalState = ZundoTemporalState<{ blueprint: Blueprint | undefined }>

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
      /**
       * Every finding the workspace shows, from both places they come from.
       *
       * One function so that no caller can produce a shorter list than another. The bug that
       * made it one: `load` took the reader's diagnostics and, because an empty array is not
       * nullish, `diagnostics ?? validateBlueprint(blueprint)` kept the empty array and never
       * validated. A project opened clean and stayed clean until the first keystroke, which
       * is when the debounced revalidation finally ran (P9-11).
       */
      const findings = (blueprint: Blueprint, project: readonly Diagnostic[]): Diagnostic[] =>
        sortDiagnostics([...project, ...validateBlueprint(blueprint)])

      /** Recomputes diagnostics and writes the project, both debounced. */
      const scheduleWork = (): void => {
        if (validationTimer) clearTimeout(validationTimer)
        validationTimer = setTimeout(() => {
          validationTimer = undefined
          const { blueprint: current, projectDiagnostics } = get()
          if (current) {
            set({ diagnostics: findings(current, projectDiagnostics), validating: false })
          }
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
        projectDiagnostics: [],
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
            diagnostics: findings(blueprint, diagnostics ?? []),
            projectDiagnostics: [...(diagnostics ?? [])],
            selection: undefined,
            view: 'overview',
            artifactTab: 'visual',
            sourceError: undefined,
            focusNodeId: undefined,
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
            projectDiagnostics: [],
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

        add(kind, name) {
          const blueprint = get().blueprint
          if (!blueprint) return undefined
          // `createEntity` owns what a minimum valid artifact of each kind is.
          const entity = createEntity(blueprint, kind, { name })
          commit(coreUpsertEntity(blueprint, kind, entity as never))
          return { kind, id: entity.id }
        },

        create(kind, name) {
          // Adding from a picker must not navigate away from the form being filled in, so
          // opening the new artifact is a separate decision from making it.
          const ref = get().add(kind, name)
          if (ref)
            set({
              selection: ref,
              view: kind,
              artifactTab: defaultTabFor(ref),
              sourceError: undefined,
            })
          return ref
        },

        rename(kind, oldId, newId) {
          const blueprint = get().blueprint
          if (!blueprint) return 0
          // Throws RenameError for an invalid or taken id; the caller shows the message.
          const { blueprint: next, updatedRefs } = coreRenameEntity(blueprint, kind, oldId, newId)
          commit(next)
          const selection = get().selection
          if (selection?.kind === kind && selection.id === oldId) {
            set({ selection: { kind, id: newId } })
          }
          return updatedRefs
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

        select(ref, options) {
          // A different artifact opens on its form, never on the tab the last one was on.
          // The view follows the selection so that the URL, the tree and the canvas agree.
          set({
            selection: ref,
            view: ref ? ref.kind : 'overview',
            artifactTab: defaultTabFor(ref),
            sourceError: undefined,
            focusNodeId: options?.nodeId,
          })
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
          // Held by identity, not by content: a project reopened under the same id while
          // this save was in flight has a different array, and its findings are not ours to
          // retire. `projectId` alone does not separate those two.
          const readFindings = get().projectDiagnostics

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
                // The reader's findings were about the files this save has just rewritten —
                // an artifact missing its file, a file the manifest did not list, a source
                // directory that had moved. The write is what fixes all of them, and it is
                // the remedy the catalogue names for three of the five.
                ...(readFindings.length > 0 && current.projectDiagnostics === readFindings
                  ? {
                      projectDiagnostics: [],
                      diagnostics: findings(current.blueprint ?? blueprint, []),
                    }
                  : {}),
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
            const { blueprint, projectDiagnostics } = get()
            if (blueprint) {
              set({ diagnostics: findings(blueprint, projectDiagnostics), validating: false })
            }
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

/**
 * Subscribe to the undo history itself, for controls whose enabled state depends on it.
 * Reading `workspaceHistory.canUndo` during render does not subscribe to anything.
 */
export const useHistoryState = <T>(select: (state: TemporalState) => T): T =>
  useStore(useWorkspace.temporal, select)

/** Diagnostics for one artifact, for the tree badges and the inspector. */
export function diagnosticsFor(diagnostics: readonly Diagnostic[], ref: EntityRef): Diagnostic[] {
  return diagnostics.filter(
    (diagnostic) =>
      (diagnostic.ref?.kind === ref.kind && diagnostic.ref.id === ref.id) ||
      diagnostic.related?.some((related) => related.kind === ref.kind && related.id === ref.id),
  )
}
