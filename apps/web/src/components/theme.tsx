'use client'

import { MoonIcon, SunIcon } from 'lucide-react'
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes'
import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemeProvider>) {
  return (
    <NextThemeProvider
      attribute="class"
      // The UI namespace from docs/08, kept clear of anything that could hold a secret.
      storageKey="ab:ui:theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemeProvider>
  )
}

export function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle dark mode"
      onClick={() =>
        setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
      }
    >
      {/*
        Which icon is right depends on the theme, which the server does not know. Rendering
        both and letting CSS choose avoids a hydration mismatch without a mounted flag.
      */}
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  )
}
