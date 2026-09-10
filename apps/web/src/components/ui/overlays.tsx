/**
 * Radix wrappers for the overlay primitives: dialog, dropdown menu, tooltip, tabs and
 * select. Accessibility (focus trapping, roving focus, escape handling, aria wiring) comes
 * from Radix; everything here is styling and defaults.
 */
'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import {
  type ComponentProps,
  createContext,
  type RefObject,
  useContext,
  useEffect,
  useRef,
} from 'react'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

/**
 * The dialog root, plus the one thing Radix cannot do for us here.
 *
 * Radix restores focus to the `DialogTrigger` it opened from. Every dialog in this app is
 * controlled by state instead — a command in the palette, a toolbar button, a row action —
 * so there is no trigger to go back to, and closing left focus on `<body>`: a keyboard user
 * lost their place in the page every time they pressed Escape. So the root remembers what was
 * focused when it opened and puts focus back there.
 */
const DialogOpener = createContext<RefObject<HTMLElement | null> | null>(null)

export function Dialog({ open, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // Uncontrolled, or open: Radix has a trigger to go back to, or there is nothing to record.
    if (open !== false) return

    // While closed, remember what has focus. Capturing at open time is too late — the dialog
    // is opened by state, not by a Radix trigger, so nothing announces the moment it happens.
    const remember = (event: FocusEvent): void => {
      opener.current = event.target as HTMLElement | null
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [open])

  return (
    <DialogOpener.Provider value={opener}>
      <DialogPrimitive.Root {...(open === undefined ? {} : { open })} {...props} />
    </DialogOpener.Provider>
  )
}

export function DialogContent({
  className,
  children,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  const opener = useContext(DialogOpener)
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onCloseAutoFocus={(event) => {
          // The moment Radix would put focus back on the trigger. There is no trigger, so put
          // it where the user was instead. Doing this on a timer would race the closing
          // animation, which is what delays the unmount.
          const target = opener?.current
          if (target?.isConnected) {
            event.preventDefault()
            target.focus()
          }
          onCloseAutoFocus?.(event)
        }}
        className={cn(
          'bg-card data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-5 shadow-lg',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="hover:bg-muted absolute top-3 right-3 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex justify-end gap-2', className)} {...props} />
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base leading-none font-semibold', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50 min-w-40 overflow-hidden rounded-md border p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "focus:bg-muted relative flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('text-muted-foreground px-2 py-1.5 text-xs font-medium', className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'bg-primary text-primary-foreground z-50 rounded px-2 py-1 text-xs',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('bg-muted inline-flex h-7 items-center gap-0.5 rounded-md p-0.5', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content className={cn('min-h-0 flex-1 outline-none', className)} {...props} />
  )
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'border-input bg-background flex h-8 w-full items-center justify-between gap-2 rounded-md border px-2.5 text-sm outline-none focus-visible:border-ring disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-60" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'bg-popover text-popover-foreground relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border shadow-md',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="w-full min-w-[var(--radix-select-trigger-width)] p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'focus:bg-muted relative flex w-full cursor-default items-center gap-2 rounded py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
}
