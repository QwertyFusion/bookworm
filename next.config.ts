import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/sign-in',
        destination: '/api/auth/login',
        permanent: true,
      },
      {
        source: '/sign-up',
        destination: '/api/auth/register',
        permanent: true,
      },
      {
        source: '/sign-out',
        destination: '/api/auth/logout',
        permanent: true,
      },
    ]
  },
  /* config options here */
  webpack: (config, {buildId, dev, isServer, defaultLoaders, webpack}) => {
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  }
};

export default nextConfig;
