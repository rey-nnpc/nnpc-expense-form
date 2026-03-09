import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        destination: "/dashboard",
        permanent: false,
        source: "/",
      },
    ];
  },
};

export default nextConfig;
