'use client'

/**
 * One finding, wherever findings are listed.
 *
 * Every list of diagnostics in the product used to render its own icons and its own idea of
 * what clicking one should do. This is that decision, made once: the code, the severity, the
 * message, and a jump to the artifact it is about, including the step inside a workflow when
 * the finding names one.
 */
import type { Diagnostic, EntityRef } from '@agent-blueprint/core'
import { AlertTriangleIcon, CircleAlertIcon, InfoIcon } from 'lucide-react'

import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export function SeverityIcon({ severity }: { severity: Diagnostic['severity'] }) {
  if (severity === 'error') return <CircleAlertIcon className="text-danger size-3.5 shrink-0" />
  if (severity === 'warning')
    return <AlertTriangleIcon className="text-warning size-3.5 shrink-0" />
  return <InfoIcon className="text-muted-foreground size-3.5 shrink-0" />
}

/** The step a finding is about, when it names one. */
export function nodeIdOf(diagnostic: Diagnostic): string | undefined {
  const data = diagnostic.data as Record<string, unknown> | undefined
  const single = data?.['nodeId']
  if (typeof single === 'string') return single
  const many = data?.['nodeIds']
  return Array.isArray(many) && typeof many[0] === 'string' ? many[0] : undefined
}

export function DiagnosticRow({
  diagnostic,
  onNavigate,
  className,
}: {
  diagnostic: Diagnostic
  onNavigate?: (ref: EntityRef | undefined, nodeId: string | undefined) => void
  className?: string
}) {
  const body = (
    <>
      <SeverityIcon severity={diagnostic.severity} />
      <Badge variant="outline" className="shrink-0 font-mono">
        {diagnostic.code}
      </Badge>
      <span className="min-w-0 flex-1 text-left text-xs">{diagnostic.message}</span>
    </>
  )

  if (!onNavigate || !diagnostic.ref) {
    return <span className={cn('flex items-start gap-2 py-0.5', className)}>{body}</span>
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate(diagnostic.ref, nodeIdOf(diagnostic))}
      className={cn(
        'hover:bg-muted flex w-full items-start gap-2 rounded px-1 py-0.5 text-left',
        className,
      )}
    >
      {body}
    </button>
  )
}
