import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
        port: "",
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  experimental: {
    // optimizeCss: true, // Note: optimizing CSS might require critical package, enabling if user insists
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async headers() {
    return [
      {
        source: '/:path*.{js,css,woff2}',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
