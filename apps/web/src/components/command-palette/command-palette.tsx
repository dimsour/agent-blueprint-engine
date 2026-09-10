'use client'

/**
 * The command palette.
 *
 * It is the map of the product as much as a way to run things, so an action that is not
 * built yet is listed and disabled with the reason rather than hidden — the same rule the
 * top bar follows. Everything that is enabled here does the real thing through the store,
 * never a shortcut around it.
 */
import {
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityKind,
  getCollection,
} from '@agent-blueprint/core'
import { Command } from 'cmdk'
import {
  ActivityIcon,
  CheckIcon,
  CloudUploadIcon,
  LayersIcon,
  DownloadIcon,
  EyeIcon,
  FileCodeIcon,
  PlusIcon,
  RedoIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UndoIcon,
} from 'lucide-react'
import { type ReactNode, useMemo } from 'react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/overlays'
import { validateNow } from '@/lib/actions'
import { ASSISTANT_ACTIONS } from '@/lib/ai/actions'
import { withTarget } from '@/lib/targets'
import { hasPreview } from '@/lib/artifact-source'
import { useModifierLabel } from '@/lib/shortcuts'
import {
  type ReportView,
  useHistoryState,
  useWorkspace,
  workspaceHistory,
} from '@/lib/state/workspace-store'

/** The name a freshly created artifact gets, before the author renames it. */
function newArtifactName(kind: EntityKind): string {
  return `New ${ENTITY_KIND_INFO[kind].label.toLowerCase()}`
}

const HEADING =
  '[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase'

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group heading={heading} className={HEADING}>
      {children}
    </Command.Group>
  )
}

