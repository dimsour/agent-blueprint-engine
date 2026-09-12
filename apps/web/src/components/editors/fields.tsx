'use client'

/**
 * Form fields.
 *
 * Every field is controlled from the store: there is no draft copy, so what you see is
 * always the Blueprint the validator just ran on. Commits go straight through
 * `upsertEntity`, which is a schema parse of one entity and cheap enough per keystroke.
 */
import { AlertTriangleIcon, CircleAlertIcon, InfoIcon, PlusIcon, XIcon } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/overlays'
import { Badge, Input, Label, Textarea } from '@/components/ui/primitives'
import type { FieldHint } from '@/lib/field-findings'
import { useWorkspace } from '@/lib/state/workspace-store'
import { cn } from '@/lib/utils'

/**
 * Keeps what the user typed while the parent decides whether to accept it.
 *
 * A required field is briefly empty when someone selects all and retypes, and the schema
 * rejects that. Without a draft the input would snap back mid-word. State is adjusted during
 * render rather than in an effect, which is the pattern React documents for deriving state
 * from props.
 */
function useDraft(value: string): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  return [draft, setDraft]
}

/**
 * The info control beside a label (P9-04).
 *
 * A tooltip on its own would put the help behind a hover, which is nothing at all to someone
 * on a keyboard or a screen reader — and the example is the half that teaches, so it cannot
 * live somewhere only a mouse can reach. So the same button is both: hovering or focusing it
 * shows the sentence as a tooltip, and pressing it opens a panel that stays open, where the
 * example can be read and inserted with the Tab key.
 *
 * It brings its own `TooltipProvider`. `Field` is mounted well outside the app shell — in
 * dialogs, in the wizard, and in tests that render one form on its own — and Radix throws
 * without a provider above it. Nesting providers is how Radix scopes them.
 */
