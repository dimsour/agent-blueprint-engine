'use client'

import Link from 'next/link'
import {
  CheckIcon,
  SearchIcon,
  SettingsIcon,
  TriangleAlertIcon,
  CloudUploadIcon,
  DownloadIcon,
  LoaderIcon,
  SaveIcon,
  SparklesIcon,
} from 'lucide-react'

import { ThemeToggle } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { Badge, Kbd } from '@/components/ui/primitives'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/overlays'
import { useModifierLabel } from '@/lib/shortcuts'
import { useWorkspace } from '@/lib/state/workspace-store'

/** Actions that are not built yet are shown disabled with the reason, not hidden. */
function PendingAction({
  label,
  icon,
  reason,
}: {
  label: string
  icon: React.ReactNode
  reason: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button swallows pointer events, so the tooltip needs a wrapper. */}
        <span>
          <Button variant="ghost" size="sm" disabled>
            {icon}
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}

export function TopBar({
  onOpenPalette,
  onExport,
  onValidate,
}: {
  onOpenPalette: () => void
  onExport: () => void
  onValidate: () => void
}) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const dirty = useWorkspace((state) => state.dirty)
  const saving = useWorkspace((state) => state.saving)
  const validating = useWorkspace((state) => state.validating)
  const save = useWorkspace((state) => state.save)
  const saveError = useWorkspace((state) => state.saveError)
  const mod = useModifierLabel()

  return (
    <>
      <Link
        href="/"
        className="text-sm font-semibold tracking-tight whitespace-nowrap"
        aria-label="Back to all projects"
      >
        Agent Blueprint
      </Link>

      <span className="text-muted-foreground">/</span>

      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {blueprint?.name ?? 'Loading…'}
      </span>

      {saveError ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="danger" role="alert">
              <TriangleAlertIcon className="size-3" />
              Not saved
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{saveError}</TooltipContent>
        </Tooltip>
      ) : dirty ? (
        <Badge variant="warning">Unsaved</Badge>
      ) : blueprint ? (
        <Badge variant="success">
          <CheckIcon className="size-3" />
          Saved
        </Badge>
      ) : null}

      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onOpenPalette} className="gap-2">
          <SearchIcon />
          <span className="hidden sm:inline">Commands</span>
          <Kbd>{mod}K</Kbd>
        </Button>
        <Button variant="ghost" size="sm" onClick={onValidate} disabled={!blueprint || validating}>
          {validating ? <LoaderIcon className="animate-spin" /> : <CheckIcon />}
          Validate
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? <LoaderIcon className="animate-spin" /> : <SaveIcon />}
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onExport} disabled={!blueprint}>
          <DownloadIcon />
          Export
        </Button>
        <PendingAction
          label="GitHub"
          icon={<CloudUploadIcon />}
          reason="Pushing to GitHub arrives in roadmap P7"
        />
        <PendingAction
          label="AI"
          icon={<SparklesIcon />}
          reason="The AI assistant arrives in roadmap P6"
        />
        <Button variant="ghost" size="icon-sm" asChild aria-label="Settings">
          <Link href="/settings">
            <SettingsIcon />
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </>
  )
}
