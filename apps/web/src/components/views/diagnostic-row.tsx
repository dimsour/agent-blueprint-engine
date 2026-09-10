'use client'

/**
 * One finding, wherever findings are listed.
 *
 * Every list of diagnostics in the product used to render its own icons and its own idea of
 * what clicking one should do. This is that decision, made once: the code, the severity, the
 * message, a jump to the artifact it is about — including the step inside a workflow when the
 * finding names one — and, since P9-10, the way to fix it.
 *
 * A finding a model produced is badged as one. It sits in the same lists as the rules', which
 * is where it is useful, and the badge is what keeps "a rule computed this" and "a model
 * thought this" from reading as the same claim.
 */
import { type Diagnostic, diagnosticCode, type EntityRef } from '@agent-blueprint/core'
import { AlertTriangleIcon, CircleAlertIcon, InfoIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/overlays'
import { Badge } from '@/components/ui/primitives'
import { isAiFinding } from '@/lib/ai/merge'
import { nodeIdsOf } from '@/lib/graph/workflow'
import { cn } from '@/lib/utils'

export function SeverityIcon({ severity }: { severity: Diagnostic['severity'] }) {
  if (severity === 'error') return <CircleAlertIcon className="text-danger size-3.5 shrink-0" />
  if (severity === 'warning')
    return <AlertTriangleIcon className="text-warning size-3.5 shrink-0" />
  return <InfoIcon className="text-muted-foreground size-3.5 shrink-0" />
}

/**
 * What the code means and what to do about it (P9-10).
 *
 * A finding's message has to fit on a line, so it says what is wrong and stops. Reported from
 * use: `BP-REQ-001` tells you a requirement failed all four of its checks and leaves you with
 * no idea whether the Blueprint is missing something or the checks are looking in the wrong
 * place. The answer was already written — `DIAGNOSTIC_CODES` carries a summary and a remedy
 * per code — and nothing in the app had ever read it.
 *
 * Hover or focus gives the one-line meaning; pressing opens the remedy and keeps it open,
 * because a paragraph of instructions behind a hover is a paragraph nobody on a keyboard can
 * read. The same bargain as the field help in P9-04, for the same reason.
 *
 * It renders a button and, when open, a full-width panel, so its parent must be a
 * `flex-wrap` row: `basis-full` is what puts the panel on its own line under the message
 * rather than squeezed beside it.
 */
export function DiagnosticHelp({ code }: { code: string }) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const entry = diagnosticCode(code)

  // A code the catalogue does not know — a harness adapter's own, or something from a
  // version of the core this build did not ship. No button is better than an empty one.
  if (!entry) return null

  return (
    <>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              // Named after the code, so a screen reader working down a list of twenty
              // findings hears which one each button belongs to.
              aria-label={`How to fix ${code}`}
              aria-expanded={open}
              {...(open ? { 'aria-controls': panelId } : {})}
              onClick={() => setOpen(!open)}
              className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 rounded-full transition-colors"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>{entry.summary}</p>
            <p className="mt-1 opacity-80">Press for how to fix it.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {open ? (
        <div
          id={panelId}
          className="bg-muted/50 mt-1 flex basis-full flex-col gap-1.5 rounded border p-2 text-xs"
        >
          <p className="font-medium">{entry.summary}</p>
          <p className="text-muted-foreground leading-relaxed">{entry.remedy}</p>
        </div>
      ) : null}
    </>
  )
}

/** The step to open on, when a finding names one. A finding about a cycle names several. */
function firstNodeId(diagnostic: Diagnostic): string | undefined {
  return nodeIdsOf(diagnostic)[0]
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
      {isAiFinding(diagnostic) ? (
        <Badge variant="outline" className="shrink-0">
          AI
        </Badge>
      ) : null}
      <span className="min-w-0 flex-1 text-left text-xs">{diagnostic.message}</span>
    </>
  )

  return (
    // Wrapping, so the help panel drops below the message instead of narrowing it. The row
    // itself never wraps: the message already takes the space that is left.
    <div className={cn('flex flex-wrap items-start gap-x-1', className)}>
      {onNavigate && diagnostic.ref ? (
        <button
          type="button"
          onClick={() => onNavigate(diagnostic.ref, firstNodeId(diagnostic))}
          className="hover:bg-muted flex min-w-0 flex-1 items-start gap-2 rounded px-1 py-0.5 text-left"
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-start gap-2 px-1 py-0.5">{body}</span>
      )}
      <DiagnosticHelp code={diagnostic.code} />
    </div>
  )
}
