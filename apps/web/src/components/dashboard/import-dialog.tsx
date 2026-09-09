'use client'

/**
 * What was in that archive, before it becomes a project.
 *
 * A Blueprint can arrive from a colleague, a ZIP, or a git clone, so the app reads it and
 * reports what it found rather than opening it and hoping. Nothing is stored until Open is
 * pressed, and errors do not block the import: a project with problems is exactly the
 * project a person needs to open in order to fix it.
 */
import { countEntities, ENTITY_KIND_INFO, ENTITY_KINDS, getCollection } from '@agent-blueprint/core'
import { AlertTriangleIcon, CircleAlertIcon, LoaderIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays'
import { Badge } from '@/components/ui/primitives'
import type { ImportPreview } from '@/lib/storage'

export function ImportDialog({
  preview,
  onCancel,
  onOpen,
}: {
  preview: ImportPreview
  onCancel: () => void
  onOpen: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const { blueprint, errors, warnings, diagnostics } = preview

  const kinds = ENTITY_KINDS.map((kind) => ({
    kind,
    count: getCollection(blueprint, kind).length,
  })).filter((entry) => entry.count > 0)

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open {blueprint.name}?</DialogTitle>
          <DialogDescription>
            Read from {preview.label}. {countEntities(blueprint)} artifacts, nothing stored yet.
          </DialogDescription>
        </DialogHeader>

        <ul aria-label="What was found" className="flex flex-wrap gap-2">
          {kinds.map((entry) => (
            <li key={entry.kind}>
              <Badge variant="outline">
                {entry.count} {ENTITY_KIND_INFO[entry.kind].pluralLabel.toLowerCase()}
              </Badge>
            </li>
          ))}
        </ul>

        {diagnostics.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            The project read cleanly. Nothing to report.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm">
              {errors.length > 0 ? (
                <span className="text-danger flex items-center gap-1.5">
                  <CircleAlertIcon className="size-3.5" />
                  {errors.length} error{errors.length === 1 ? '' : 's'}
                </span>
              ) : null}
              {warnings.length > 0 ? (
                <span className="text-warning flex items-center gap-1.5">
                  <AlertTriangleIcon className="size-3.5" />
                  {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </span>
            <ul
              aria-label="Problems found while reading"
              className="max-h-52 overflow-auto rounded-md border"
            >
              {diagnostics.slice(0, 50).map((diagnostic, index) => (
                <li
                  key={`${diagnostic.code}-${index}`}
                  className="flex gap-2 border-b px-3 py-1.5 text-xs last:border-b-0"
                >
                  <span className="text-muted-foreground shrink-0 font-mono">
                    {diagnostic.code}
                  </span>
                  <span className="min-w-0">{diagnostic.message}</span>
                </li>
              ))}
            </ul>
            {errors.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                You can still open it. Errors are shown in the workspace so they can be fixed.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setBusy(true)
              void Promise.resolve(onOpen()).finally(() => setBusy(false))
            }}
            disabled={busy}
          >
            {busy ? <LoaderIcon className="animate-spin" /> : null}
            Open project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
