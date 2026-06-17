import { fileURLToPath } from 'node:url';

// Monorepo root — so Next's output file tracing follows pnpm's symlinked node_modules and copies
// `sharp` + its native libvips siblings (@img/sharp-*) into the serverless function bundle.
const monorepoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API surface is route handlers only; we lint via the root ESLint flat config.
  eslint: { ignoreDuringBuilds: true },
  // Workspace packages are transpiled on demand.
  transpilePackages: ['@lumina/shared', '@lumina/db'],
  // `sharp` is a native module: it must be required from node_modules at runtime, never bundled into a
  // Next chunk. Bundling it broke `dlopen` of libvips on Vercel (ERR_DLOPEN_FAILED:
  // libvips-cpp.so.*) and silently disabled all image post-processing. Externalising keeps the native
  // binary loadable; file tracing (with the monorepo root below) copies it into the function.
  serverExternalPackages: ['sharp'],
  outputFileTracingRoot: monorepoRoot,
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
