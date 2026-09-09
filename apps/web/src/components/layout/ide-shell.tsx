'use client'

/**
 * The IDE layout: a top bar, three resizable columns and a health bar.
 *
 * The shell owns the scroll boundaries. Each region is a `panel` (a flex column with
 * `min-height: 0`) so its content scrolls inside it and the page itself never scrolls
 * horizontally, which is what makes the layout survive a narrow window.
 */
import type { ReactNode } from 'react'
import {
  Group,
  Panel,
  Separator as ResizeSeparator,
  useDefaultLayout,
} from 'react-resizable-panels'

import { cn } from '@/lib/utils'

export interface IdeShellProps {
  topBar: ReactNode
  sidebar: ReactNode
  children: ReactNode
  inspector?: ReactNode
  healthBar?: ReactNode
  /** Layout id; column widths are remembered per id so a user's layout survives a reload. */
  layoutId?: string
}

/** The separator is focusable, so it needs to say which boundary it moves. */
function Handle({ label }: { label: string }) {
  return (
    <ResizeSeparator
      aria-label={label}
      className={cn(
        'bg-border data-[state=dragging]:bg-accent hover:bg-accent w-px shrink-0 transition-colors',
        // A one-pixel target is unusable; widen the hit area without widening the line.
        'relative after:absolute after:inset-y-0 after:-left-1 after:w-3 after:content-[""]',
      )}
    />
  )
}

export function IdeShell({
  topBar,
  sidebar,
  children,
  inspector,
  healthBar,
  layoutId = 'workspace',
}: IdeShellProps) {
  const panelIds = inspector ? ['sidebar', 'canvas', 'inspector'] : ['sidebar', 'canvas']
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: layoutId, panelIds })

  return (
    <div className="bg-background flex h-dvh flex-col overflow-hidden">
      <header className="bg-surface flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {topBar}
      </header>

      <Group
        orientation="horizontal"
        id={layoutId}
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1"
      >
        <Panel id="sidebar" defaultSize="20" minSize="12" maxSize="35" className="panel bg-surface">
          {sidebar}
        </Panel>

        <Handle label="Resize the project panel" />

        <Panel id="canvas" defaultSize={inspector ? '55' : '80'} minSize="30" className="panel">
          {children}
        </Panel>

        {inspector ? (
          <>
            <Handle label="Resize the inspector panel" />
            <Panel
              id="inspector"
              defaultSize="25"
              minSize="15"
              maxSize="40"
              className="panel bg-surface"
            >
              {inspector}
            </Panel>
          </>
        ) : null}
      </Group>

      {healthBar ? (
        <footer className="bg-surface text-muted-foreground flex h-7 shrink-0 items-center gap-3 border-t px-3 text-xs">
          {healthBar}
        </footer>
      ) : null}
    </div>
  )
}

/** A titled region inside a panel: a fixed header and a scrolling body. */
export function PanelSection({
  title,
  actions,
  children,
  className,
  scroll = true,
}: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Set false when the content scrolls itself, such as the code editor. */
  scroll?: boolean
}) {
  return (
    <div className={cn('panel flex-1', className)}>
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b px-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </span>
        {actions}
      </div>
      <div className={cn('min-h-0 flex-1', scroll && 'overflow-auto')}>{children}</div>
    </div>
  )
}
