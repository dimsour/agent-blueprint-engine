'use client'

/**
 * "Fix with AI" on one finding (P9-12).
 *
 * The finding already says what is wrong and which artifact it is about, and the catalogue
 * already says how that kind of finding is fixed — so this asks for the one thing the user
 * would otherwise type out by hand. Nothing is applied: what comes back goes to the same
 * per-op review every other AI proposal goes through, which is the rule the product rests on
 * (AGENTS.md rule 6).
 *
 * The dialog is mounted by the row that opened it and unmounted when it closes, so a list of
 * forty findings costs forty buttons and no dialogs.
 */
import { type Diagnostic, diagnosticCode } from '@agent-blueprint/core'
import { aiDiagnosticCode, fixabilityOf, fixFindings } from '@agent-blueprint/ai'
import { ArrowRightIcon, Loader2Icon, SparklesIcon, SquareIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ChangeSetReview, RejectedOps, type RejectedOp } from '@/components/ai/changeset-review'
import { advance, type Progress, Waiting } from '@/components/ai/waiting'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays'
import { Badge, Card, Textarea } from '@/components/ui/primitives'
import { describeFailure, type Failure, wasStopped } from '@/lib/ai/failure'
import { configuredClient, structuredFor } from '@/lib/ai/settings'
import { useWorkspace } from '@/lib/state/workspace-store'

interface Proposal {
  changeSet: Parameters<typeof ChangeSetReview>[0]['changeSet']
  notes: string[]
  contextTrimmed: boolean
}

