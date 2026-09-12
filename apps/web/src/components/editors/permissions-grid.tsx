'use client'

/**
 * The permission grid: what an agent is allowed to do, as opposed to what it knows how to
 * do. Three columns because that is the whole vocabulary: allow, ask, deny. Leaving an
 * operation unset means the harness applies its own default, which is worth showing rather
 * than hiding behind a silent fallback.
 */
import {
  type Agent,
  PERMISSION_DECISIONS,
  PERMISSION_OPERATIONS,
  type PermissionSet,
} from '@agent-blueprint/core'
import { PlusIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { Field } from '@/components/editors/fields'
import type { FieldHint } from '@/lib/field-findings'
import { Button } from '@/components/ui/button'
import { Input, SEVERITY_CLASSES, type Severity } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

type Operation = (typeof PERMISSION_OPERATIONS)[number]
type Decision = (typeof PERMISSION_DECISIONS)[number]

const OPERATION_LABELS: Record<Operation, string> = {
  'fs.read': 'Read files',
  'fs.write': 'Create and edit files',
  'fs.delete': 'Delete files',
  'shell.readonly': 'Run read-only commands',
  'shell.mutating': 'Run commands that change state',
  'git.read': 'Read git history',
  'git.commit': 'Stage and commit',
  'git.push': 'Push',
  'git.force-push': 'Force-push',
  'net.docs': 'Fetch documentation',
  'net.any': 'Make any network request',
  mcp: 'Use MCP servers',
}

/** The severity colours the whole product uses, named for what a decision means here. */
const DECISION_VARIANT: Record<Decision, Severity> = {
  allow: 'success',
  ask: 'warning',
  deny: 'danger',
}

export function PermissionsGrid({
  permissions,
  onChange,
  hints,
}: {
  permissions: Agent['permissions']
  onChange: (permissions: PermissionSet) => void
  hints?: FieldHint[]
}) {
  const [pattern, setPattern] = useState('')
  const [patternOperation, setPatternOperation] = useState<Operation>('shell.mutating')

  const setOperation = (operation: Operation, decision: Decision | undefined) => {
    const operations = { ...permissions.operations }
    if (decision === undefined) delete operations[operation]
    else operations[operation] = decision
    onChange({ ...permissions, operations })
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Permissions"
        help="What this agent may do. Unset means the harness decides, which is rarely what you want for anything destructive."
        {...(hints ? { hints } : {})}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="py-1 text-left font-medium">Operation</th>
              {PERMISSION_DECISIONS.map((decision) => (
                <th key={decision} className="w-16 py-1 font-medium capitalize">
                  {decision}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_OPERATIONS.map((operation) => {
              const current = permissions.operations[operation]
              return (
                <tr key={operation} className="border-t">
                  <td className="py-1 pr-2">
                    <span className="block">{OPERATION_LABELS[operation]}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">{operation}</span>
                  </td>
                  {PERMISSION_DECISIONS.map((decision) => (
                    <td key={decision} className="py-1 text-center">
                      {/*
                        A toggle rather than a radio: the three cells sit in separate table
                        cells, so they cannot form a radio group, and a lone "radio, 1 of 1"
                        is worse than an honest pressed state. Clicking the current decision
                        clears it, which no radio can express either.
                      */}
                      <button
                        type="button"
                        aria-pressed={current === decision}
                        aria-label={`${OPERATION_LABELS[operation]}: ${decision}`}
                        onClick={() =>
                          setOperation(operation, current === decision ? undefined : decision)
                        }
                        className={cn(
                          'rounded border px-2 py-0.5 text-xs transition-colors',
                          current === decision
                            ? SEVERITY_CLASSES[DECISION_VARIANT[decision]]
                            : 'text-muted-foreground hover:border-accent',
                        )}
                      >
                        {current === decision ? '●' : '○'}
                      </button>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Field>

      <Field
        label="Exceptions"
        help="A specific command or path that overrides the blanket decision, for example `dotnet test *`."
      >
        <ul className="flex flex-col gap-1">
          {permissions.patterns.map((entry, index) => (
            <li
              key={`${entry.operation}-${entry.pattern}-${index}`}
              className="flex items-center gap-1"
            >
              <span
                className={cn(
                  'rounded border px-1.5 py-0.5 text-xs',
                  SEVERITY_CLASSES[DECISION_VARIANT[entry.decision]],
                )}
              >
                {entry.decision}
              </span>
              <code className="min-w-0 flex-1 truncate text-xs">{entry.pattern}</code>
              <span className="text-muted-foreground font-mono text-[11px]">{entry.operation}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove exception ${entry.pattern}`}
                onClick={() =>
                  onChange({
                    ...permissions,
                    patterns: permissions.patterns.filter((_, position) => position !== index),
                  })
                }
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1">
          <select
            aria-label="Exception operation"
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            value={patternOperation}
            onChange={(event) => setPatternOperation(event.target.value as Operation)}
          >
            {PERMISSION_OPERATIONS.map((operation) => (
              <option key={operation} value={operation}>
                {operation}
              </option>
            ))}
          </select>
          <Input
            value={pattern}
            aria-label="Exception pattern"
            placeholder="dotnet test *"
            className="font-mono"
            onChange={(event) => setPattern(event.target.value)}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Add exception"
            onClick={() => {
              const trimmed = pattern.trim()
              if (!trimmed) return
              onChange({
                ...permissions,
                patterns: [
                  ...permissions.patterns,
                  { operation: patternOperation, pattern: trimmed, decision: 'allow' },
                ],
              })
              setPattern('')
            }}
          >
            <PlusIcon />
          </Button>
        </div>
      </Field>
    </div>
  )
}
