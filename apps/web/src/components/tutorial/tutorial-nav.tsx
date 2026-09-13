'use client'

/**
 * The tutorial's navigation (P9-39).
 *
 * The page is one long read, and a list of links at the top is out of reach after the first
 * screen. So the list travels: a sidebar that stays put beside the text on a wide screen, and
 * on a narrow one a bar that stays at the top with the sections in a menu. Both mark the
 * section the reader is in, which is what tells them where they are as well as where they
 * can go.
 *
 * The one client component on a page that otherwise reads nothing: it needs the scroll.
 */
import { useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

export interface NavItem {
  id: string
  title: string
}

export interface NavGroup {
  id: string
  title: string
  items: NavItem[]
}

/** The section whose heading is nearest the top of the screen, or the first when none is. */
function useCurrentSection(ids: readonly string[]): string | undefined {
  const [current, setCurrent] = useState<string | undefined>()

  useEffect(() => {
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        // The first in reading order, so a long section stays current while its pictures
        // scroll past and the next one takes over only when its heading arrives.
        const first = ids.find((id) => visible.has(id))
        if (first) setCurrent(first)
      },
      // A band across the upper part of the screen: a section is current while it crosses it.
      { rootMargin: '-8% 0px -60% 0px' },
    )
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [ids])

  return current
}

export function TutorialNav({ groups }: { groups: NavGroup[] }) {
  const ids = useMemo(
    () => groups.flatMap((group) => [group.id, ...group.items.map((item) => item.id)]),
    [groups],
  )
  const current = useCurrentSection(ids)
  // The menu lists sections only; between two halves, it shows its placeholder.
  const currentItem = groups.some((group) => group.id === current) ? '' : (current ?? '')

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
    history.replaceState(null, '', `#${id}`)
  }

  return (
    <>
      {/* Wide screens: beside the text, and it stays there. */}
      <aside
        aria-label="Contents"
        className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-56 shrink-0 self-start overflow-y-auto pr-4 lg:block"
      >
        {groups.map((group) => (
          <nav key={group.id} aria-label={group.title} className="mb-5 flex flex-col gap-0.5">
            <a
              href={`#${group.id}`}
              className={cn(
                'mb-1 text-xs font-semibold tracking-wide uppercase',
                current === group.id ? 'text-accent' : 'text-muted-foreground',
              )}
            >
              {group.title}
            </a>
            {group.items.map((item, index) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={current === item.id ? 'location' : undefined}
                className={cn(
                  'flex items-baseline gap-2 rounded-md border-l-2 py-1 pr-2 pl-2.5 text-sm transition-colors',
                  current === item.id
                    ? 'border-accent bg-accent-muted text-accent font-medium'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                <span className="w-4 shrink-0 text-xs tabular-nums">{index + 1}</span>
                <span className="min-w-0">{item.title}</span>
              </a>
            ))}
          </nav>
        ))}
      </aside>

      {/* Narrow screens: a bar that stays at the top, with the sections in a menu. */}
      <div className="bg-background sticky top-0 z-10 -mx-6 flex items-center gap-3 border-b px-6 py-2 lg:hidden">
        <label htmlFor="tutorial-jump" className="text-muted-foreground shrink-0 text-xs">
          Jump to
        </label>
        <select
          id="tutorial-jump"
          value={currentItem}
          onChange={(event) => jump(event.target.value)}
          className="bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
        >
          <option value="" disabled>
            A section
          </option>
          {groups.map((group) => (
            <optgroup key={group.id} label={group.title}>
              {group.items.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {index + 1} · {item.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </>
  )
}