function HelpButton({
  label,
  help,
  example,
  open,
  panelId,
  onToggle,
  ref,
}: {
  label: string
  help?: string
  example?: string
  open: boolean
  panelId: string
  onToggle: () => void
  ref: RefObject<HTMLButtonElement | null>
}) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            // Named after the field, so a screen reader reading the controls of a twelve-field
            // form hears twelve different buttons rather than twelve called "info".
            aria-label={`About ${label}`}
            aria-expanded={open}
            // Only while the panel exists: an `aria-controls` pointing at nothing is a
            // violation in its own right.
            {...(open ? { 'aria-controls': panelId } : {})}
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground rounded-full transition-colors"
          >
            <InfoIcon className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {help ? <p>{help}</p> : null}
          {example ? (
            <p className={cn('font-mono', help && 'mt-1 opacity-80')}>{firstLine(example)}</p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** A tooltip is one glance; a body example is sixteen lines. Show the opening of it. */
function firstLine(example: string): string {
  const [first = ''] = example.split('\n')
  return first === example ? example : `${first}…`
}

/**
 * The panel behind the info control: what the field is for, what a filled-in one looks like,
 * and a way to put the example in.
 *
 * Inserting goes through the field's own `onChange`, so it is an edit like any other — it
 * lands in the Blueprint through `upsertEntity` and ⌘Z takes it back out. When the field
 * already has something in it the button asks first: an example is a suggestion, and a
 * suggestion that eats what you wrote is not one.
 */
function HelpPanel({
  id,
  label,
  help,
  example,
  hasContent,
  onInsertExample,
}: {
  id: string
  label: string
  help?: string
  example?: string
  hasContent: boolean
  onInsertExample?: ((example: string) => void) | undefined
}) {
  const [confirming, setConfirming] = useState(false)
  const insert = (text: string) => {
    onInsertExample?.(text)
    setConfirming(false)
  }

  return (
    <div id={id} className="bg-muted/50 flex flex-col gap-2 rounded-md border p-2.5 text-xs">
      {help ? <p className="text-muted-foreground">{help}</p> : null}
      {example ? (
        <>
          <p className="font-mono break-words whitespace-pre-wrap">{example}</p>
          {onInsertExample && confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground">Replace what is already there?</p>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Replace ${label} with the example`}
                onClick={() => insert(example)}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Cancel replacing ${label}`}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          ) : onInsertExample ? (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              aria-label={`Insert example into ${label}`}
              onClick={() => (hasContent ? setConfirming(true) : insert(example))}
            >
              Insert example
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function Field({
  label,
  help,
  example,
  hasContent = false,
  onInsertExample,
  htmlFor,
  hints,
  children,
  className,
}: {
  label: string
  help?: string
  /** A filled-in value for this field, from `FIELD_EXAMPLES`. */
  example?: string
  /** Whether inserting the example would overwrite something the user wrote. */
  hasContent?: boolean
  /** Applies the example through the same path typing takes, or the example cannot be used. */
  onInsertExample?: (example: string) => void
  htmlFor?: string
  /** The findings about this field, from `fieldFindingsFor` (P9-20). */
  hints?: FieldHint[]
  children: ReactNode
  className?: string
}) {
  const panelId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const explained = Boolean(help ?? example)

  const dismiss = () => {
    setOpen(false)
    // Escape must not cost a keyboard user their place in the form.
    trigger.current?.focus()
  }

  return (
    <div
      className={cn('flex flex-col gap-1.5', className)}
      // On the whole field, not on the panel: pressing the info button leaves focus on the
      // button, which is outside the panel, so a handler there would never see the Escape a
      // keyboard user presses from the one place they actually are. Only mounted while the
      // panel is open, so Escape still reaches the dialog behind it the rest of the time.
      {...(open
        ? {
            onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key !== 'Escape') return
              event.stopPropagation()
              dismiss()
            },
          }
        : {})}
    >
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {explained ? (
          <HelpButton
            label={label}
            {...(help ? { help } : {})}
            {...(example ? { example } : {})}
            open={open}
            panelId={panelId}
            ref={trigger}
            onToggle={() => setOpen((current) => !current)}
          />
        ) : null}
      </div>
      {explained && open ? (
        <HelpPanel
          id={panelId}
          label={label}
          {...(help ? { help } : {})}
          {...(example ? { example } : {})}
          hasContent={hasContent}
          onInsertExample={onInsertExample}
        />
      ) : null}
      {children}
      {hints && hints.length > 0 ? <FieldHints hints={hints} /> : null}
      {/*
       * The sentence keeps its line until there is an example to take its place.
       *
       * A field that has both puts them together behind the icon, which is the wall of grey
       * text P9-04 is about. A field that has only a sentence gains nothing from hiding it —
       * and `help` is not always help: the API key field in Settings passes the masked key it
       * already holds through it, and that is a live status, not a definition. Hiding it
       * would be a loss rather than a tidy-up.
       */}
      {help && !example ? <p className="text-muted-foreground text-xs">{help}</p> : null}
    </div>
  )
}

/**
 * The findings about one field, under its control (P9-20).
 *
 * A finding lives in the health bar, the inspector and the evaluation view, and the person
 * fixing it is in none of those — they are on the form, in the field. This puts the finding
 * there: the code, the sentence, and when it comes from another artifact's check, the way
 * back to that artifact. "Its action is command, not secret-scan" beside the action select is
 * the fix; "from Requirement: security-enforcement" beside it is why.
 *
 * Not a live region: fields re-validate on every keystroke, and a screen reader announcing
 * the same finding on each is worse than one it can tab to.
 */
function FieldHints({ hints }: { hints: readonly FieldHint[] }) {
  const select = useWorkspace((state) => state.select)
  return (
    <ul aria-label="Findings about this field" className="flex flex-col gap-1">
      {hints.map((hint, index) => (
        <li
          key={`${hint.code}-${index}`}
          className={cn(
            'flex flex-wrap items-baseline gap-x-1.5 text-xs',
            hint.severity === 'error'
              ? 'text-danger'
              : hint.severity === 'warning'
                ? 'text-warning'
                : 'text-muted-foreground',
          )}
        >
          {hint.severity === 'error' ? (
            <CircleAlertIcon className="size-3 shrink-0 self-center" aria-hidden />
          ) : hint.severity === 'warning' ? (
            <AlertTriangleIcon className="size-3 shrink-0 self-center" aria-hidden />
          ) : (
            <InfoIcon className="size-3 shrink-0 self-center" aria-hidden />
          )}
          <span className="font-mono">{hint.code}</span>
          <span className="text-foreground/80 min-w-0">{hint.text}</span>
          {hint.from ? (
            <button
              type="button"
              onClick={() => select(hint.from)}
              className="hover:text-foreground text-muted-foreground underline underline-offset-2"
            >
              from {hint.from.kind}: {hint.from.id}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function TextField({
  label,
  help,
  hints,
  example,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  help?: string
  hints?: FieldHint[]
  example?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
}) {
  const id = useId()
  const [draft, setDraft] = useDraft(value)
  const commit = (next: string) => {
    setDraft(next)
    onChange(next)
  }
  return (
    <Field
      label={label}
      {...(help ? { help } : {})}
      {...(hints ? { hints } : {})}
      {...(example ? { example } : {})}
      hasContent={draft.trim().length > 0}
      onInsertExample={commit}
      htmlFor={id}
    >
      <Input
        id={id}
        value={draft}
        placeholder={placeholder ?? ''}
        className={mono ? 'font-mono' : undefined}
        onChange={(event) => commit(event.target.value)}
      />
    </Field>
  )
}

export function TextAreaField({
  label,
  help,
  hints,
  example,
  value,
  onChange,
  placeholder,
  rows = 3,
  mono,
}: {
  label: string
  help?: string
  hints?: FieldHint[]
  example?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  mono?: boolean
}) {
  const id = useId()
  const [draft, setDraft] = useDraft(value)
  const commit = (next: string) => {
    setDraft(next)
    onChange(next)
  }
  return (
    <Field
      label={label}
      {...(help ? { help } : {})}
      {...(hints ? { hints } : {})}
      {...(example ? { example } : {})}
      hasContent={draft.trim().length > 0}
      onInsertExample={commit}
      htmlFor={id}
    >
      <Textarea
        id={id}
        rows={rows}
        value={draft}
        placeholder={placeholder ?? ''}
        className={mono ? 'font-mono text-xs' : undefined}
        onChange={(event) => commit(event.target.value)}
      />
    </Field>
  )
}

export function SelectField<T extends string>({
  label,
  help,
  hints,
  value,
  options,
  onChange,
}: {
  label: string
  help?: string
  hints?: FieldHint[]
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    // The label points at the trigger, so the visible text and the accessible name are the
    // same thing rather than two names that happen to agree.
    <Field label={label} htmlFor={id} {...(help ? { help } : {})} {...(hints ? { hints } : {})}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/**
 * One row of a string list.
 *
 * The schema requires every item to be non-empty, so clearing a row to retype it is briefly
 * invalid and the parent will refuse it. The draft keeps what was typed either way, which is
 * what makes select-all-and-retype work at all.
 */
function ListItemInput({
  value,
  label,
  onChange,
}: {
  value: string
  label: string
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useDraft(value)
  return (
    <Input
      value={draft}
      aria-label={label}
      onChange={(event) => {
        setDraft(event.target.value)
        onChange(event.target.value)
      }}
    />
  )
}

/** A list of free-text lines: responsibilities, expertise, examples, intents. */
export function StringListField({
  label,
  help,
  hints,
  example,
  values,
  onChange,
  placeholder,
}: {
  label: string
  help?: string
  hints?: FieldHint[]
  example?: string
  values: readonly string[]
  onChange: (values: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...values, trimmed])
    setDraft('')
  }

  return (
    <Field
      label={label}
      {...(help ? { help } : {})}
      {...(hints ? { hints } : {})}
      {...(example ? { example } : {})}
      // A list gains a row rather than losing one, so there is nothing to ask about: the
      // example is one more line beside what is already written, never instead of it.
      onInsertExample={(text) => onChange([...values, text])}
    >
      <ul className="flex flex-col gap-1">
        {values.map((value, index) => (
          // Keyed by position only. Including the value would change the key on every
          // keystroke, remounting the input and taking the caret with it.
          <li key={index} className="flex items-center gap-1">
            <ListItemInput
              value={value}
              label={`${label} ${index + 1}`}
              onChange={(text) => {
                const next = [...values]
                next[index] = text
                onChange(next)
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => onChange(values.filter((_, position) => position !== index))}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          placeholder={placeholder ?? `Add ${label.toLowerCase()}…`}
          aria-label={`New ${label}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <Button variant="ghost" size="icon-sm" aria-label={`Add ${label}`} onClick={add}>
          <PlusIcon />
        </Button>
      </div>
    </Field>
  )
}

/** Picks other artifacts by id: an agent's skills, a skill's references, and so on. */
export function RefListField({
  label,
  help,
  hints,
  selected,
  options,
  onChange,
  onCreate,
  createLabel,
}: {
  label: string
  help?: string
  hints?: FieldHint[]
  selected: readonly string[]
  options: readonly { id: string; name: string }[]
  onChange: (ids: string[]) => void
  /** Makes a new artifact of this kind and links it, without leaving this form. */
  onCreate?: () => void
  createLabel?: string
}) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((current) => current !== id) : [...selected, id],
    )
  }

  return (
    <Field label={label} {...(help ? { help } : {})} {...(hints ? { hints } : {})}>
      {options.length === 0 && !onCreate ? (
        <p className="text-muted-foreground text-xs">
          None exist yet. Create one and it will appear here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {options.map((option) => {
            const isSelected = selected.includes(option.id)
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(option.id)}
                className={cn(
                  'rounded border px-1.5 py-0.5 text-xs transition-colors',
                  isSelected
                    ? 'bg-accent-muted text-accent border-transparent'
                    : 'text-muted-foreground hover:border-accent',
                )}
              >
                {option.name}
              </button>
            )
          })}
          {onCreate ? (
            <button
              type="button"
              onClick={onCreate}
              className="text-accent hover:border-accent rounded border border-dashed px-1.5 py-0.5 text-xs transition-colors"
            >
              + {createLabel ?? `New ${label.toLowerCase()}`}
            </button>
          ) : null}
        </div>
      )}
    </Field>
  )
}

/** Free-form tags, shown as chips. */
export function TagsField({
  values,
  onChange,
  hints,
}: {
  values: readonly string[]
  onChange: (values: string[]) => void
  hints?: FieldHint[]
}) {
  const [draft, setDraft] = useState('')
  return (
    <Field label="Tags" {...(hints ? { hints } : {})}>
      <div className="flex flex-wrap items-center gap-1">
        {values.map((tag) => (
          <Badge key={tag} variant="outline" className="gap-1">
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(values.filter((current) => current !== tag))}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={draft}
          aria-label="Add tag"
          placeholder="Add tag…"
          className="h-6 w-28 text-xs"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            const trimmed = draft.trim()
            if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed])
            setDraft('')
          }}
        />
      </div>
    </Field>
  )
}
