'use client'

/**
 * What is happening while an answer is still arriving (P9-08).
 *
 * A spinner says a request is open; it does not say whether the model is working or the
 * connection died twenty seconds ago. The count does, because it only moves when the answer
 * is actually arriving. It ticks its own clock so the seconds keep moving between chunks — a
 * model that thinks for a minute before writing sends nothing to re-render on.
 *
 * Not a live region on purpose: it changes every second, and a screen reader reading that
 * aloud each time would drown out everything else. The button beside it carries the state.
 *
 * Shared rather than copied: it started in the wizard's draft field and is the right thing to
 * show anywhere a model is being waited on, which now includes fixing a finding.
 */
import { useEffect, useState } from 'react'

export interface Progress {
  /** Characters of the answer received so far. Zero until the model starts writing. */
  received: number
  since: number
}

/** Records a chunk without letting a late one move the clock backwards. */
export function advance(current: Progress | undefined, received: number): Progress {
  return current ? { ...current, received } : { received, since: Date.now() }
}

export function Waiting({ progress }: { progress: Progress }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const seconds = Math.max(0, Math.round((now - progress.since) / 1000))
  return (
    <p className="text-muted-foreground text-xs tabular-nums">
      {progress.received === 0
        ? `Thinking… ${seconds}s. A local model can take a while before it starts writing.`
        : `Writing… ${progress.received.toLocaleString()} characters in ${seconds}s.`}
    </p>
  )
}
