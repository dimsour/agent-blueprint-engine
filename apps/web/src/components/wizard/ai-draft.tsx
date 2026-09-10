'use client'

/**
 * "Draft with AI" on `/new`.
 *
 * A name and a description is the right shape for someone who knows what they want, and a
 * blank page for someone who does not. This fills it in from a sentence about the work — and
 * then hands what came back to the same review as everywhere else, so it arrives as a
 * proposal the author reads rather than a project someone else wrote.
 *
 * Applying it does not create anything. The draft stays on this screen, with everything the
 * model proposed now in it to be corrected before Create.
 */
import { applyChangeSet, type Blueprint, type ChangeOp } from '@agent-blueprint/core'
import { AIError, generateBlueprint } from '@agent-blueprint/ai'
import { ArrowRightIcon, Loader2Icon, SparklesIcon } from 'lucide-react'
import Link from 'next/link'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { ChangeSetReview } from '@/components/ai/changeset-review'
import { Button } from '@/components/ui/button'
import { Card, Textarea } from '@/components/ui/primitives'
import { configuredClient } from '@/lib/ai/settings'
import { useClientValue } from '@/lib/client-value'

interface Draft {
  changeSet: Parameters<typeof ChangeSetReview>[0]['changeSet']
  notes: string[]
  contextTrimmed: boolean
}

export function DraftWithAI({
  draft,
  onChange,
}: {
  draft: Blueprint
  onChange: (next: Blueprint) => void
}) {
  const briefId = useId()
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Draft | undefined>()
  const [failure, setFailure] = useState<string | undefined>()

  // Whether an endpoint exists is a browser fact; the server renders the honest default.
  const configured = useClientValue(() => configuredClient() !== undefined, false)

  const run = async () => {
    const client = configuredClient()
    if (!client) return
    setBusy(true)
    setFailure(undefined)
    setProposal(undefined)
    try {
      const result = await generateBlueprint({ client: client.client }, { blueprint: draft }, brief)
      setProposal(result)
    } catch (error) {
      setFailure(error instanceof AIError || error instanceof Error ? error.message : 'It failed.')
    } finally {
      setBusy(false)
    }
  }

  const applyOps = (ops: ChangeOp[]) => {
    if (!proposal) return
    const applied = applyChangeSet(draft, { ...proposal.changeSet, ops })
    onChange(applied.blueprint)
    setProposal(undefined)
    toast.success('Drafted', {
      description: `${ops.length} ${ops.length === 1 ? 'change' : 'changes'} applied. Keep going through the steps to correct them.`,
    })
  }

  if (!configured) {
    return (
      <Card className="flex flex-col items-start gap-2 p-3">
        <p className="text-sm font-medium">Draft this with AI</p>
        <p className="text-muted-foreground text-sm">
          Configure an endpoint and the wizard can propose a first draft. You would still review
          every artifact before it is added.
        </p>
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings">
            Set one up
            <ArrowRightIcon />
          </Link>
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={briefId} className="text-sm font-medium">
          Draft this with AI
        </label>
        <Textarea
          id={briefId}
          rows={3}
          placeholder="A crew that reviews Rust changes before they merge, and blocks anything unverified."
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Describe the work. Nothing is added until you accept it, one artifact at a time.
        </p>
      </div>
      <Button
        className="self-start"
        size="sm"
        disabled={busy || !brief.trim()}
        onClick={() => void run()}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {busy ? 'Drafting…' : 'Draft'}
      </Button>

      {failure ? (
        <p role="alert" className="text-sm">
          {failure}
        </p>
      ) : null}

      {proposal ? (
        <ChangeSetReview
          changeSet={proposal.changeSet}
          blueprint={draft}
          notes={proposal.notes}
          contextTrimmed={proposal.contextTrimmed}
          busy={busy}
          onApply={applyOps}
          onRegenerate={() => void run()}
          onDismiss={() => setProposal(undefined)}
        />
      ) : null}
    </Card>
  )
}
