/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@class-feedback/ui", "@class-feedback/contracts"],
};

module.exports = nextConfig;
