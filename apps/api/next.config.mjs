/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API surface is route handlers only; we lint via the root ESLint flat config.
  eslint: { ignoreDuringBuilds: true },
  // Workspace packages are transpiled on demand.
  transpilePackages: ['@lumina/shared', '@lumina/db'],
  // Resolve NodeNext-style `.js` relative imports (used for tsc/vitest) to their `.ts` sources.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