function Item({
  icon,
  label,
  value,
  hint,
  keywords,
  disabled,
  onSelect,
}: {
  icon: ReactNode
  label: string
  /** Unique key for cmdk; defaults to the label. Two artifacts may share a name. */
  value?: string
  hint?: string
  keywords?: string[]
  disabled?: boolean
  onSelect?: () => void
}) {
  return (
    <Command.Item
      value={value ?? label}
      {...(keywords ? { keywords } : {})}
      disabled={disabled ?? false}
      onSelect={onSelect ?? (() => {})}
      className="data-[selected=true]:bg-accent-muted data-[selected=true]:text-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[disabled=true]:cursor-default data-[disabled=true]:opacity-50"
    >
      <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="text-muted-foreground shrink-0 text-xs">{hint}</span> : null}
    </Command.Item>
  )
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Absent in tests that only care about the rest of the palette. */
  onOpenAssistant?: () => void
  onPush?: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenAssistant,
  onPush,
}: CommandPaletteProps) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const selection = useWorkspace((state) => state.selection)
  const dirty = useWorkspace((state) => state.dirty)
  const create = useWorkspace((state) => state.create)
  const select = useWorkspace((state) => state.select)
  const setArtifactTab = useWorkspace((state) => state.setArtifactTab)
  const setView = useWorkspace((state) => state.setView)
  const updateBlueprint = useWorkspace((state) => state.updateBlueprint)
  const save = useWorkspace((state) => state.save)
  const mod = useModifierLabel()
  // Read through the temporal store's own hook, so the items react to history rather than
  // happening to re-render when the Blueprint changes.
  const canUndo = useHistoryState((state) => state.pastStates.length > 0)
  const canRedo = useHistoryState((state) => state.futureStates.length > 0)

  const artifacts = useMemo(() => {
    if (!blueprint) return []
    return ENTITY_KINDS.flatMap((kind) =>
      getCollection(blueprint, kind).map((entity) => ({ kind, id: entity.id, name: entity.name })),
    )
  }, [blueprint])

  if (!blueprint) return null

  /** A report is about the whole Blueprint, so it clears the selection on the way. */
  const goToReport = (view: ReportView) => {
    select(undefined)
    setView(view)
  }

  /** Every action closes the palette; none of them leave it open behind a change. */
  const run = (action: () => void) => () => {
    action()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command label="Command palette" loop className="flex max-h-[60vh] flex-col">
          <Command.Input
            placeholder="Type a command or search for an artifact…"
            aria-label="Command"
            className="placeholder:text-muted-foreground h-11 w-full shrink-0 border-b bg-transparent px-4 text-sm outline-none"
          />
          <Command.List className="min-h-0 flex-1 overflow-auto p-1.5">
            <Command.Empty className="text-muted-foreground px-2 py-6 text-center text-sm">
              Nothing matches that.
            </Command.Empty>

            <Group heading="Create">
              {ENTITY_KINDS.map((kind) => (
                <Item
                  key={kind}
                  icon={<PlusIcon />}
                  label={`Create ${ENTITY_KIND_INFO[kind].label}`}
                  keywords={['new', 'add']}
                  onSelect={run(() => {
                    create(kind, newArtifactName(kind))
                  })}
                />
              ))}
            </Group>

            {selection ? (
              <Group heading="This artifact">
                <Item
                  icon={<SlidersHorizontalIcon />}
                  label="Show the form"
                  onSelect={run(() => setArtifactTab('visual'))}
                />
                <Item
                  icon={<FileCodeIcon />}
                  label="Show the project file"
                  keywords={['markdown', 'yaml', 'source']}
                  onSelect={run(() => setArtifactTab('source'))}
                />
                {hasPreview(selection) ? (
                  <Item
                    icon={<EyeIcon />}
                    label="Show the preview"
                    hint={`${mod}P`}
                    onSelect={run(() => setArtifactTab('preview'))}
                  />
                ) : null}
              </Group>
            ) : null}

            <Group heading="Verify">
              <Item
                icon={<CheckIcon />}
                label="Validate"
                onSelect={run(() => void validateNow())}
              />
              <Item
                icon={<ActivityIcon />}
                label="Show health"
                keywords={['evaluation', 'score', 'dimensions']}
                onSelect={run(() => goToReport('evaluation'))}
              />
              <Item
                icon={<LayersIcon />}
                label="Show compatibility"
                keywords={['harness', 'portability', 'matrix']}
                onSelect={run(() => goToReport('compatibility'))}
              />
            </Group>

            <Group heading="Blueprint">
              <Item
                icon={<SaveIcon />}
                label="Save"
                hint={`${mod}S`}
                disabled={!dirty}
                onSelect={run(() => void save())}
              />
              <Item
                icon={<UndoIcon />}
                label="Undo"
                hint={`${mod}Z`}
                disabled={!canUndo}
                onSelect={run(workspaceHistory.undo)}
              />
              <Item
                icon={<RedoIcon />}
                label="Redo"
                hint={`⇧${mod}Z`}
                disabled={!canRedo}
                onSelect={run(workspaceHistory.redo)}
              />
            </Group>

            <Group heading="Targets">
              {blueprint.targets.map((target) => (
                <Item
                  key={target.harnessId}
                  icon={<CheckIcon />}
                  label={`${target.enabled ? 'Disable' : 'Enable'} ${target.harnessId}`}
                  keywords={['harness', 'target', 'switch']}
                  onSelect={run(() => {
                    updateBlueprint({
                      targets: withTarget(blueprint, target.harnessId, !target.enabled),
                    })
                  })}
                />
              ))}
            </Group>

            <Group heading="Deliver">
              <Item
                icon={<DownloadIcon />}
                label="Export"
                hint={`${mod}E`}
                keywords={['download', 'archive', 'zip', 'compiled', 'generated files']}
                onSelect={run(() => goToReport('export'))}
              />
              <Item
                icon={<CloudUploadIcon />}
                label="Push to GitHub"
                keywords={['commit', 'repository', 'remote', 'publish']}
                disabled={!blueprint}
                onSelect={run(() => onPush?.())}
              />
            </Group>

            <Group heading="AI">
              {ASSISTANT_ACTIONS.map((action) => (
                <Item
                  key={action.id}
                  icon={<SparklesIcon />}
                  label={action.label}
                  hint={
                    blueprint ? (action.unavailable(blueprint, selection) ?? `${mod}/`) : `${mod}/`
                  }
                  disabled={!blueprint || action.unavailable(blueprint, selection) !== undefined}
                  keywords={['ai', 'assistant', action.group.toLowerCase()]}
                  onSelect={run(() => onOpenAssistant?.())}
                />
              ))}
            </Group>

            <Group heading="Go to">
              {artifacts.map((artifact) => (
                <Item
                  key={`${artifact.kind}:${artifact.id}`}
                  value={`${artifact.name} ${artifact.kind} ${artifact.id}`}
                  icon={<span aria-hidden>·</span>}
                  label={artifact.name}
                  hint={ENTITY_KIND_INFO[artifact.kind].label}
                  onSelect={run(() => select({ kind: artifact.kind, id: artifact.id }))}
                />
              ))}
            </Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
