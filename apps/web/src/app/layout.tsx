import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

import { ThemeProvider } from '@/components/theme'
import { TooltipProvider } from '@/components/ui/overlays'

import './globals.css'

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
          <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
          <Toaster position="bottom-right" closeButton richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
