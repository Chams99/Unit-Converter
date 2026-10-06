import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

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
      { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
      { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} ${inter.className}`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
