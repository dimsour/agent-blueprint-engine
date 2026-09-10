/**
 * The mark, defined once (P9-01).
 *
 * The brand arrives as one square file — a mark above the words "Agent Blueprint" — and a
 * 44px top bar has room for the mark and not for the words. `pnpm --filter web logo` cuts
 * that file into the two assets imported here, each tight to its subject, plus the favicon
 * at `src/app/icon.png` where the App Router reads it. See `e2e/logo-assets.spec.ts` for the
 * measured bounds; nothing here crops, so replacing the artwork is one command.
 *
 * Both go through `next/image`, which resizes them to what is actually painted: the source
 * is 680 KB, about the weight of the rest of the page, and no placement wants more than 96
 * pixels of it.
 */
import Image from 'next/image'

import lockup from '@/assets/logo-lockup.png'
import mark from '@/assets/logo-mark.png'
import { cn } from '@/lib/utils'

export interface LogoProps {
  /** `mark` is the symbol alone; `lockup` is the symbol above the wordmark. */
  variant?: 'mark' | 'lockup'
  /** The rendered width in CSS pixels. The height follows the asset's own proportions. */
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
  const source = variant === 'lockup' ? lockup : mark
  return (
    <Image
      src={source}
      alt={alt}
      width={size}
      // From the file rather than a constant, so a re-cut of a different shape still lands
      // undistorted. Neither asset is square.
      height={Math.round((size * source.height) / source.width)}
      sizes={`${size}px`}
      className={cn('shrink-0', className)}
    />
  )
}
