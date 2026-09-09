'use client'

/**
 * The assistant.
 *
 * It knows what you are looking at. With a skill selected the quick actions target that skill;
 * with nothing selected they are not offered, and the panel says why rather than hiding them.
 * That is the same rule the command palette follows, and it is the difference between a
 * feature the user can find and one they have to already know about.
 *
 * Nothing it produces is applied. A ChangeSet goes to the review, findings go to a list that
 * navigates, and a quality review is prose next to the artifacts it is about. The endpoint is
 * whatever Settings says; without one, this is a link to Settings rather than a spinner that
 * eventually fails.
 */
import {
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type Blueprint,
  type ChangeOp,
  type EntityKind,
} from '@agent-blueprint/core'
import { AIError } from '@agent-blueprint/ai'
import { ArrowRightIcon, Loader2Icon, SparklesIcon } from 'lucide-react'
import Link from 'next/link'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ChangeSetReview, RejectedOps, type RejectedOp } from '@/components/ai/changeset-review'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays'
import { Badge, Card, Textarea } from '@/components/ui/primitives'
import { ASSISTANT_ACTIONS, ASSISTANT_GROUPS, type AssistantResult } from '@/lib/ai/actions'
import { configuredClient } from '@/lib/ai/settings'
import { useWorkspace } from '@/lib/state/workspace-store'

