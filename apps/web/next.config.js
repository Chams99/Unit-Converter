const path = require('node:path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep only traced runtime files in the production container.
  output: 'standalone',
  // This app imports workspace packages outside apps/web.
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  // Keep audit/preview builds isolated from a running development server.
  // The normal output remains `.next` unless NEXT_DIST_DIR is provided.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@simple-units/conversion'],
  agentRules: false,
  typescript: { ignoreBuildErrors: false },
  async rewrites() {
    const apiUrl = process.env.CONVERTAL_API_URL ?? 'http://localhost:8787'
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }]
  },
}

module.exports = nextConfig
