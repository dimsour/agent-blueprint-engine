import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source; Next compiles them.
  transpilePackages: [
    '@agent-blueprint/core',
    '@agent-blueprint/exporters',
    '@agent-blueprint/ai',
    '@agent-blueprint/templates',
  ],
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
