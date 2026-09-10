/**
 * The mark, defined once (P9-01).
 *
 * `src/app/icon.png` is the supplied artwork and also the favicon: Next reads that filename
 * as the app icon, so importing it here reuses the one file rather than checking a second
 * copy into `public/`. It goes through `next/image` because the original is 680 KB — about
 * the weight of the rest of the page — and every placement here wants it at 24 to 96 pixels.
 *
 * The artwork is a single lockup: a square mark sitting above the words "Agent Blueprint".
 * A 44px top bar has room for the mark and not for the words, and there is no mark-only
 * export yet, so the small placements crop to the mark with CSS — the artwork is drawn
 * larger than its box and offset so the mark lands in the middle, and the box clips the
 * rest. `MARK` is that crop, measured off the 1254 x 1254 original.
 *
 * When a mark-only file arrives: import it, return it from the `mark` branch at `size` the
 * way `lockup` does, and delete `MARK` and the clipping wrapper. Nothing outside this file
 * has to change.
 */
import Image from 'next/image'

import artwork from '@/app/icon.png'
import { cn } from '@/lib/utils'

/**
 * The crop that turns the combined artwork into the mark alone, measured off the original.
 *
 * The window is not square, because the mark is not: it is about a fifth wider than it is
 * tall, and forcing it into a square box either clips the sparkle at its left or lets the
 * top of the "A" in "Agent" creep in underneath. All four numbers are shares of the box's
 * width, so a placement only has to say how wide it wants the mark to be.
 */
const MARK = {
  /** The box's height as a share of its width. */
  aspect: 0.833,
  /** How much larger than the box's width the whole artwork is drawn. */
  scale: 1.72,
  /** Where that oversized artwork sits, as a share of the box's width. */
  left: -0.349,
  top: -0.1595,
}

export interface LogoProps {
  /** `mark` is the square symbol alone; `lockup` is the symbol above the wordmark. */
  variant?: 'mark' | 'lockup'
  /**
   * The rendered width, in CSS pixels. `lockup` is square; `mark` is `MARK.aspect` as tall
   * as it is wide.
   */
  size?: number
  /**
   * The accessible name. Empty — and so hidden from assistive technology — wherever a
   * wordmark or a labelled link beside it already names the product, which is every header
   * but the dashboard's.
   */
  alt?: string
  className?: string
}

export function Logo({ variant = 'mark', size = 24, alt = '', className }: LogoProps) {
  if (variant === 'lockup') {
    // Nothing to crop, and nothing to preload either: the hero text is what a reader is
    // waiting for, so the artwork loads on the browser's own terms rather than ahead of it.
    return (
      <Image
        src={artwork}
        alt={alt}
        width={size}
        height={size}
        sizes={`${size}px`}
        className={cn('shrink-0', className)}
      />
    )
  }

  // Asking `next/image` for the drawn size rather than the box size means the optimizer
  // resizes to what is actually painted, crop included.
  const drawn = Math.round(size * MARK.scale)

  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden', className)}
      style={{ width: size, height: Math.round(size * MARK.aspect) }}
    >
      <Image
        src={artwork}
        alt={alt}
        width={drawn}
        height={drawn}
        sizes={`${drawn}px`}
        className="absolute max-w-none"
        style={{ left: Math.round(size * MARK.left), top: Math.round(size * MARK.top) }}
      />
    </span>
  )
}