export function FixFindingDialog({
  diagnostics,
  title,
  open,
  onOpenChange,
}: {
  /** One finding, or every finding of a dimension. The dialog reads the same either way. */
  diagnostics: readonly Diagnostic[]
  /** What the batch is, when it is a batch. A single finding describes itself. */
  title?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const only = diagnostics.length === 1 ? diagnostics[0] : undefined
  const blueprint = useWorkspace((state) => state.blueprint)
  const findings = useWorkspace((state) => state.diagnostics)
  const apply = useWorkspace((state) => state.apply)

  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | undefined>()
  const [proposal, setProposal] = useState<Proposal | undefined>()
  const [failure, setFailure] = useState<Failure | undefined>()
  const [rejected, setRejected] = useState<RejectedOp[]>([])
  // Held across renders rather than in state: stopping must not wait for one.
  const inFlight = useRef<AbortController | undefined>(undefined)

  const instructionId = useId()
  const configured = useMemo(() => (open ? configuredClient() : undefined), [open])

  const stop = () => inFlight.current?.abort()

  const run = async () => {
    const client = configuredClient()
    if (!client || !blueprint) return
    const controller = new AbortController()
    inFlight.current = controller
    setBusy(true)
    setFailure(undefined)
    setProposal(undefined)
    setRejected([])
    setProgress({ received: 0, since: Date.now() })
    try {
      setProposal(
        await fixFindings(
          {
            client: client.client,
            structured: structuredFor(client, {
              signal: controller.signal,
              onProgress: (received) => setProgress((current) => advance(current, received)),
            }),
          },
          {
            blueprint,
            ...(only?.ref ? { selection: only.ref } : {}),
            ...(findings.length > 0 ? { diagnostics: findings } : {}),
            ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
          },
          { diagnostics },
        ),
      )
    } catch (error) {
      // Stopping is a decision, not a failure: reporting it as one would make the dialog look
      // broken every time somebody changed their mind.
      if (!wasStopped(error)) setFailure(describeFailure(error))
    } finally {
      inFlight.current = undefined
      setBusy(false)
      setProgress(undefined)
    }
  }

  // Closing mid-request left it running, which on a local model is minutes of work nobody is
  // waiting for — and on a metered endpoint, an answer nobody reads that somebody still pays for.
  useEffect(() => () => inFlight.current?.abort(), [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4" />
            {only ? 'Fix this finding' : `Fix ${diagnostics.length} findings`}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-baseline gap-2">
            {only ? (
              <>
                <Badge variant="outline" className="font-mono">
                  {only.code}
                </Badge>
                <span className="min-w-0">{only.message}</span>
              </>
            ) : (
              <span className="min-w-0">
                {diagnostics.length} findings{title ? ` in ${title}` : ''}, in one ask — so two
                about the same artifact become one edit rather than two that overwrite each other.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {!configured ? (
          <Card className="flex flex-col items-start gap-2 p-4">
            <p className="text-sm font-medium">No AI endpoint yet</p>
            <p className="text-muted-foreground text-sm">
              Fixing a finding asks whichever OpenAI-compatible endpoint you configure. Nothing it
              proposes is applied without your review.
            </p>
            <Button asChild variant="outline">
              <Link href="/settings">
                Set one up
                <ArrowRightIcon />
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            {/* The instructions the model is given, shown rather than hidden. It is the same
                sentence the "How to fix" note carries, so the user can see what was asked
                for and judge the answer against it. */}
            <Card className="flex flex-col gap-1.5 p-3">
              <p className="text-xs font-medium">What the model is asked to do</p>
              {/* Per code rather than per finding: seven skills missing the same section are
                  one instruction, and reading it seven times teaches nothing. */}
              {[...new Map(diagnostics.map((found) => [found.code, found])).values()].map(
                (found) => (
                  <p key={found.code} className="text-muted-foreground text-xs leading-relaxed">
                    {diagnostics.length > 1 ? (
                      <span className="font-mono">{found.code}: </span>
                    ) : null}
                    {remedyOf(found)}
                  </p>
                ),
              )}
            </Card>

            {/* The escape hatch for the finding the model reads the wrong way. Everything
                else in this dialog is derived; this is the one place the person who knows
                the project can say what the catalogue could not. */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={instructionId} className="text-xs font-medium">
                Anything else it should know
              </label>
              <Textarea
                id={instructionId}
                rows={2}
                placeholder="Optional. What the artifact is really for, a constraint, or what a previous attempt got wrong."
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy || !blueprint} onClick={() => void run()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                {busy ? 'Fixing…' : proposal ? 'Ask again' : only ? 'Fix it' : 'Fix them'}
              </Button>
              {busy ? (
                <Button variant="outline" onClick={stop}>
                  <SquareIcon />
                  Stop
                </Button>
              ) : null}
              {progress ? <Waiting progress={progress} /> : null}
            </div>

            {failure ? (
              <Card className="flex flex-col gap-1 p-3">
                <p role="alert" className="text-sm">
                  {failure.message}
                </p>
                <p className="text-muted-foreground text-xs">
                  {failure.hint ??
                    'Nothing was changed. Try again, or check the endpoint in Settings.'}
                </p>
              </Card>
            ) : null}

            <RejectedOps rejected={rejected} />

            {proposal && blueprint ? (
              <ChangeSetReview
                changeSet={proposal.changeSet}
                blueprint={blueprint}
                notes={proposal.notes}
                contextTrimmed={proposal.contextTrimmed}
                busy={busy}
                onApply={(ops) => {
                  const outcome = apply({ ...proposal.changeSet, ops })
                  setRejected(outcome.rejected)
                  if (outcome.rejected.length === 0) {
                    setProposal(undefined)
                    onOpenChange(false)
                    toast.success(
                      `Applied ${ops.length} ${ops.length === 1 ? 'change' : 'changes'}`,
                      {
                        description:
                          'Validation runs again; the finding goes when the rule stops firing.',
                      },
                    )
                  }
                }}
                onRegenerate={() => void run()}
                onDismiss={() => setProposal(undefined)}
              />
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The instructions the model is given, verbatim.
 *
 * The same sentence the "How to fix" note shows a person, because it is literally the same
 * field: `remedy` from the catalogue, which is what steers the prompt. Showing it is what
 * makes the answer judgeable — the user can see what was asked for before deciding whether
 * what came back is it.
 */
function remedyOf(diagnostic: Diagnostic): string {
  const fixability = fixabilityOf(diagnostic)
  if (!fixability.fixable) return fixability.reason
  const remedy =
    diagnosticCode(diagnostic.code)?.remedy ??
    aiDiagnosticCode(diagnostic.code)?.remedy ??
    'Change what the finding describes, and nothing else.'
  return `${remedy} It may write or revise: ${fixability.kinds.join(', ')}.`
}
