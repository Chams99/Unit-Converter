/** @type {import('next').NextConfig} */
const nextConfig = {
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
