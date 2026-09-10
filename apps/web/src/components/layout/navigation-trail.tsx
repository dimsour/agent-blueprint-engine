'use client'

/**
 * Is the page behind this one ours? (P9-02)
 *
 * A back control that leaves the app is worse than no back control, so the question has to be
 * answered by something that cannot be wrong, not by a heuristic. None of the obvious signals
 * qualify:
 *
 *   - `document.referrer` is set once per document load and is never updated by the client
 *     router, so after `/` → `/settings` it still names whatever referred to `/`, which is
 *     usually nothing at all.
 *   - `history.length` counts entries this tab has ever had, including ones from other sites,
 *     and never shrinks.
 *   - `window.history.state` does carry the App Router's own bookkeeping, but under private
 *     keys that are not part of any contract.
 *
 * What is certain: this app is a single document, so a move between two of its routes always
 * goes through the client router and never reloads the page. If the pathname has changed at
 * least once since this document loaded, the entry behind the current one was rendered by
 * this app, and `router.back()` stays inside it. If it has not, the entry behind belongs to
 * whatever the tab was showing before — a bookmark, a pasted link, a search result, or
 * nothing — and the only safe destination is `/`.
 *
 * The count lives in module scope, which is the whole trick: a full document load re-evaluates
 * this module and resets it, and a client-side navigation does not. That also settles the
 * awkward case honestly — reloading `/settings` forgets the project it was opened from and
 * offers `/` instead. Going somewhere sensible beats going somewhere surprising.
 */
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/** Route changes made by the client router since this document loaded. */
let navigations = 0

/** The last pathname seen, so the first render is a starting point rather than a move. */
let seen: string | undefined

/**
 * Whether the previous history entry was rendered by this app.
 *
 * Read it in an event handler, never during render: it is not React state, and a component
 * that rendered from it would disagree with the DOM the server produced.
 */
export function cameFromInsideTheApp(): boolean {
  return navigations > 0
}

/** Mounted once, in the root layout, so every route change is counted wherever it happens. */
export function NavigationTrail() {
  const pathname = usePathname()

  useEffect(() => {
    if (seen === undefined) {
      seen = pathname
      return
    }
    if (seen === pathname) return
    seen = pathname
    navigations += 1
  }, [pathname])

  return null
}
