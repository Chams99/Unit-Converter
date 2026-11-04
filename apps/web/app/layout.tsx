import type { Metadata, Viewport } from 'next'
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

// Atkinson Hyperlegible keeps look-alike glyphs (0/O, 1/l/I, 5/S) distinct, which matters when reading results.
// next/font has no fallback metrics for these families; globals.css defines size-matched local fallbacks.
const sans = Atkinson_Hyperlegible_Next({ subsets: ['latin'], variable: '--font-sans', adjustFontFallback: false, fallback: ['Atkinson Next Fallback', 'Arial', 'sans-serif'] })
const mono = Atkinson_Hyperlegible_Mono({ subsets: ['latin'], variable: '--font-mono', adjustFontFallback: false, fallback: ['Atkinson Mono Fallback', 'Courier New', 'monospace'] })

const title = 'Universal Convertal — precise tools for everyday work'
const description = 'Units, currency, developer, and bounded image conversion tools with clear results and honest context.'
// Link previews need an absolute image URL; deployments pass their public origin at build time.
const siteUrl = process.env.CONVERTAL_SITE_URL

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title,
  description,
  // app/opengraph-image.png supplies the preview image; regenerate it with `pnpm --filter @universal-convertal/web cover`.
  openGraph: { type: 'website', siteName: 'Universal Convertal', title, description },
  twitter: { card: 'summary_large_image', title, description },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
      { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
      { media: '(prefers-color-scheme: dark)', color: '#111317' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} ${sans.className}`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
