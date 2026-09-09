/**
 * The small primitives: input, textarea, label, badge, separator, card, kbd.
 *
 * They are deliberately plain. An IDE shows many of them at once, so anything decorative
 * here multiplies into noise; the only visual weight is the hairline border.
 */
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'border-input bg-background flex h-8 w-full rounded-md border px-2.5 py-1 text-sm outline-none',
        'placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input bg-background field-sizing-content flex min-h-16 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none',
        'placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn('text-sm leading-none font-medium select-none', className)}
      {...props}
    />
  )
}

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground border-transparent',
        outline: 'text-foreground',
        accent: 'bg-accent-muted text-accent border-transparent',
        success: 'bg-success-muted text-success border-transparent',
        warning: 'bg-warning-muted text-warning border-transparent',
        danger: 'bg-danger-muted text-danger border-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative
      orientation={orientation}
      className={cn(
        'bg-border shrink-0',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('bg-card text-card-foreground rounded-lg border', className)}
      {...props}
    />
  )
}

/** A keyboard shortcut, for menus and the command palette. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'text-muted-foreground bg-muted rounded border px-1 font-mono text-[11px] leading-5',
        className,
      )}
      {...props}
    />
  )
}

export { badgeVariants }
