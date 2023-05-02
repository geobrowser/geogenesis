// eslint-disable-next-line @typescript-eslint/no-var-requires
const analyzer = require('@next/bundle-analyzer');

const withBundleAnalyzer = analyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // reactStrictMode: true,
  swcMinify: true,
  // experimental: {
  //   runtime: 'experimental-edge',
  // },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/early-access',
        destination: 'https://forms.gle/yZwahT6GoYcjNK2Y6',
        permanent: false,
      },
      {
        source: '/future-thinkers',
        destination: 'https://forms.gle/WkgcmQhnqKACXeQW6',
        permanent: false,
      },
      {
        source: '/we-heart-sf',
        destination: 'https://forms.gle/8BN2VrZZieeYnkMd9',
        permanent: false,
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
