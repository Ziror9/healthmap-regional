/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Packages internos do monorepo sao consumidos como codigo-fonte TypeScript.
  transpilePackages: ['@healthmap/contracts'],
};

export default nextConfig;
