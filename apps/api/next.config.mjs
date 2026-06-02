/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API surface is route handlers only; we lint via the root ESLint flat config.
  eslint: { ignoreDuringBuilds: true },
  // Workspace packages are transpiled on demand.
  transpilePackages: ['@lumina/shared', '@lumina/db'],
};

export default nextConfig;
