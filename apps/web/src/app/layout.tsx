import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

import { NavigationTrail } from '@/components/layout/navigation-trail'
import { ThemeProvider } from '@/components/theme'
import { TooltipProvider } from '@/components/ui/overlays'

import './globals.css'

// The favicon is `src/app/icon.png`, which Next finds by name and links itself (P9-01). The
// Logo component imports that same file, so the tab and the headers cannot drift apart.
export const metadata: Metadata = {
  title: 'Agent Blueprint',
  description: 'Design once. Test it. Compile it everywhere.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes writes the class on <html> before paint; suppress the mismatch warning.
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-dvh font-sans">
        <ThemeProvider>
          {/* Renders nothing. It counts route changes, so a back control can tell whether the
              entry behind it belongs to this app; it has to sit above every route to see
              all of them. */}
          <NavigationTrail />
          <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
          <Toaster position="bottom-right" closeButton richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
