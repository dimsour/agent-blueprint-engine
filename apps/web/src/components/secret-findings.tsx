'use client'

/**
 * What the secret scan found, and the decision to publish it anyway.
 *
 * Two surfaces write a project somewhere it can be read by someone else: the push, and the
 * ZIP export. They ask the same question and have to ask it the same way, so the list, the
 * per-finding override and the rule that nothing proceeds until every finding is ticked live
 * here rather than once per surface (P7-06).
 *
 * A finding never shows the value it matched. A screenshot of this list must not become the
 * leak the list exists to prevent, which is why `scanForSecrets` returns a masked excerpt and
 * this component has no way to ask for more.
 */
import { AlertTriangleIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import type { SecretFinding } from '@/lib/secret-scan'

/** A finding is identified by where it is, so ticking one does not tick another like it. */
export function secretKey(finding: SecretFinding): string {
  return `${finding.path}:${finding.line}:${finding.kind}`
}

/** True while any finding has not been accepted. The caller uses it to block the action. */
export function blockedBySecrets(
  findings: readonly SecretFinding[],
  accepted: ReadonlySet<string>,
): boolean {
  return findings.some((finding) => !accepted.has(secretKey(finding)))
}

export function Note({ tone, children }: { tone: 'danger' | 'warning'; children: ReactNode }) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 border-l-2 pl-3 text-xs ${
        tone === 'danger' ? 'text-danger border-danger' : 'text-warning border-warning'
      }`}
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function Choice({
  id,
  checked,
  onToggle,
  label,
  detail,
}: {
  id: string
  checked: boolean
  onToggle: (id: string) => void
  label: string
  detail: string
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={() => onToggle(id)} />
      <span className="min-w-0">
        <span className="block font-mono text-xs break-all">{label}</span>
        <span className="text-muted-foreground block text-xs">{detail}</span>
      </span>
    </label>
  )
}

export function SecretFindings({
  findings,
  accepted,
  onToggle,
  /** What is about to happen, so the warning names the actual exposure. */
  consequence,
}: {
  findings: readonly SecretFinding[]
  accepted: ReadonlySet<string>
  onToggle: (id: string) => void
  consequence: string
}) {
  if (findings.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <Note tone="danger">Something in these files looks like a credential. {consequence}</Note>
      {findings.map((finding) => (
        <Choice
          key={secretKey(finding)}
          id={secretKey(finding)}
          checked={accepted.has(secretKey(finding))}
          onToggle={onToggle}
          label={`${finding.path}:${finding.line} — ${finding.kind}`}
          detail={finding.excerpt}
        />
      ))}
    </div>
  )
}
