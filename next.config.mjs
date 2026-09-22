/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The scan reads Gmail and writes Supabase; nothing here should be cached.
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
