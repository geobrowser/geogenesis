// eslint-disable-next-line @typescript-eslint/no-var-requires
// const analyzer = require('@next/bundle-analyzer');

// const withBundleAnalyzer = analyzer({
//   enabled: process.env.ANALYZE === 'true',
// });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // reactStrictMode: true,
  experimental: {
    reactCompiler: true,
  },
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
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
        source: '/spaces',
        destination: '/root',
        permanent: false,
      },

      {
        // governing public knowledge
        source: '/space/0x2B5357e08aE291848Ff467eB1a8239d2e392bef5/c714d348-c4a5-44be-bd3c-fe56f241b0eb',
        destination: '/space/6tfhqywXtteatMeGUtd5EB/5WHP8BuoCdSiqtfy87SYWG',
        permanent: true,
      },
      {
        // grc-20
        source: '/space/0x2B5357e08aE291848Ff467eB1a8239d2e392bef5/54337cb3-55e7-4d2a-952b-b328aa3a1d58',
        destination: '/space/6tfhqywXtteatMeGUtd5EB/5FkVvS4mTz6Ge7wHkAUMRk',
        permanent: true,
      },
      {
        // knowledge graphs are web3
        source: '/space/0x2B5357e08aE291848Ff467eB1a8239d2e392bef5/0e42984f-bf78-4f52-8b1e-4f04af6611b5',
        destination: '/space/6tfhqywXtteatMeGUtd5EB/XYo6aR3VqFQSEcf6AeTikW',
        permanent: true,
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
      {
        source: '/join',
        destination: 'https://www.geobrowser.io/',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          destination: 'https://geo.framer.website/',
        },
        {
          source: '/early-access',
          destination: 'https://geobrowser-v2.vercel.app/early-access',
        },
        {
          source: '/ending-homelessness',
          destination: 'https://geo.framer.website/ending-homelessness',
        },
        {
          source: '/blog',
          destination: 'https://geo-blog.vercel.app',
        },
        {
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: 'testnet.geobrowser.io',
            },
          ],
          destination: 'https://geogenesis-git-feat-testnet-geo-browser.vercel.app/:path*',
        },
        {
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: 'podcasts.geobrowser.io',
            },
          ],
          destination: 'https://pod-pi.vercel.app/:path*',
        },
      ],
      afterFiles: [],
      fallback: [
        // Fallback for any assets that don't exist in the Next.js app
        // This will catch marketing site assets without conflicting with /api or /public
        {
          source: '/:path*',
          destination: 'https://geobrowser-v2.vercel.app/:path*',
        },
      ],
    };
  },
};

module.exports = nextConfig;
