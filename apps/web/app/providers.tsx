'use client'

import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "next-themes"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme>
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  )
}
