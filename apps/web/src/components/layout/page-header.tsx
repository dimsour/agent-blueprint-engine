'use client'

/**
 * The header for the routes that are not the workspace (P9-02).
 *
 * `/settings` and `/new` used to be dead ends: an uppercase wordmark that happened to be a
 * link, and otherwise the browser's own back button. This gives both the same three things —
 * the mark, a way back, and the page's title — from one place, so a third route cannot invent
 * a fourth arrangement.
 *
 * The back control is a real link to `/`, and only the click is intercepted. That keeps the
 * fallback honest: middle-click, ⌘-click and "copy link address" all get `/`, the status bar
 * shows where an unmodified click would land if the history could not be trusted, and a
 * plain click goes back only when `cameFromInsideTheApp` says the entry behind us is ours.
 */
import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MouseEvent, ReactNode } from 'react'

import { Logo } from '@/components/layout/logo'
import { cameFromInsideTheApp } from '@/components/layout/navigation-trail'
import { ThemeToggle } from '@/components/theme'
import { Button } from '@/components/ui/button'

export interface PageHeaderProps {
  title: string
  /** One line under the title, when the route needs to say what it is for. */
  description?: string
  /** Controls that belong to this route, placed before the theme toggle. */
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const router = useRouter()

  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click is a request for a new tab or a saved link, and neither of those wants
    // this tab's history.
    if (event.defaultPrevented) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    if (!cameFromInsideTheApp()) return
    event.preventDefault()
    router.back()
  }

  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/" onClick={goBack}>
            <ArrowLeftIcon />
            Back
          </Link>
        </Button>

        <Link
          href="/"
          aria-label="Agent Blueprint home"
          className="focus-visible:ring-accent shrink-0 rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <Logo size={28} />
        </Link>

        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  )
}