export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const selection = useWorkspace((state) => state.selection)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const apply = useWorkspace((state) => state.apply)
  const select = useWorkspace((state) => state.select)

  const [actionId, setActionId] = useState<string | undefined>()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<EntityKind>('skill')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AssistantResult | undefined>()
  const [failure, setFailure] = useState<string | undefined>()
  const [rejected, setRejected] = useState<RejectedOp[]>([])
  const textId = useId()
  const kindId = useId()

  const configured = useMemo(() => (open ? configuredClient() : undefined), [open])
  const action = ASSISTANT_ACTIONS.find((candidate) => candidate.id === actionId)
  const blocked = blueprint && action ? action.unavailable(blueprint, selection) : undefined
  const missingText = action?.field?.required === true && !text.trim()

  const run = async () => {
    if (!blueprint || !action || !configured) return
    setBusy(true)
    setFailure(undefined)
    setResult(undefined)
    setRejected([])
    try {
      setResult(
        await action.run(
          { client: configured.client },
          {
            blueprint,
            ...(selection ? { selection } : {}),
            ...(diagnostics.length > 0 ? { diagnostics } : {}),
          },
          { text: text.trim(), kind },
        ),
      )
    } catch (error) {
      setFailure(
        error instanceof AIError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'The endpoint could not be reached.',
      )
    } finally {
      setBusy(false)
    }
  }

  const applyOps = (ops: ChangeOp[], summary: string) => {
    if (!result) return
    const outcome = apply({ id: 'ai', source: 'ai', summary, ops })
    setRejected(outcome.rejected)
    if (outcome.rejected.length === 0) {
      setResult(undefined)
      onOpenChange(false)
      toast.success(`Applied ${ops.length} ${ops.length === 1 ? 'change' : 'changes'}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4" />
            Assistant
          </DialogTitle>
          <DialogDescription>
            {selection
              ? `Working on the ${ENTITY_KIND_INFO[selection.kind].label.toLowerCase()} “${selection.id}”.`
              : 'Working on the whole Blueprint. Select an artifact to act on one.'}
          </DialogDescription>
        </DialogHeader>

        {!configured ? (
          <Card className="flex flex-col items-start gap-2 p-4">
            <p className="text-sm font-medium">No AI endpoint yet</p>
            <p className="text-muted-foreground text-sm">
              The assistant talks to whichever OpenAI-compatible endpoint you configure. Nothing it
              produces is applied without your review.
            </p>
            <Button asChild variant="outline">
              <Link href="/settings">
                Set one up
                <ArrowRightIcon />
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
            <div className="flex flex-col gap-3">
              {ASSISTANT_GROUPS.map((group) => (
                <fieldset key={group} className="flex flex-col gap-1.5">
                  <legend className="text-muted-foreground text-xs font-medium">{group}</legend>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ASSISTANT_ACTIONS.filter((candidate) => candidate.group === group).map(
                      (candidate) => {
                        const why = blueprint
                          ? candidate.unavailable(blueprint, selection)
                          : 'No project'
                        return (
                          <Button
                            key={candidate.id}
                            size="sm"
                            variant={candidate.id === actionId ? 'default' : 'outline'}
                            aria-pressed={candidate.id === actionId}
                            disabled={why !== undefined}
                            title={why ?? candidate.hint}
                            onClick={() => {
                              setActionId(candidate.id)
                              setResult(undefined)
                              setFailure(undefined)
                            }}
                          >
                            {candidate.label}
                          </Button>
                        )
                      },
                    )}
                  </div>
                </fieldset>
              ))}
            </div>

            {action ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">{action.hint}</p>
                {blocked ? (
                  <p role="status" className="text-sm">
                    {blocked}.
                  </p>
                ) : null}
                {action.picksKind ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor={kindId} className="text-sm font-medium">
                      Kind
                    </label>
                    <select
                      id={kindId}
                      className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                      value={kind}
                      onChange={(event) => setKind(event.target.value as EntityKind)}
                    >
                      {ENTITY_KINDS.map((entityKind) => (
                        <option key={entityKind} value={entityKind}>
                          {ENTITY_KIND_INFO[entityKind].label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {action.field ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={textId} className="text-sm font-medium">
                      {action.field.label}
                    </label>
                    <Textarea
                      id={textId}
                      rows={action.field.rows}
                      placeholder={action.field.placeholder}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                    />
                  </div>
                ) : null}
                <Button
                  className="self-start"
                  disabled={busy || blocked !== undefined || missingText}
                  onClick={() => void run()}
                >
                  {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  {/* Not the action's own label: the chip above already carries that, and two
                      buttons with the same name is a screen reader reading the same thing
                      twice and a test that cannot tell them apart. */}
                  {busy ? 'Asking…' : 'Ask'}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Choose what to do.</p>
            )}

            {failure ? (
              <Card className="flex flex-col gap-1 p-3">
                <p role="alert" className="text-sm">
                  {failure}
                </p>
                <p className="text-muted-foreground text-xs">
                  Nothing was changed. Try again, or check the endpoint in Settings.
                </p>
              </Card>
            ) : null}

            <RejectedOps rejected={rejected} />

            {result && blueprint ? (
              result.kind === 'changeset' ? (
                <ChangeSetReview
                  changeSet={result.changeSet}
                  blueprint={blueprint}
                  notes={result.notes}
                  contextTrimmed={result.contextTrimmed}
                  busy={busy}
                  onApply={(ops) => applyOps(ops, result.changeSet.summary)}
                  onRegenerate={() => void run()}
                  onDismiss={() => setResult(undefined)}
                />
              ) : result.kind === 'diagnostics' ? (
                <Findings
                  result={result}
                  onSelect={(ref) => {
                    select(ref)
                    onOpenChange(false)
                  }}
                  onApply={(ops) =>
                    applyOps(ops, result.proposals?.summary ?? 'Proposed artifacts')
                  }
                  blueprint={blueprint}
                />
              ) : (
                <Report
                  result={result}
                  onSelect={(ref) => {
                    select(ref)
                    onOpenChange(false)
                  }}
                />
              )
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

type DiagnosticsResult = Extract<AssistantResult, { kind: 'diagnostics' }>
type ReportResult = Extract<AssistantResult, { kind: 'report' }>

/**
 * Findings a model produced. They look different from the validator's on purpose: a user is
 * entitled to know which kind they are reading before they act on one.
 */
function Findings({
  result,
  blueprint,
  onSelect,
  onApply,
}: {
  result: DiagnosticsResult
  blueprint: Blueprint
  onSelect: (ref: { kind: EntityKind; id: string }) => void
  onApply: (ops: ChangeOp[]) => void
}) {
  if (result.diagnostics.length === 0 && !result.proposals) {
    return <p className="text-sm">Nothing found.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="AI findings" className="flex flex-col gap-2">
        {result.diagnostics.map((finding, index) => (
          <li key={`${finding.code}:${index}`}>
            <Card className="flex flex-col gap-1 p-3">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={finding.severity === 'warning' ? 'warning' : 'outline'}>
                  {finding.severity}
                </Badge>
                <Badge variant="outline">AI</Badge>
                <span className="text-muted-foreground font-mono text-xs">{finding.code}</span>
              </span>
              <p className="text-sm">{finding.message}</p>
              <span className="flex flex-wrap gap-1.5">
                {[finding.ref, ...(finding.related ?? [])]
                  .filter((ref): ref is NonNullable<typeof ref> => ref !== undefined)
                  .map((ref) => (
                    <Button
                      key={`${ref.kind}:${ref.id}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelect(ref)}
                    >
                      {ENTITY_KIND_INFO[ref.kind].label}: {ref.id}
                    </Button>
                  ))}
              </span>
            </Card>
          </li>
        ))}
      </ul>
      {result.proposals ? (
        <ChangeSetReview
          changeSet={result.proposals}
          blueprint={blueprint}
          notes={result.notes}
          onApply={onApply}
        />
      ) : null}
    </div>
  )
}

function Report({
  result,
  onSelect,
}: {
  result: ReportResult
  onSelect: (ref: { kind: EntityKind; id: string }) => void
}) {
  if (result.report.dimensions.length === 0) {
    return <p className="text-sm">Nothing to report.</p>
  }
  return (
    <ul aria-label="AI review" className="flex flex-col gap-2">
      {result.report.dimensions.map((dimension) => (
        <li key={dimension.dimension}>
          <Card className="flex flex-col gap-2 p-3">
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium">{dimension.dimension}</span>
              <Badge variant="outline">AI</Badge>
            </span>
            <p className="text-muted-foreground text-sm">{dimension.verdict}</p>
            {dimension.findings.map((finding, index) => (
              <div key={index} className="border-l-2 pl-3">
                <p className="text-sm">{finding.problem}</p>
                {finding.suggestion ? (
                  <p className="text-muted-foreground text-xs">{finding.suggestion}</p>
                ) : null}
                {finding.ref ? (
                  <Button variant="ghost" size="sm" onClick={() => onSelect(finding.ref!)}>
                    {ENTITY_KIND_INFO[finding.ref.kind].label}: {finding.ref.id}
                  </Button>
                ) : null}
              </div>
            ))}
          </Card>
        </li>
      ))}
    </ul>
  )
}
