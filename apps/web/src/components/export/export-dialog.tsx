'use client'

/**
 * Export the source project as a ZIP.
 *
 * The archive holds `blueprint/` and nothing else: the source of truth, not the compiled
 * output. Compiling for each harness and shipping those files too is the export view's job
 * (roadmap P5), and saying so here is better than quietly shipping half of what a name like
 * "Export" promises.
 *
 * The file list is shown before the download because an archive is the one thing that leaves
 * the browser, and it should be possible to see exactly what that is.
 */
import { DownloadIcon, LoaderIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

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
import { downloadZip, filesToZip, projectFilesOf } from '@/lib/storage'
import { useWorkspace } from '@/lib/state/workspace-store'

/** Bytes as a short human string. Sizes here are kilobytes, so one decimal is enough. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} kB`
}

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const [busy, setBusy] = useState(false)

  const files = useMemo(() => (blueprint ? projectFilesOf(blueprint) : {}), [blueprint])
  const paths = useMemo(() => Object.keys(files).sort(), [files])
  const totalBytes = useMemo(
    () => paths.reduce((total, path) => total + new Blob([files[path] ?? '']).size, 0),
    [files, paths],
  )

  if (!blueprint) return null

  const download = async () => {
    setBusy(true)
    try {
      downloadZip(await filesToZip(files), `${blueprint.id}.zip`)
      onOpenChange(false)
      toast.success(`Exported ${paths.length} files`, {
        description: `${blueprint.id}.zip is in your downloads.`,
      })
    } catch (error) {
      toast.error('Could not build the archive', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export {blueprint.name}</DialogTitle>
          <DialogDescription>
            The source project, as the files a repository would hold. Compiled output for each
            harness arrives with the export view.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline">{paths.length} files</Badge>
          <Badge variant="outline">{formatBytes(totalBytes)}</Badge>
          <span className="text-muted-foreground font-mono text-xs">{blueprint.id}.zip</span>
        </div>

        <ul aria-label="Files in the archive" className="max-h-64 overflow-auto rounded-md border">
          {paths.map((path) => (
            <li
              key={path}
              className="flex items-baseline justify-between gap-3 border-b px-3 py-1 text-xs last:border-b-0"
            >
              <span className="truncate font-mono">{path}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {formatBytes(new Blob([files[path] ?? '']).size)}
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void download()} disabled={busy}>
            {busy ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
            Download ZIP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
