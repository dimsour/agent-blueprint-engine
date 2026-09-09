'use client'

/**
 * The workspace address bar.
 *
 * `?view=` and `&id=` are the workspace's coordinates, so a link to an artifact is a link
 * and a reload puts you back where you were. The store stays the authority: the URL is
 * written from it and read into it, and neither direction fires when the two already agree,
 * which is what keeps the loop from running.
 */
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import { isReportView, useWorkspace, viewFromParam, viewParam } from '@/lib/state/workspace-store'

/** The address the current selection and view describe. */
export function workspaceHref(
  projectId: string,
  view: ReturnType<typeof viewFromParam> | 'overview',
  id: string | undefined,
): string {
  const params = new URLSearchParams()
  params.set('view', viewParam(view ?? 'overview'))
  if (id) params.set('id', id)
  return `/p/${projectId}?${params.toString()}`
}

export function useUrlState(projectId: string, ready: boolean): void {
  const router = useRouter()
  const search = useSearchParams()
  const view = useWorkspace((state) => state.view)
  const selection = useWorkspace((state) => state.selection)

  const urlView = search.get('view')
  const urlId = search.get('id')

  // The URL leads: a first load, a pasted link, and the back button all arrive this way.
  useEffect(() => {
    if (!ready) return
    const { select, setView, blueprint } = useWorkspace.getState()
    if (!blueprint) return

    const wanted = viewFromParam(urlView) ?? 'overview'
    // Only a kind section can name an artifact; the reports are about the whole Blueprint.
    if (!isReportView(wanted) && urlId) {
      const current = useWorkspace.getState().selection
      if (current?.kind !== wanted || current.id !== urlId) select({ kind: wanted, id: urlId })
      return
    }
    if (useWorkspace.getState().selection) select(undefined)
    setView(wanted)
  }, [ready, urlView, urlId])

  // The store follows: selecting in the tree, the palette or the inspector rewrites the URL.
  useEffect(() => {
    if (!ready) return
    const nextView = viewParam(view)
    const nextId = selection?.id ?? null
    if (nextView === urlView && nextId === urlId) return

    const params = new URLSearchParams()
    params.set('view', nextView)
    if (nextId) params.set('id', nextId)
    // Replaced rather than pushed: selecting an artifact is moving around inside one
    // document, not visiting a new one, so the back button leaves the workspace instead of
    // walking a trail of every artifact that was clicked on the way here.
    router.replace(`/p/${projectId}?${params.toString()}`, { scroll: false })
  }, [ready, router, projectId, view, selection, urlView, urlId])
}
