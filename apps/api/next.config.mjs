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
  // Force-include sharp's native libs. File tracing follows the `.node` addon but CANNOT see the
  // `libvips-cpp.so` it `dlopen`s at runtime. Under pnpm the addon (@img/sharp-linux-x64) resolves libvips
  // through a SIBLING SYMLINK in its own @img dir
  // (@img+sharp-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64 -> the libvips package), so we must
  // include BOTH the addon's @img subtree (the symlink) AND the libvips package itself (the target). With
  // only the target, dlopen still failed (`libvips-cpp.so: cannot open shared object file`) and ALL image
  // post-processing silently no-op'd — rotated rooms, no coverage tiling, null result dims.
  // `/internal/sharp-check` loads sharp the same way so the binary's presence is verifiable without a
  // (billed) generation. The Inngest route is the only one that runs the full image pipeline.
  outputFileTracingIncludes: {
    '/internal/inngest': [
      '../../node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/**',
      '../../node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/**',
    ],
    '/internal/sharp-check': [
      '../../node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/**',
      '../../node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/**',
    ],
  },
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
