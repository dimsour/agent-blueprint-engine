'use client'

/**
 * The creation wizard.
 *
 * Ten questions, one draft Blueprint. The draft is valid at every step, so a person can stop
 * anywhere from step two onwards and still get a project that opens; only the first two steps
 * hold them back, and only because a Blueprint without a name or an agent is not a Blueprint.
 */
import type { Blueprint } from '@agent-blueprint/core'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, LoaderIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { ThemeToggle } from '@/components/theme'
import { Button } from '@/components/ui/button'
import {
  AboutStep,
  AgentStep,
  ArtifactStep,
  EvaluateStep,
  FinishStep,
  MemoryStep,
  type StepProps,
  TargetsStep,
  ToolsStep,
} from '@/components/wizard/steps'
import { createProject, StorageError } from '@/lib/storage'
import { blockingReason, emptyDraft, WIZARD_STEPS, type WizardStepId } from '@/lib/wizard/draft'
import { cn } from '@/lib/utils'

const BODIES: Record<WizardStepId, (props: StepProps) => React.ReactNode> = {
  about: AboutStep,
  agent: AgentStep,
  skills: (props) => <ArtifactStep {...props} kind="skill" />,
  workflows: (props) => <ArtifactStep {...props} kind="workflow" />,
  laws: (props) => <ArtifactStep {...props} kind="iron-law" />,
  tools: ToolsStep,
  memory: MemoryStep,
  targets: TargetsStep,
  evaluate: EvaluateStep,
  finish: FinishStep,
}

export function Wizard() {
  const router = useRouter()
  const [draft, setDraft] = useState<Blueprint>(emptyDraft)
  const [index, setIndex] = useState(0)
  // How far the wizard has been taken, so stepping back to check something does not make
  // every step after it unreachable again.
  const [furthest, setFurthest] = useState(0)
  const [creating, setCreating] = useState(false)

  const goTo = (position: number) => {
    setIndex(position)
    setFurthest((current) => Math.max(current, position))
  }

  const step = WIZARD_STEPS[index]
  if (!step) return null

  const blocked = blockingReason(draft, step.id)
  const isLast = index === WIZARD_STEPS.length - 1
  const Body = BODIES[step.id]

  const create = async () => {
    setCreating(true)
    try {
      const summary = await createProject(draft)
      router.push(`/p/${summary.id}`)
    } catch (error) {
      setCreating(false)
      toast.error('Could not create the project', {
        description:
          error instanceof StorageError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error),
      })
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground text-xs font-medium tracking-wide uppercase"
          >
            Agent Blueprint
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">New Blueprint</h1>
        </div>
        <ThemeToggle />
      </header>

      <nav aria-label="Wizard steps" className="flex flex-wrap gap-1.5">
        {WIZARD_STEPS.map((candidate, position) => {
          const done = position < index
          const current = position === index
          return (
            <button
              key={candidate.id}
              type="button"
              // Anywhere already reached is reachable again; nothing beyond it is.
              disabled={position > furthest}
              aria-current={current ? 'step' : undefined}
              onClick={() => goTo(position)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                current && 'border-accent bg-accent-muted text-accent',
                done && 'text-muted-foreground',
                position > index && 'opacity-50',
              )}
            >
              <span className="tabular-nums">{position + 1}</span>
              {candidate.label}
            </button>
          )
        })}
      </nav>

      <section className="flex min-h-80 flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{step.prompt}</h2>
          <p className="text-muted-foreground text-sm">
            Step {index + 1} of {WIZARD_STEPS.length}
          </p>
        </div>
        <Body draft={draft} onChange={setDraft} />
      </section>

      <footer className="mt-auto flex items-center gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => goTo(Math.max(0, index - 1))}
          disabled={index === 0}
        >
          <ArrowLeftIcon />
          Back
        </Button>

        {blocked ? (
          <span role="status" className="text-muted-foreground text-sm">
            {blocked}
          </span>
        ) : null}

        <span className="flex-1" />

        {isLast ? (
          <Button variant="accent" onClick={() => void create()} disabled={creating}>
            {creating ? <LoaderIcon className="animate-spin" /> : <CheckIcon />}
            Create project
          </Button>
        ) : (
          <Button
            onClick={() => goTo(Math.min(WIZARD_STEPS.length - 1, index + 1))}
            disabled={blocked !== undefined}
          >
            Next
            <ArrowRightIcon />
          </Button>
        )}
      </footer>
    </div>
  )
}
